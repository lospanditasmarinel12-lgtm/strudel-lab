import { DRUM_SAMPLES, MELODIC_SAMPLES, BASS_SAMPLES, AMBIENT_SAMPLES, SYNTH_SAMPLES, TRACK_CATEGORIES } from '@shared/schema';
import type { ParsedTrack, TrackEvent, TrackCategory, CodeSnapshot, TrackModifier } from '@shared/schema';
import { applyDiff, applyPatch, isSplicePatch, type DiffOp } from './diff';

export interface ParsedEntity {
  id: string;
  name: string;
  category: keyof TrackCategory;
  codeLines: string[];
  startIndex: number;
  endIndex: number;
}

const ALL_SAMPLES: Record<string, keyof TrackCategory> = {};

DRUM_SAMPLES.forEach(s => { ALL_SAMPLES[s] = 'drums'; });
MELODIC_SAMPLES.forEach(s => { ALL_SAMPLES[s] = 'melodic'; });
BASS_SAMPLES.forEach(s => { ALL_SAMPLES[s] = 'bass'; });
AMBIENT_SAMPLES.forEach(s => { ALL_SAMPLES[s] = 'ambient'; });
SYNTH_SAMPLES.forEach(s => { ALL_SAMPLES[s] = 'melodic'; });

function categorizeSample(name: string): keyof TrackCategory {
  return ALL_SAMPLES[name] ?? 'custom';
}

const parseEntitiesCache = new Map<string, ParsedEntity[]>();

/**
 * Clone cached entities so callers can never mutate the shared cache. The
 * expensive work (parsing) stays cached; only the returned structures are copied.
 */
function cloneEntities(entities: ParsedEntity[]): ParsedEntity[] {
  return entities.map((e) => ({ ...e, codeLines: [...e.codeLines] }));
}

export function parseEntities(code: string): ParsedEntity[] {
  const cached = parseEntitiesCache.get(code);
  if (cached) return cloneEntities(cached);
  const entities: ParsedEntity[] = [];
  const lines = code.split('\n');
  let currentEntity: ParsedEntity | null = null;
  let entityCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) {
      if (currentEntity) {
        currentEntity.codeLines.push(line);
        currentEntity.endIndex = i;
      }
      continue;
    }

    const isNewEntity = trimmed.startsWith('$:') || trimmed.startsWith('stack(');

    if (isNewEntity) {
      if (currentEntity) {
        entities.push(currentEntity);
      }
      entityCounter++;
      currentEntity = createEntityFromLine(trimmed, `entity-${entityCounter}`, i);
    } else if (currentEntity) {
      currentEntity.codeLines.push(line);
      currentEntity.endIndex = i;
    } else {
      entityCounter++;
      currentEntity = createEntityFromLine(trimmed, `entity-${entityCounter}`, i);
    }
  }

  if (currentEntity) {
    entities.push(currentEntity);
  }

  parseEntitiesCache.set(code, entities);
  if (parseEntitiesCache.size > 100) {
    const firstKey = parseEntitiesCache.keys().next().value;
    if (firstKey) parseEntitiesCache.delete(firstKey);
  }
  return cloneEntities(entities);
}

function createEntityFromLine(line: string, id: string, lineIndex: number): ParsedEntity {
  const sampleNames = extractSampleNames(line);
  const noteInstrument = extractNoteInstrument(line);

  let name = 'unknown';
  let category: keyof TrackCategory = 'melodic';

  if (sampleNames.length > 0) {
    name = sampleNames[0];
    category = categorizeSample(name);
  } else if (noteInstrument) {
    name = noteInstrument;
    category = categorizeSample(noteInstrument);
  } else {
    name = `track-${id}`;
  }

  return {
    id,
    name,
    category,
    codeLines: [line],
    startIndex: lineIndex,
    endIndex: lineIndex,
  };
}

function extractSampleNames(code: string): string[] {
  const sMatch = code.match(/\.s\(["']([^"']+)["']\)/);
  if (sMatch) return [sMatch[1].trim()];

  const sFuncMatch = code.match(/\bs\(["']([^"']*)["']\)/);
  if (sFuncMatch) {
    const content = sFuncMatch[1];
    return content
      .split(/[,\s]+/)
      .map(s => s.replace(/[*~\[\]<>()\d!@/]/g, '').trim())
      .filter(s => s.length > 0);
  }

  return [];
}

function extractNoteInstrument(code: string): string | null {
  const noteSMatch = code.match(/\.s\(["']([^"']+)["']\)/);
  if (noteSMatch) return noteSMatch[1].trim();
  return null;
}

