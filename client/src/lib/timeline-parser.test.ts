import { describe, it, expect } from 'vitest';
import { lineDiff, applyDiff, diffToPatch, applyPatch } from './diff';
import {
  parseEntities,
  detectInstruments,
  buildTracksFromSnapshots,
  buildAdaptiveTracksFromSnapshots,
  parseCodeAtTimestamp,
  extractCodeForEntity,
  resolveSnapshotCodes,
} from './timeline-parser';

describe('parseEntities', function() {
  it('returns empty array for empty string', function() {
    expect(parseEntities('')).toEqual([]);
  });

  it('returns single entity for single line', function() {
    const result = parseEntities('note("c3").s("bd")');
    expect(result.length).toBe(1);
    expect(result[0].codeLines).toEqual(['note("c3").s("bd")']);
  });

  it('splits code into multiple entities by $: delimiter', function() {
    const result = parseEntities('$: note("c3")\n\n$: s("bd")');
    expect(result.length).toBe(2);
  });

  it('splits code by stack() as new entity indicator', function() {
    const result = parseEntities('note("c3")\n\nstack(\n  s("bd"),\n  s("hh")\n)');
    expect(result.length).toBe(2);
    expect(result[1].codeLines[0]).toBe('stack(');
  });

  it('treats comment-only blocks as continuation', function() {
    const result = parseEntities('note("c3")\n// comment\n// another');
    expect(result.length).toBe(1);
  });

  it('ignores whitespace-only lines (they continue the current entity)', function() {
    const result = parseEntities('a\n   \nb');
    expect(result.length).toBe(1);
  });

  it('assigns sequential entity ids', function() {
    const result = parseEntities('$: a\n\n$: b\n\n$: c');
    expect(result.map(function(e) { return e.id; })).toEqual(['entity-1', 'entity-2', 'entity-3']);
  });
});

describe('detectInstruments', function() {
  it('returns empty for empty string', function() {
    expect(detectInstruments('')).toEqual([]);
  });

  it('finds s() sample', function() {
    const result = detectInstruments("note('c3').s('bd')");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('bd');
  });

  it('finds note() with sample', function() {
    const result = detectInstruments("note('e4').s('piano')");
    expect(result.some(function(r) { return r.name === 'piano'; })).toBe(true);
  });

  it('deduplicates same instrument across lines', function() {
    const result = detectInstruments("s('bd')\ns('bd')");
    const bdCount = result.filter(function(r) { return r.name === 'bd'; }).length;
    expect(bdCount).toBe(1);
  });

  it('handles multiple samples on one line', function() {
    const result = detectInstruments("note('c3').s('bd sd hh')");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles blank lines and skips comments', function() {
    const result = detectInstruments("// comment only\n\ns('bd')");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('bd');
  });
});

describe('buildTracksFromSnapshots', function() {
  it('returns empty array for empty snapshots', function() {
    expect(buildTracksFromSnapshots([])).toEqual([]);
  });

  it('builds a track from a single snapshot', function() {
    const result = buildTracksFromSnapshots([
      { timestamp: 0, code: "note('c3').s('bd')", entityId: 'entity-1' },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('bd');
  });

  it('creates events from consecutive snapshots', function() {
    const result = buildTracksFromSnapshots([
      { timestamp: 0, code: "s('bd')", entityId: 'entity-1' },
      { timestamp: 1000, code: "s('bd')", entityId: 'entity-1' },
    ]);
    // Track has events
    expect(result.length).toBe(1);
    expect(result[0].events.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildAdaptiveTracksFromSnapshots', function() {
  it('returns empty for empty snapshots', function() {
    expect(buildAdaptiveTracksFromSnapshots([])).toEqual([]);
  });

  it('creates track from single snapshot', function() {
    const result = buildAdaptiveTracksFromSnapshots([
      { timestamp: 0, code: "s('bd')", entityId: 'e1' },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('bd');
  });

  it('handles instrument that appears and disappears', function() {
    const result = buildAdaptiveTracksFromSnapshots([
      { timestamp: 0, code: "s('bd')", entityId: 'e1' },
      { timestamp: 1000, code: "s('hh')", entityId: 'e2' },
    ]);
    expect(result.length).toBe(2);
  });
});

describe('diff-based snapshot resolution', function() {
  it('resolves full-code snapshot directly', function() {
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a\nb\nc', entityId: 'e1' },
    ], 0);
    expect(result).toBe('a\nb\nc');
  });

  it('resolves diff snapshot using baseSnapshotId', function() {
    // Diff from 'a\nb\nc' → 'a\nb\nx': keep a,b; remove c; add x
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a\nb\nc', entityId: 'e1', id: 'base1', baseSnapshotId: undefined },
      { timestamp: 1000, code: JSON.stringify([{ t: '=', l: ['a', 'b'] }, { t: '-', l: ['c'] }, { t: '+', l: ['x'] }]), entityId: 'e1', baseSnapshotId: 'base1' },
    ], 1000);
    expect(result).toBe('a\nb\nx');
  });

  it('handles chain of two diffs from base', function() {
    // Full code at t=0: 'a\nb\nc'
    // Diff at t=1000 from base1: keep 'a', remove 'b'? No — keep 'a', remove 'b' and 'c', add 'x'
    // We want the result at t=2000 to use the snapshot at t=1000
    // Diff from 'a\nb\nc' → 'a\nx\nc': keep 'a', remove 'b', add 'x'
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a\nb\nc', entityId: 'e1', id: 'base1' },
      { timestamp: 1000, code: JSON.stringify([{ t: '=', l: ['a'] }, { t: '-', l: ['b'] }, { t: '+', l: ['x'] }]), entityId: 'e1', baseSnapshotId: 'base1' },
    ], 2000);
    // Resolves to the code at t=1000: keep 'a', remove 'b', add 'x' → 'a\nx\nc'
    expect(result).toBe('a\nx\nc');
  });

  it('falls back to raw code for malformed diff', function() {
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a\nb\nc', entityId: 'e1', id: 'base1' },
      { timestamp: 1000, code: 'not-json-diff', entityId: 'e1', baseSnapshotId: 'base1' },
    ], 1000);
    expect(result).toBe('not-json-diff');
  });

  it('round-trips lineDiff -> applyDiff', function() {
    const codeAt = parseCodeAtTimestamp([
      { timestamp: 0, code: 'hello\nworld', entityId: 'e1', id: 'b1' },
      { timestamp: 1000, code: JSON.stringify(lineDiff('hello\nworld', 'hello\nmidi')), entityId: 'e1', baseSnapshotId: 'b1' },
    ], 1000);
    expect(codeAt).toBe('hello\nmidi');
  });
});

