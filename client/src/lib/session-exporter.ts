import type { RecordingSession, CodeSnapshot, Project } from '@shared/schema';
import { createSession } from '@/lib/stores/session-store';
import { createProject } from '@/lib/stores/project-store';
import { db, type CustomSample } from '@/lib/stores/db';
import { resolveSnapshotCodes } from '@/lib/timeline-parser';
import { extractBankNames, importCustomSample } from '@/lib/sample-registry';

export interface ExportedSample {
  name: string;
  mime: string;
  data: string;
}

export interface ExportedSnapshot {
  id?: string;
  entityId: string;
  timestamp: number;
  code: string;
  actionType: string;
  baseSnapshotId?: string;
}

/** Structured representation of a monolithic, runnable Song file. */
export interface SongData {
  title: string;
  bpm: number;
  createdAt: number;
  sources: string[];
  samples: ExportedSample[];
  code: string;
}

export interface LiveSessionFile {
  kind: 'live-session';
  version: number;
  name: string;
  bpm: number;
  duration: number;
  createdAt: number;
  sources: string[];
  samples: ExportedSample[];
  finalCode?: string;
  snapshots: ExportedSnapshot[];
}

export function isCodeSession(session: RecordingSession): boolean {
  return !session.audioBlob || session.audioBlob.size === 0;
}

export function isCodeSessionSafe(session: Partial<RecordingSession>): boolean {
  return !session.audioBlob || session.audioBlob.size === 0;
}

// ---------------------------------------------------------------------------
// Binary <-> base64 helpers (browser-safe)
// ---------------------------------------------------------------------------

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'audio/wav' });
}

// ---------------------------------------------------------------------------
// Sample / source discovery
// ---------------------------------------------------------------------------

const SAMPLE_REF_PATTERNS = [
  /\bs\(\s*["']([^"']+)["']\s*\)/g,
  /\.s\(\s*["']([^"']+)["']\s*\)/g,
  /\bsound\(\s*["']([^"']+)["']\s*\)/g,
  /\.sound\(\s*["']([^"']+)["']\s*\)/g,
];

/** Extract candidate sample names referenced via s()/sound() in code. */
export function extractReferencedSampleNames(code: string): string[] {
  const names = new Set<string>();
  for (const pattern of SAMPLE_REF_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      for (const token of match[1].split(/[\s,]+/)) {
        const clean = token.replace(/[~*\[\]<>()!@/\d]/g, '').trim();
        if (clean) names.add(clean);
      }
    }
  }
  return Array.from(names);
}

async function collectReferencedCustomSamples(code: string): Promise<CustomSample[]> {
  const names = extractReferencedSampleNames(code);
  if (names.length === 0) return [];
  try {
    const found = await db.customSamples.bulkGet(names);
    return found.filter((s): s is CustomSample => !!s);
  } catch {
    return [];
  }
}

function collectSources(code: string, samples: CustomSample[]): string[] {
  const sources = new Set<string>(extractBankNames(code));
  for (const s of samples) {
    if (s.originalUrl) sources.add(s.originalUrl);
  }
  return Array.from(sources);
}

