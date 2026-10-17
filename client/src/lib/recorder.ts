import { nanoid } from 'nanoid';
import {
  evaluateStrudelCode,
  stopStrudel,
  getStrudelAudioContext,
  getSuperdoughDestination,
} from './strudel-engine';
import { parseEntities } from './timeline-parser';
import { diffToPatch } from './diff';
import type { CodeSnapshot } from '@shared/schema';

const ENTITY_INACTIVITY_MS = 3000;
// Store a full-code "keyframe" snapshot at least this often so diff chains stay
// short and remain recoverable. Between keyframes we store sparse splice patches.
const KEYFRAME_EVERY_SNAPSHOTS = 50;
const KEYFRAME_EVERY_MS = 30000;
// Store a patch only when it is meaningfully smaller than the full code.
const DIFF_RATIO = 0.6;

interface EntityTracker {
  entityId: string;
  lastCode: string;
  lastSnapshottedCode: string;
  lastChangeTime: number;
  lastSnapshotTime: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class SessionRecorder {
  recording = false;
  paused = false;
  startTime = -1;
  elapsedBeforePause = 0;
  pauseStartTime = 0;
  bpm = 120;
  projectId = '';

  private snapshots: Omit<CodeSnapshot, 'sessionId'>[] = [];
  private entities: Map<string, EntityTracker> = new Map();
  private audioChunks: Blob[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  // Global diff chain: each snapshot patches the previous stored full code.
  private lastStoredCode = '';
  private lastStoredId: string | undefined;
  private snapshotsSinceKeyframe = 0;
  private lastKeyframeTime = 0;
  // Most recent editor content, used for Song export.
  private lastFullCode = '';

  reset(): void {
    this.stopRecording();
    this.snapshots = [];
    this.entities.clear();
    this.audioChunks = [];
    this.recording = false;
    this.paused = false;
    this.startTime = -1;
    this.elapsedBeforePause = 0;
    this.pauseStartTime = 0;
    this.lastStoredCode = '';
    this.lastStoredId = undefined;
    this.snapshotsSinceKeyframe = 0;
    this.lastKeyframeTime = 0;
    this.lastFullCode = '';
  }

  async startRecording(projectId: string, bpm: number, currentCode: string): Promise<void> {
    this.reset();
    this.recording = true;
    this.startTime = performance.now();
    this.bpm = bpm;
    this.projectId = projectId;
    this.lastFullCode = currentCode;

    const ctx = getStrudelAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      this.streamDest = ctx.createMediaStreamDestination();

      try {
        const recorder = new MediaRecorder(this.streamDest.stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };
        recorder.start(1000);
        this.mediaRecorder = recorder;
      } catch (e) {
        // console.warn('[Recorder] MediaRecorder setup failed:', e);
      }

      try {
        const destGain = getSuperdoughDestination();
        if (destGain) {
          destGain.connect(this.streamDest);
        }
      } catch (e) {
        // console.warn('[Recorder] Could not tap superdough output:', e);
      }
    }

    const entities = parseEntities(currentCode);
    for (const entity of entities) {
      const entityCode = entity.codeLines.join('\n');
      const tracker: EntityTracker = {
        entityId: entity.id,
        lastCode: entityCode,
        lastSnapshottedCode: entityCode,
        lastChangeTime: this.nowMs(),
        lastSnapshotTime: this.nowMs(),
        timer: null,
      };
      this.entities.set(entity.id, tracker);
      this.addSnapshot(tracker.entityId, currentCode, 'edit');
    }

    if (this.timelineEngine) {
      this.timelineEngine.clear();
      this.timelineEngine.mode = 'recording';
      this.timelineEngine.bpm = bpm;
      this.timelineEngine.duration = 0;
      this.timelineEngine.currentTime = 0;
    }
  }

  stopRecording(): { audioBlob: Blob; duration: number; finalCode: string } {
    this.paused = false;
    this.commitAllEntities();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.streamDest) {
      try {
        const destGain = getSuperdoughDestination();
        if (destGain) {
          destGain.disconnect(this.streamDest);
        }
        this.streamDest.disconnect();
      } catch {}
      this.streamDest = null;
    }

    const duration = this.getElapsedMs();
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

    this.recording = false;

    if (this.timelineEngine) {
      this.timelineEngine.mode = 'idle';
      this.timelineEngine.duration = duration;
    }

    return { audioBlob, duration, finalCode: this.getFinalCode() };
  }

  pauseRecording(): void {
    if (!this.recording || this.paused) return;
    this.paused = true;
    this.commitAllEntities();
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
    this.pauseStartTime = this.nowMs();
  }

