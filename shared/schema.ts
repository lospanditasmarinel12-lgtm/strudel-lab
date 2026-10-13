export interface Project {
  id: string;
  name: string;
  code: string;
  bpm: number;
  createdAt: number;
  updatedAt: number;
}

export interface CodeSnapshot {
  id: string;
  sessionId: string;
  entityId: string;
  timestamp: number;
  code: string;
  actionType: 'edit' | 'evaluate' | 'play' | 'stop' | 'bpm_change';
  baseSnapshotId?: string;  // if set, `code` is JSON-encoded line-diff ops
}

export interface TrackModifier {
  name: string;
  value: number;
  lineIndex: number;
}

export interface ParsedTrack {
  name: string;
  category: 'drums' | 'bass' | 'melodic' | 'ambient' | 'fx' | 'custom';
  color: string;
  events: TrackEvent[];
  modifiers: TrackModifier[];
}

export interface TrackEvent {
  id?: string;
  startMs: number;
  endMs: number;
  code: string;
}

export interface RecordingSession {
  id: string;
  projectId: string;
  name: string;
  bpm: number;
  duration: number;
  audioBlob: Blob;
  snapshots: CodeSnapshot[];
  tracks: ParsedTrack[];
  createdAt: number;
  /** Full monolithic code at the moment recording stopped (used for Song export). */
  finalCode?: string;
}

export interface TrackCategory {
  drums: { color: string; label: string };
  bass: { color: string; label: string };
  melodic: { color: string; label: string };
  ambient: { color: string; label: string };
  fx: { color: string; label: string };
  custom: { color: string; label: string };
}

export const TRACK_CATEGORIES: TrackCategory = {
  drums: { color: '#ef4444', label: 'Drums' },
  bass: { color: '#3b82f6', label: 'Bass' },
  melodic: { color: '#22c55e', label: 'Melodic' },
  ambient: { color: '#a855f7', label: 'Ambient' },
  fx: { color: '#f59e0b', label: 'FX' },
  custom: { color: '#14b8a6', label: 'Custom' },
};

export const DRUM_SAMPLES = ['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'crash', 'ride', 'clap', 'tom'];
export const MELODIC_SAMPLES = ['piano', 'rhodes', 'lead', 'pad', 'pluck', 'bell', 'arp', 'organ'];
export const BASS_SAMPLES = ['bass', 'subbass', 'reese', 'wobble', 'acid'];
export const AMBIENT_SAMPLES = ['wind', 'rain', 'noise', 'vinyl', 'atmosphere', 'drone'];
export const SYNTH_SAMPLES = ['sawtooth', 'square', 'triangle', 'sine'];