async function toExportedSamples(samples: CustomSample[]): Promise<ExportedSample[]> {
  const out: ExportedSample[] = [];
  for (const s of samples) {
    try {
      out.push({
        name: s.name,
        mime: s.audioData.type || 'audio/wav',
        data: await blobToBase64(s.audioData),
      });
    } catch {
      // skip undecodable sample rather than failing the whole export
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Song (Track A): a single runnable .strudel script
// ---------------------------------------------------------------------------

const CODE_MARKER = '// @code';

export function buildSongScript(data: SongData): string {
  const lines: string[] = [];
  lines.push('// @kind song');
  lines.push('// @version 1');
  lines.push(`// @title ${JSON.stringify(data.title)}`);
  lines.push(`// @bpm ${data.bpm}`);
  lines.push(`// @created ${data.createdAt}`);
  if (data.sources.length > 0) lines.push(`// @sources ${data.sources.join(', ')}`);
  if (data.samples.length > 0) {
    lines.push('samples({');
    for (const s of data.samples) {
      lines.push(`  ${JSON.stringify(s.name)}: ["data:${s.mime};base64,${s.data}"],`);
    }
    lines.push('})');
  }
  lines.push(CODE_MARKER);
  lines.push(data.code);
  return lines.join('\n');
}

export function parseSongScript(text: string): SongData {
  const meta: Record<string, string> = {};
  const headerRe = /^\/\/\s*@(\w+)[ \t]?(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    if (!(m[1] in meta)) meta[m[1]] = m[2].trim();
  }

  let code = text;
  let hasMarker = false;
  const markerIdx = text.indexOf(CODE_MARKER);
  if (markerIdx >= 0) {
    hasMarker = true;
    code = text.slice(markerIdx + CODE_MARKER.length).replace(/^\r?\n/, '');
  }

  const samples: ExportedSample[] = [];
  const sampleRe = /"([^"]+)"\s*:\s*\[\s*"data:([^;"]+);base64,([^"]+)"\s*\]/g;
  let sm: RegExpExecArray | null;
  while ((sm = sampleRe.exec(text)) !== null) {
    samples.push({ name: sm[1], mime: sm[2], data: sm[3] });
  }

  let title = 'Imported Song';
  if (meta.title) {
    try {
      title = JSON.parse(meta.title);
    } catch {
      title = meta.title;
    }
  }

  return {
    title,
    bpm: meta.bpm ? Number(meta.bpm) || 120 : 120,
    createdAt: meta.created ? Number(meta.created) || Date.now() : Date.now(),
    sources: meta.sources ? meta.sources.split(',').map(s => s.trim()).filter(Boolean) : [],
    samples,
    code: hasMarker ? code.trim() : text,
  };
}

export async function exportSongAsFile(session: RecordingSession, snapshots: CodeSnapshot[]): Promise<void> {
  const resolved = resolveSnapshotCodes(snapshots);
  const finalCode = session.finalCode || resolved[resolved.length - 1]?.code || '';
  const customs = await collectReferencedCustomSamples(finalCode);
  const data: SongData = {
    title: session.name,
    bpm: session.bpm,
    createdAt: session.createdAt,
    sources: collectSources(finalCode, customs),
    samples: await toExportedSamples(customs),
    code: finalCode,
  };
  downloadText(`${safeFileName(session.name)}.strudel`, buildSongScript(data), 'text/plain');
}

export async function importSongFromFile(): Promise<Project> {
  const file = await pickFile('.strudel,.txt,.json,text/plain');
  const text = await file.text();
  const data = parseSongScript(text);
  for (const s of data.samples) {
    await importCustomSample(s.name, base64ToBlob(s.data, s.mime), s.mime);
  }
  const name = data.title || file.name.replace(/\.[^.]+$/, '') || 'Imported Song';
  return createProject({ name, code: data.code, bpm: data.bpm });
}

// ---------------------------------------------------------------------------
// Live session (Track B): the performance timeline, re-enacted
// ---------------------------------------------------------------------------

export async function exportLiveSessionAsFile(session: RecordingSession, snapshots: CodeSnapshot[]): Promise<void> {
  const resolved = resolveSnapshotCodes(snapshots);
  const allCode = resolved.map(s => s.code).join('\n');
  const customs = await collectReferencedCustomSamples(allCode);
  const data: LiveSessionFile = {
    kind: 'live-session',
    version: 2,
    name: session.name,
    bpm: session.bpm,
    duration: session.duration,
    createdAt: session.createdAt,
    sources: collectSources(allCode, customs),
    samples: await toExportedSamples(customs),
    finalCode: session.finalCode,
    // Preserve the raw patch chain (id + baseSnapshotId) so re-enactment is faithful.
    snapshots: snapshots.map(s => ({
      id: s.id,
      entityId: s.entityId,
      timestamp: s.timestamp,
      code: s.code,
      actionType: s.actionType,
      baseSnapshotId: s.baseSnapshotId,
    })),
  };
  downloadText(`${safeFileName(session.name)}.strudel.live.json`, JSON.stringify(data, null, 2), 'application/json');
}

const VALID_ACTIONS = new Set(['edit', 'evaluate', 'play', 'stop', 'bpm_change']);

export async function importLiveSessionFromFile(): Promise<RecordingSession> {
  const file = await pickFile('.json,application/json');
  const text = await file.text();
  const data = JSON.parse(text) as Partial<LiveSessionFile>;
  if (!data || !Array.isArray(data.snapshots)) {
    throw new Error('Invalid live session file');
  }

  for (const s of data.samples || []) {
    await importCustomSample(s.name, base64ToBlob(s.data, s.mime), s.mime);
  }

  const snapshots = data.snapshots.map(s => ({
    id: s.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    entityId: s.entityId || '',
    timestamp: Number(s.timestamp) || 0,
    code: String(s.code ?? ''),
    actionType: (VALID_ACTIONS.has(s.actionType) ? s.actionType : 'edit') as CodeSnapshot['actionType'],
    baseSnapshotId: s.baseSnapshotId || undefined,
  }));

  return createSession({
    projectId: 'imported',
    name: data.name || 'Imported Live Set',
    bpm: data.bpm ?? 120,
    duration: data.duration ?? 0,
    audioBlob: new Blob([], { type: 'audio/wav' }),
    snapshots,
    tracks: [],
    finalCode: data.finalCode,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_') || 'session';
}

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    let settled = false;

    const cleanup = () => window.removeEventListener('focus', onFocus);
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          settled = true;
          cleanup();
          reject(new Error('File selection cancelled'));
        }
      }, 500);
    };

    input.onchange = () => {
      settled = true;
      cleanup();
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new Error('No file selected'));
    };

    window.addEventListener('focus', onFocus);
    input.click();
  });
}