  resumeRecording(): void {
    if (!this.recording || !this.paused) return;
    this.paused = false;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  handleCodeChange(fullCode: string): void {
    if (!this.recording || this.paused) return;
    this.lastFullCode = fullCode;

    const entities = parseEntities(fullCode);
    const currentEntityIds = new Set(entities.map(e => e.id));

    // Prune trackers for entities that no longer exist. Their history is already
    // in `this.snapshots`; keeping them would let a deleted section resurrect in
    // later committed snapshots.
    for (const [id, tracker] of [...this.entities]) {
      if (!currentEntityIds.has(id)) {
        if (tracker.timer) {
          clearTimeout(tracker.timer);
          tracker.timer = null;
        }
        this.entities.delete(id);
      }
    }

    for (const entity of entities) {
      const newCode = entity.codeLines.join('\n');
      const existing = this.entities.get(entity.id);

      if (!existing) {
        const tracker: EntityTracker = {
          entityId: entity.id,
          lastCode: newCode,
          lastSnapshottedCode: newCode,
          lastChangeTime: this.nowMs(),
          lastSnapshotTime: this.nowMs(),
          timer: null,
        };
        this.entities.set(entity.id, tracker);
        this.addSnapshot(entity.id, fullCode, 'edit');
      } else if (existing.lastCode !== newCode) {
        existing.lastCode = newCode;
        if (existing.timer) clearTimeout(existing.timer);
        existing.lastChangeTime = this.nowMs();
        existing.timer = setTimeout(() => {
          const t = this.entities.get(entity.id);
          if (t && this.nowMs() - t.lastChangeTime >= ENTITY_INACTIVITY_MS) {
            this.addSnapshot(entity.id, fullCode, 'edit');
            t.lastSnapshottedCode = t.lastCode;
            t.lastSnapshotTime = this.nowMs();
          }
        }, ENTITY_INACTIVITY_MS);
      }
    }
  }

  handleAction(fullCode: string, actionType: 'evaluate' | 'play' | 'stop' | 'bpm_change'): void {
    if (!this.recording || this.paused) return;
    this.lastFullCode = fullCode;
    this.commitAllEntities();
    const entityId = 'action-' + nanoid(6);
    this.addSnapshot(entityId, fullCode, actionType);

    if (actionType === 'stop') {
      stopStrudel();
    }
    if (actionType === 'play') {
      evaluateStrudelCode(fullCode).catch(console.error);
    }
  }

  commitAllEntities(): void {
    if (!this.recording) return;
    // Use the latest editor code, not a reconstruction from the entity map, so
    // committed snapshots can never contain stale/deleted code.
    const fullCode = this.lastFullCode || this.getCurrentCode();
    for (const [entityId, tracker] of this.entities) {
      if (tracker.timer) {
        clearTimeout(tracker.timer);
        tracker.timer = null;
      }
      if (tracker.lastCode !== tracker.lastSnapshottedCode) {
        this.addSnapshot(entityId, fullCode, 'edit');
        tracker.lastSnapshottedCode = tracker.lastCode;
        tracker.lastSnapshotTime = this.nowMs();
      }
    }
  }

  getSnapshots(): Omit<CodeSnapshot, 'sessionId'>[] {
    return [...this.snapshots].sort((a, b) => a.timestamp - b.timestamp);
  }

  getFinalCode(): string {
    return this.lastFullCode || this.getCurrentCode();
  }

  /** Single monotonic clock source for all recorder timing (debounce + elapsed). */
  private nowMs(): number {
    return performance.now();
  }

  getElapsedMs(): number {
    if (this.startTime < 0) return 0;
    return Math.round(performance.now() - this.startTime);
  }

  private timelineEngine?: import('./timeline-engine').TimelineEngine;

  attachTimelineEngine(engine: import('./timeline-engine').TimelineEngine): void {
    this.timelineEngine = engine;
  }

  private getCurrentCode(): string {
    const codes = Array.from(this.entities.values()).map(t => t.lastCode);
    return codes.join('\n\n');
  }

  private getSnapshotCode(entityId: string): string {
    const lastSnap = [...this.snapshots].reverse().find(s => s.entityId === entityId);
    return lastSnap?.code ?? '';
  }

  private addSnapshot(entityId: string, code: string, actionType: CodeSnapshot['actionType']): void {
    const id = nanoid();
    const elapsed = this.getElapsedMs();
    const needKeyframe =
      !this.lastStoredId ||
      this.snapshotsSinceKeyframe >= KEYFRAME_EVERY_SNAPSHOTS ||
      elapsed - this.lastKeyframeTime >= KEYFRAME_EVERY_MS;

    let snapshotCode = code;
    let baseSnapshotId: string | undefined;

    if (!needKeyframe && this.lastStoredId) {
      try {
        const patch = diffToPatch(this.lastStoredCode, code);
        const patchStr = JSON.stringify(patch);
        if (patch.length === 0) {
          // Identical code (e.g. multiple entities captured at t=0): a no-op patch.
          snapshotCode = '[]';
          baseSnapshotId = this.lastStoredId;
        } else if (patchStr.length < code.length * DIFF_RATIO) {
          snapshotCode = patchStr;
          baseSnapshotId = this.lastStoredId;
        }
      } catch {
        baseSnapshotId = undefined;
      }
    }

    if (baseSnapshotId) {
      this.snapshotsSinceKeyframe++;
    } else {
      this.snapshotsSinceKeyframe = 0;
      this.lastKeyframeTime = elapsed;
    }
    this.lastStoredCode = code;
    this.lastStoredId = id;

    this.snapshots.push({
      id,
      entityId,
      timestamp: elapsed,
      code: snapshotCode,
      actionType,
      baseSnapshotId,
    } as Omit<CodeSnapshot, 'sessionId'>);
    if (this.snapshots.length > 5000) {
      this.snapshots.splice(0, this.snapshots.length - 5000);
    }
  }
}

export const globalRecorder = new SessionRecorder();