describe('buildTracksFromSnapshots with diff resolution', function() {
  it('resolves diff-based snapshots when building tracks', function() {
    const result = buildTracksFromSnapshots([
      { timestamp: 0, code: "s('bd')", entityId: 'entity-1', baseSnapshotId: undefined as string | undefined },
      { timestamp: 1000, code: JSON.stringify(lineDiff("s('bd')", "s('bd').gain(0.5)")), entityId: 'entity-1', baseSnapshotId: 'snap1' },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('bd');
  });
});

describe('buildAdaptiveTracksFromSnapshots with diff resolution', function() {
  it('resolves diff-based snapshots', function() {
    const result = buildAdaptiveTracksFromSnapshots([
      { timestamp: 0, code: "s('hh')", entityId: 'e1', baseSnapshotId: undefined as string | undefined },
      { timestamp: 500, code: JSON.stringify(lineDiff("s('hh')", "s('hh').gain(0.3)")), entityId: 'e1', baseSnapshotId: 's1' },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('hh');
  });
});

describe('parseCodeAtTimestamp', function() {
  it('returns empty comment for empty snapshots', function() {
    expect(parseCodeAtTimestamp([], 100)).toBe('// empty');
  });

  it('returns code at exact timestamp', function() {
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a', entityId: 'e1' },
      { timestamp: 1000, code: 'b', entityId: 'e1' },
    ], 0);
    expect(result).toBe('a');
  });

  it('returns most recent code before timestamp', function() {
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a', entityId: 'e1' },
      { timestamp: 1000, code: 'b', entityId: 'e1' },
    ], 500);
    expect(result).toBe('a');
  });

  it('returns code at exact later timestamp', function() {
    const result = parseCodeAtTimestamp([
      { timestamp: 0, code: 'a', entityId: 'e1' },
      { timestamp: 1000, code: 'b', entityId: 'e1' },
    ], 1000);
    expect(result).toBe('b');
  });
});

describe('sparse splice patches', function() {
  it('diffToPatch/applyPatch round-trips localized edits', function() {
    const base = Array.from({ length: 40 }, function(_, i) { return 'line' + i + '.s("bd")'; }).join('\n');
    const next = base.replace('line20.s("bd")', 'line20.s("bd").gain(0.9)');
    const patch = diffToPatch(base, next);
    expect(patch.length).toBeGreaterThan(0);
    expect(applyPatch(base, patch)).toBe(next);
  });

  it('resolveSnapshotCodes expands a splice patch chain', function() {
    const base = 'a\nb\nc\nd\ne';
    const step1 = 'a\nb\nX\nd\ne';
    const step2 = 'a\nb\nX\nd\ne\nf';
    const snapshots = [
      { id: 's1', timestamp: 0, code: base, entityId: 'e1' },
      { id: 's2', timestamp: 1000, code: JSON.stringify(diffToPatch(base, step1)), entityId: 'e1', baseSnapshotId: 's1' },
      { id: 's3', timestamp: 2000, code: JSON.stringify(diffToPatch(step1, step2)), entityId: 'e1', baseSnapshotId: 's2' },
    ];
    const resolved = resolveSnapshotCodes(snapshots);
    expect(resolved.map(function(s) { return s.code; })).toEqual([base, step1, step2]);
    expect(resolved[2].baseSnapshotId).toBeUndefined();
  });

  it('resolveSnapshotCodes handles no-op patches', function() {
    const snapshots = [
      { id: 's1', timestamp: 0, code: 'x\ny', entityId: 'e1' },
      { id: 's2', timestamp: 1000, code: '[]', entityId: 'e2', baseSnapshotId: 's1' },
    ];
    const resolved = resolveSnapshotCodes(snapshots);
    expect(resolved[1].code).toBe('x\ny');
  });
});

describe('extractCodeForEntity', function() {
  it('returns code lines for existing entity', function() {
    const result = extractCodeForEntity('$: a\n\n$: b', 'entity-2');
    expect(result).toBe('$: b');
  });

  it('returns empty string for missing entity', function() {
    const result = extractCodeForEntity('a\n\nb', 'nonexistent');
    expect(result).toBe('');
  });
});
