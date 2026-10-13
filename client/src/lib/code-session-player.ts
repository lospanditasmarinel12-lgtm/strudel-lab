import { evaluateStrudelCode, stopStrudel } from './strudel-engine';

export type CodePlayerState = 'idle' | 'playing' | 'paused';

export interface CodeSnapshotEntry {
  timestamp: number;
  code: string;
  id?: string;
  actionType?: string;
}

export class CodeSessionPlayer {
  state: CodePlayerState = 'idle';
  currentTime: number = 0;
  duration: number = 0;
  bpm: number = 120;
  loop: boolean = false;

  private snapshots: CodeSnapshotEntry[] = [];
  private rafId: number = 0;
  private startedAt: number = 0;
  private elapsedBeforePause: number = 0;
  private lastEvalIndex: number = -1;
  private destroyed: boolean = false;

  onTimeUpdate: ((time: number) => void) | null = null;
  onCodeUpdate: ((code: string) => void) | null = null;
  onStateChange: ((state: CodePlayerState) => void) | null = null;
  onError: ((error: string) => void) | null = null;

  constructor(snapshots: CodeSnapshotEntry[], duration: number, bpm: number) {
    this.setSnapshots(snapshots);
    this.duration = duration;
    this.bpm = bpm;
  }

  setSnapshots(snapshots: CodeSnapshotEntry[]): void {
    this.snapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    this.lastEvalIndex = -1;
  }

  async play(): Promise<void> {
    if (this.state === 'playing' || this.destroyed) return;
    this.state = 'playing';
    this.startedAt = performance.now();
    this.onStateChange?.('playing');
    this.tick();
  }

  private tick(): void {
    if (this.state !== 'playing' || this.destroyed) return;
    const now = performance.now();
    const elapsed = now - this.startedAt + this.elapsedBeforePause;
    this.currentTime = Math.min(elapsed, this.duration);
    this.onTimeUpdate?.(this.currentTime);

    const currentIdx = this.findSnapshotIndex(this.currentTime);
    if (currentIdx !== this.lastEvalIndex && currentIdx >= 0 && currentIdx < this.snapshots.length) {
      this.lastEvalIndex = currentIdx;
      this.applySnapshot(this.snapshots[currentIdx]);
    }

    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.elapsedBeforePause = 0;
        this.lastEvalIndex = -1;
        if (this.snapshots.length > 0) {
          this.applySnapshot(this.snapshots[0]);
        }
        this.startedAt = performance.now();
      } else {
        this.state = 'idle';
        this.onStateChange?.('idle');
        return;
      }
    }

    this.rafId = requestAnimationFrame(() => this.tick());
  }

  /**
   * Re-enact a single recorded action: update the displayed code and perform
   * the audio action the artist originally took (`stop` hushes, `edit` is
   * visual-only, everything else re-evaluates).
   */
  private applySnapshot(snap: CodeSnapshotEntry): void {
    this.onCodeUpdate?.(snap.code);
    const action = snap.actionType ?? 'evaluate';
    if (action === 'stop') {
      stopStrudel();
      return;
    }
    if (action === 'edit') return;
    evaluateStrudelCode(snap.code).catch((err: unknown) => {
      this.onError?.(`evaluate failed at ${snap.timestamp}ms: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  pause(): void {
    if (this.state !== 'playing' || this.destroyed) return;
    this.state = 'paused';
    this.elapsedBeforePause = this.currentTime;
    this.cancelRaf();
    this.onStateChange?.('paused');
  }

  stop(): void {
    if (this.destroyed) return;
    this.state = 'idle';
    this.currentTime = 0;
    this.elapsedBeforePause = 0;
    this.lastEvalIndex = -1;
    this.cancelRaf();
    this.onStateChange?.('idle');
    this.onTimeUpdate?.(0);
  }

  async seek(ms: number): Promise<void> {
    if (this.destroyed) return;
    const target = Math.max(0, Math.min(this.duration || ms, ms));
    this.currentTime = target;
    this.elapsedBeforePause = target;
    this.lastEvalIndex = -1;
    this.onTimeUpdate?.(target);

    const idx = this.findSnapshotIndex(target);
    if (idx >= 0 && idx < this.snapshots.length) {
      this.applySnapshot(this.snapshots[idx]);
    }

    if (this.state === 'playing') {
      this.startedAt = performance.now();
    }
  }

  private findSnapshotIndex(time: number): number {
    let idx = -1;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (this.snapshots[i].timestamp <= time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }

  private cancelRaf(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelRaf();
    this.state = 'idle';
    this.onTimeUpdate = null;
    this.onCodeUpdate = null;
    this.onStateChange = null;
    this.onError = null;
  }
}