export function buildTracksFromSnapshots(
  snapshots: ({ timestamp: number; code: string; entityId: string } & Partial<{ baseSnapshotId: string; id: string }>)[]
): ParsedTrack[] {
  const entityMap = new Map<string, {
    name: string;
    category: keyof TrackCategory;
    events: TrackEvent[];
    lastCode: string;
    lastStart: number;
  }>();

  const sortedSnapshots = resolveSnapshotCodes(snapshots);
  let eventCounter = 0;

  for (const snap of sortedSnapshots) {
    if (!entityMap.has(snap.entityId)) {
      const entities = parseEntities(snap.code);
      const match = entities.find(e => e.id === snap.entityId);
      if (match) {
        entityMap.set(snap.entityId, {
          name: match.name,
          category: match.category,
          events: [],
          lastCode: snap.code,
          lastStart: snap.timestamp,
        });
      }
    } else {
      const entry = entityMap.get(snap.entityId)!;
      if (entry.lastStart !== snap.timestamp) {
        entry.events.push({
          id: `evt-${++eventCounter}`,
          startMs: entry.lastStart,
          endMs: snap.timestamp,
          code: entry.lastCode,
        });
      }
      entry.lastCode = snap.code;
      entry.lastStart = snap.timestamp;
    }
  }

  const tracks: ParsedTrack[] = [];
  for (const [entityId, entry] of entityMap) {
    if (entry.lastStart !== undefined && entry.events.length > 0) {
      entry.events.push({
        id: `evt-${++eventCounter}`,
        startMs: entry.lastStart,
        endMs: entry.lastStart + 1000,
        code: entry.lastCode,
      });
    }
    const cat = TRACK_CATEGORIES[entry.category];
    tracks.push({
      name: entry.name,
      category: entry.category,
      color: cat?.color ?? '#93A69E',
      events: entry.events,
      modifiers: [],
    });
  }

  return tracks.sort((a, b) => (a.events[0]?.startMs ?? 0) - (b.events[0]?.startMs ?? 0));
}

const GAP_THRESHOLD = 500;

export function buildAdaptiveTracksFromSnapshots(
  snapshots: ({ timestamp: number; code: string; entityId: string } & Partial<{ baseSnapshotId: string; id: string }>)[]
): ParsedTrack[] {
  if (snapshots.length === 0) return [];

  const sorted = resolveSnapshotCodes(snapshots);
  let eventCounter = 0;

  const active = new Map<string, {
    lastCode: string;
    lastStart: number;
  }>();
  const trackEvents = new Map<string, TrackEvent[]>();

  function ensureTrack(name: string, category: keyof TrackCategory): void {
    if (!trackEvents.has(name)) trackEvents.set(name, []);
    if (!active.has(name)) {
      active.set(name, { lastCode: '', lastStart: -1 });
    }
  }

  function closeEvent(name: string, endMs: number): void {
    const entry = active.get(name);
    if (!entry || entry.lastStart < 0) return;
    const events = trackEvents.get(name);
    if (events && entry.lastCode) {
      events.push({
        id: `evt-${++eventCounter}`,
        startMs: entry.lastStart,
        endMs,
        code: entry.lastCode,
      });
    }
    entry.lastStart = -1;
  }

  for (const snap of sorted) {
    const snapCode = snap.code;
    const instruments = detectInstruments(snapCode);
    const currentNames = new Set(instruments.map(i => i.name));

    // Close events for instruments no longer present
    for (const [name] of active) {
      if (!currentNames.has(name)) {
        closeEvent(name, snap.timestamp);
      }
    }

    // Update or create events for current instruments
    for (const inst of instruments) {
      ensureTrack(inst.name, inst.category);
      const entry = active.get(inst.name)!;
      if (entry.lastStart < 0) {
        // First appearance or was removed and re-added
        entry.lastStart = snap.timestamp;
        entry.lastCode = snapCode;
      } else if (snap.timestamp - entry.lastStart > GAP_THRESHOLD) {
        // Close previous event segment and start a new one
        closeEvent(inst.name, snap.timestamp);
        entry.lastStart = snap.timestamp;
        entry.lastCode = snapCode;
      } else {
        // Still within the same event, just update the code
        entry.lastCode = snapCode;
      }
    }
  }

  // Close all remaining active events
  for (const [name] of active) {
    closeEvent(name, sorted[sorted.length - 1].timestamp + 1000);
  }

  const tracks: ParsedTrack[] = [];
  for (const [name, events] of trackEvents) {
    if (events.length === 0) continue;
    const cat = TRACK_CATEGORIES[inferCategory(name)];
    tracks.push({
      name,
      category: inferCategory(name),
      color: cat?.color ?? '#93A69E',
      events,
      modifiers: [],
    });
  }

  return tracks.sort((a, b) => (a.events[0]?.startMs ?? 0) - (b.events[0]?.startMs ?? 0));
}

