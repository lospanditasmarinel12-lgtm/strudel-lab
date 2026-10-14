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

/**
 * Strudel Lab palette — "Phosphor / Oscilloscope".
 * Amber = controls/chrome; phosphor green = the live signal. All pairs pass WCAG AA.
 * Single source of truth shared by CSS variables, the Monaco theme, and canvas renderers.
 */
export const PALETTE = {
  bg: '#0A0C0B',
  surface: '#121816',
  surfaceLight: '#1E2A26',
  text: '#E6EFE9',
  muted: '#93A69E',
  amber: '#FFB000',
  amberLight: '#FFCB57',
  green: '#4BE38A',
  mint: '#9BE7C4',
  blue: '#6FB7FF',
  red: '#FF6B4A',
  error: '#FF5C57',
  warning: '#F5A524',
  lavender: '#E0A9FF',
  grid: '#1A2622',
  gridAlt: '#101713',
} as const;

export const TRACK_CATEGORIES: TrackCategory = {
  drums: { color: PALETTE.red, label: 'Drums' },
  bass: { color: PALETTE.amber, label: 'Bass' },
  melodic: { color: PALETTE.green, label: 'Melodic' },
  ambient: { color: PALETTE.blue, label: 'Ambient' },
  fx: { color: PALETTE.lavender, label: 'FX' },
  custom: { color: PALETTE.mint, label: 'Custom' },
};

export const DRUM_SAMPLES = ['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'crash', 'ride', 'clap', 'tom'];
export const MELODIC_SAMPLES = ['piano', 'rhodes', 'lead', 'pad', 'pluck', 'bell', 'arp', 'organ'];
export const BASS_SAMPLES = ['bass', 'subbass', 'reese', 'wobble', 'acid'];
export const AMBIENT_SAMPLES = ['wind', 'rain', 'noise', 'vinyl', 'atmosphere', 'drone'];
export const SYNTH_SAMPLES = ['sawtooth', 'square', 'triangle', 'sine'];
