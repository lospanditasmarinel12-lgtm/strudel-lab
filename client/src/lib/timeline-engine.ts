import { nanoid } from 'nanoid';

export type TimelineMode = 'idle' | 'recording' | 'playing' | 'paused' | 'editing';

export interface TimelineEvent {
  id: string;
  trackId: string;
  startMs: number;
  endMs: number;
  code: string;
  entityName: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  category: string;
  color: string;
  events: TimelineEvent[];
}

export interface TimelineConfig {
  bpm: number;
  timeSignature: [number, number];
}

export class TimelineEngine {
  mode: TimelineMode = 'idle';
  duration: number = 0;
  currentTime: number = 0;
  bpm: number;
  timeSignature: [number, number];
  tracks: TimelineTrack[] = [];
  snapshots: { timestamp: number; code: string; entityId: string }[] = [];
  loopRegion: { start: number; end: number } | null = null;
  quantization: number = 4;

  private _onTick: ((time: number) => void) | null = null;

  constructor(config: TimelineConfig) {
    this.bpm = config.bpm;
    this.timeSignature = config.timeSignature;
  }

  set onTick(cb: ((time: number) => void) | null) {
    this._onTick = cb;
  }

  tick(deltaMs: number): void {
    if (this.mode === 'idle' || this.mode === 'paused') return;
    if (deltaMs < 0) return;

    this.currentTime += deltaMs;
    if (this.loopRegion && this.currentTime >= this.loopRegion.end) {
      this.currentTime = this.loopRegion.start;
    }
    if (this.duration > 0 && this.currentTime >= this.duration) {
      this.currentTime = this.duration;
      this.mode = 'paused';
    }
    this._onTick?.(this.currentTime);
  }

  seekTo(ms: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration || ms, ms));
  }

  addTrack(track: TimelineTrack): void {
    if (!this.tracks.find(t => t.id === track.id)) {
      this.tracks.push(track);
    }
  }

  addEvent(trackId: string, startMs: number, endMs: number, code: string): TimelineEvent {
    const event: TimelineEvent = {
      id: nanoid(),
      trackId,
      startMs,
      endMs,
      code,
      entityName: '',
    };
    const track = this.tracks.find(t => t.id === trackId);
    if (track) track.events.push(event);
    return event;
  }

  removeEvent(eventId: string): void {
    for (const track of this.tracks) {
      const idx = track.events.findIndex(e => e.id === eventId);
      if (idx !== -1) {
        track.events.splice(idx, 1);
        return;
      }
    }
  }

  moveEvent(eventId: string, newStartMs: number): void {
    for (const track of this.tracks) {
      const event = track.events.find(e => e.id === eventId);
      if (event) {
        const duration = event.endMs - event.startMs;
        event.startMs = newStartMs;
        event.endMs = newStartMs + duration;
        return;
      }
    }
  }

  resizeEvent(eventId: string, newEndMs: number): void {
    for (const track of this.tracks) {
      const event = track.events.find(e => e.id === eventId);
      if (event) {
        event.endMs = Math.max(newEndMs, event.startMs + 100);
        return;
      }
    }
  }

  getCodeAt(ms: number): string {
    const sorted = [...this.snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const reversed = [...sorted].reverse();
    const last = reversed.find(s => s.timestamp <= ms);
    return last?.code || '// empty';
  }

  clear(): void {
    this.mode = 'idle';
    this.currentTime = 0;
    this.duration = 0;
    this.tracks = [];
    this.snapshots = [];
    this.loopRegion = null;
  }
}