function inferCategory(name: string): keyof TrackCategory {
  return categorizeSample(name);
}

export interface DetectedInstrument {
  name: string;
  category: keyof TrackCategory;
  lineIndex: number;
  code: string;
}

const MAX_INSTRUMENTS = 50;

export function detectInstruments(code: string): DetectedInstrument[] {
  if (!code) return [];
  const lines = code.split('\n');
  const results: DetectedInstrument[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const sampleMatch = trimmed.match(/\bs\(\s*["']([^"']+)["']\s*\)/g);
    const noteMatch = trimmed.match(/\bnote\(\s*["']([^"']+)["']\s*\)/g);
    const bankMatch = trimmed.match(/\bbank\(\s*["']([^"']+)["']\s*\)/g);

    const names: string[] = [];

    if (sampleMatch || noteMatch || bankMatch) {
      const all: string[] = [];
      for (const m of [...(sampleMatch || []), ...(noteMatch || []), ...(bankMatch || [])]) {
        const extracted = m.match(/["']([^"']+)["']/);
        if (extracted) names.push(extracted[1].trim());
        if (names.length >= MAX_INSTRUMENTS) break;
      }
    }

    if (names.length > 0) {
      for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        results.push({
          name,
          category: categorizeSample(name),
          lineIndex: i,
          code: trimmed,
        });
        if (results.length >= MAX_INSTRUMENTS) break;
      }
    }
    if (results.length >= MAX_INSTRUMENTS) break;
  }

  return results;
}

export function parseCodeAtTimestamp(
  snapshots: (Pick<CodeSnapshot, 'timestamp' | 'code' | 'entityId'> & Partial<Pick<CodeSnapshot, 'baseSnapshotId'>>)[],
  targetMs: number
): string {
  const resolved = resolveSnapshotCodes(snapshots);
  const last = [...resolved].reverse().find(s => s.timestamp <= targetMs);
  return last?.code ?? '// empty';
}

export type ResolvableSnapshot = Pick<CodeSnapshot, 'timestamp' | 'code' | 'entityId'> &
  Partial<Pick<CodeSnapshot, 'baseSnapshotId' | 'id' | 'actionType'>>;

/**
 * Expand every snapshot in a chain to its full code.
 *
 * Snapshots may store `code` as a sparse splice patch (or, for legacy data, a
 * JSON `DiffOp[]` common-line diff) relative to `baseSnapshotId`. This walks
 * the chain in timestamp order and returns copies with full `code` and no
 * `baseSnapshotId`, ready for display, track building and live re-enactment.
 */
export function resolveSnapshotCodes<T extends ResolvableSnapshot>(snapshots: T[]): (T & { code: string; baseSnapshotId: undefined })[] {
  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const resolvedById = new Map<string, string>();
  const resolved: (T & { code: string; baseSnapshotId: undefined })[] = [];

  for (const snap of sorted) {
    let code = snap.code;
    if (snap.baseSnapshotId) {
      let baseCode = resolvedById.get(snap.baseSnapshotId);
      let parsed: unknown;
      let parseOk = true;
      try {
        parsed = JSON.parse(snap.code);
      } catch {
        parseOk = false;
      }

      if (baseCode === undefined && parseOk && !isSplicePatch(parsed)) {
        // Legacy payload whose base id was dropped on export: best-effort
        // resolve against the nearest earlier snapshot of the same entity.
        const fallback = [...resolved]
          .reverse()
          .find(s => s.timestamp <= snap.timestamp && s.entityId === snap.entityId);
        baseCode = fallback?.code;
      }

      if (baseCode !== undefined && parseOk) {
        try {
          code = isSplicePatch(parsed)
            ? applyPatch(baseCode, parsed)
            : applyDiff(baseCode, parsed as DiffOp[]);
        } catch {
          code = snap.code;
        }
      }
    }

    if (snap.id) resolvedById.set(snap.id, code);
    resolved.push({ ...snap, code, baseSnapshotId: undefined });
  }

  return resolved;
}

export function extractModifiers(line: string, lineIndex: number): TrackModifier[] {
  const results: TrackModifier[] = [];
  const modifierRegex = /\.([a-zA-Z]+)\(([0-9]*\.?[0-9]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = modifierRegex.exec(line)) !== null) {
    const name = match[1];
    const value = parseFloat(match[2]);
    if (!isNaN(value)) {
      results.push({ name, value, lineIndex });
    }
  }
  return results;
}

export function extractCodeForEntity(
  fullCode: string,
  entityId: string
): string {
  const entities = parseEntities(fullCode);
  const entity = entities.find(e => e.id === entityId);
  return entity ? entity.codeLines.join('\n') : '';
}
