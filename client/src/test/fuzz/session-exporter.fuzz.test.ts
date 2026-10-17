import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  exportSongAsFile,
  exportLiveSessionAsFile,
  buildSongScript,
  parseSongScript,
  isCodeSession,
  blobToBase64,
  base64ToBlob,
  importLiveSessionFromFile,
} from '@/lib/session-exporter';
import { resolveSnapshotCodes } from '@/lib/timeline-parser';

const { createSessionMock } = vi.hoisted(() => ({
  createSessionMock: vi.fn((data: any) => Promise.resolve({ id: 'session-1', ...data })),
}));

vi.mock('@/lib/stores/session-store', () => ({ createSession: createSessionMock }));
vi.mock('@/lib/stores/project-store', () => ({
  createProject: vi.fn(() => Promise.resolve({ id: 'project-1' })),
}));
vi.mock('@/lib/stores/db', () => ({
  db: {
    customSamples: {
      bulkGet: vi.fn(() => Promise.resolve([])),
      get: vi.fn(() => Promise.resolve(undefined)),
      put: vi.fn(() => Promise.resolve()),
    },
  },
}));
vi.mock('@/lib/sample-registry', () => ({
  extractBankNames: vi.fn(() => []),
  importCustomSample: vi.fn(() => Promise.resolve()),
}));

function makeSession(name: string, bpm: number, duration: number, createdAt: number) {
  return { id: 'test-id', projectId: 'p1', name, bpm, duration, createdAt, audioBlob: new Blob([]), tracks: [], snapshots: [] };
}

const safeName = fc
  .array(fc.constantFrom('v', 'o', 'x', '_', '1', '2', 'A', 'Z', '-'), { minLength: 1, maxLength: 8 })
  .map((a) => a.join(''));

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue({ href: '', download: '', click: vi.fn() } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  createSessionMock.mockClear();
});

describe('fuzz: session-exporter binary helpers', () => {
  test('blobToBase64 <-> base64ToBlob round-trips arbitrary bytes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 1024 }), async (bytes) => {
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const b64 = await blobToBase64(blob);
        const restored = new Uint8Array(await base64ToBlob(b64, 'application/octet-stream').arrayBuffer());
        expect(Array.from(restored)).toEqual(Array.from(bytes));
      }),
      { numRuns: 150 },
    );
  });
});

describe('fuzz: song script round-trip (L1)', () => {
  test('title / bpm / createdAt / sources survive a round-trip', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 2 ** 40 }),
        fc.array(safeName, { maxLength: 5 }),
        (title, bpm, createdAt, sources) => {
          const script = buildSongScript({ title, bpm, createdAt, sources, samples: [], code: 's("bd")' });
          const parsed = parseSongScript(script);
          expect(parsed.title).toBe(title);
          expect(parsed.bpm).toBe(bpm);
          expect(parsed.createdAt).toBe(createdAt);
          expect(parsed.sources).toEqual(sources);
        },
      ),
      { numRuns: 300 },
    );
  });

  // Fixed: session-exporter.ts now parses presence explicitly, so a legitimate
  // 0 is no longer confused with a missing header.
  test('a bpm of 0 and a createdAt of 0 survive a round-trip', () => {
    const script = buildSongScript({ title: 't', bpm: 0, createdAt: 0, sources: [], samples: [], code: 's("bd")' });
    const parsed = parseSongScript(script);
    expect(parsed.bpm).toBe(0);
    expect(parsed.createdAt).toBe(0);
  });

  test('absent metadata still falls back to the defaults', () => {
    const parsed = parseSongScript('s("bd")');
    expect(parsed.bpm).toBe(120);
    expect(Number.isFinite(parsed.createdAt)).toBe(true);
  });

  test('samples survive a round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: safeName,
            mime: fc.constantFrom('audio/wav', 'audio/webm', 'audio/mpeg'),
            data: fc.base64String({ minLength: 1, maxLength: 64 }),
          }),
          { maxLength: 4 },
        ),
        (samples) => {
          const script = buildSongScript({ title: 't', bpm: 120, createdAt: 1, sources: [], samples, code: 's("bd")' });
          const parsed = parseSongScript(script);
          expect(parsed.samples).toEqual(samples);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('code body survives (trimmed)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (code) => {
        const parsed = parseSongScript(buildSongScript({ title: 't', bpm: 120, createdAt: 0, sources: [], samples: [], code }));
        expect(parsed.code).toBe(code.trim());
      }),
      { numRuns: 300 },
    );
  });
});

describe('fuzz: metadata parsing contract (class guard)', () => {
  // Presence-based contract: absent -> default; present and numeric -> value
  // (including 0); present and non-numeric -> default.
  const expectBpm = (raw: string | undefined): number => {
    if (raw === undefined) return 120;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 120;
  };

  test('bpm matches the presence-based contract across edge values', () => {
    const values: Array<string | undefined> = [undefined, '', '0', '00', '-5', '0.5', 'abc', '1e3', '999999999999'];
    for (const raw of values) {
      const header = raw === undefined ? '' : `// @bpm ${raw}\n`;
      const script = `// @kind song\n// @version 1\n${header}// @code\ns("bd")`;
      expect(parseSongScript(script).bpm, `raw=${JSON.stringify(raw)}`).toBe(expectBpm(raw));
    }
  });

  test('createdAt is 0 when present as 0, and now when absent', () => {
    const withZero = parseSongScript('// @kind song\n// @created 0\n// @code\ns("bd")');
    expect(withZero.createdAt).toBe(0);
    const absent = parseSongScript('// @kind song\n// @code\ns("bd")');
    expect(absent.createdAt).toBeGreaterThan(0);
  });

  test('characterization: a known script parses to known fields', () => {
    const script = buildSongScript({
      title: 'Known',
      bpm: 137,
      createdAt: 1699999999999,
      sources: ['github:tidalcycles/dirt-samples'],
      samples: [{ name: 'vox', mime: 'audio/wav', data: 'QUJD' }],
      code: 's("bd")',
    });
    const parsed = parseSongScript(script);
    expect(parsed).toMatchObject({
      title: 'Known',
      bpm: 137,
      createdAt: 1699999999999,
      sources: ['github:tidalcycles/dirt-samples'],
      samples: [{ name: 'vox', mime: 'audio/wav', data: 'QUJD' }],
      code: 's("bd")',
    });
  });
});

describe('fuzz: live-set export fidelity (L5)', () => {
  test('exported live set re-resolves to the same codes as the source snapshots', async () => {
    const snapshots = [
      { id: 'n1', entityId: 'e0', timestamp: 0, code: 's("bd")', actionType: 'edit' as const },
      { id: 'n2', entityId: 'e0', timestamp: 500, code: 's("bd hh")', actionType: 'edit' as const, baseSnapshotId: 'n1' },
      { id: 'n3', entityId: 'e0', timestamp: 1000, code: 's("bd hh cp")', actionType: 'evaluate' as const, baseSnapshotId: 'n2' },
    ];
    let captured: Blob | null = null;
    vi.mocked(URL.createObjectURL).mockImplementation((b: Blob) => {
      captured = b;
      return 'blob:test';
    });
    await exportLiveSessionAsFile(makeSession('x', 120, 1500, 1) as any, snapshots as any);
    const file = JSON.parse(await captured!.text());
    const before = resolveSnapshotCodes(snapshots as any).map((s) => s.code);
    const after = resolveSnapshotCodes(file.snapshots).map((s) => s.code);
    expect(after).toEqual(before);
    expect(file.snapshots.some((s: any) => !!s.baseSnapshotId)).toBe(true);
  });

  test('export never rejects with arbitrary snapshot arrays', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 60000 }),
            code: fc.string({ maxLength: 200 }),
            actionType: fc.constantFrom('edit', 'evaluate', 'play', 'stop', 'bpm_change' as const),
            entityId: fc.string({ maxLength: 20 }),
          }),
          { maxLength: 50 },
        ),
        async (snapshots) => {
          await expect(
            exportLiveSessionAsFile(makeSession('stress', 120, 1000, 0) as any, snapshots as any),
          ).resolves.toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('fuzz: import validation', () => {
  function mockFilePicker(file: File | null): void {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'input') {
        const input: any = {
          type: '',
          accept: '',
          files: file ? [file] : [],
          onchange: null,
          click() {
            this.onchange?.();
          },
        };
        return input;
      }
      return { href: '', download: '', click: vi.fn() } as any;
    });
  }

  test('importLiveSessionFromFile rebuilds snapshots with valid action types', async () => {
    const data = {
      kind: 'live-session',
      version: 2,
      name: 'Imported',
      bpm: 130,
      duration: 2000,
      createdAt: 1,
      sources: [],
      samples: [],
      finalCode: 's("bd")',
      snapshots: [
        { id: 'a', entityId: 'e0', timestamp: 0, code: 's("bd")', actionType: 'edit' },
        { id: 'b', entityId: 'e0', timestamp: 100, code: 's("hh")', actionType: 'not-a-real-action' },
      ],
    };
    mockFilePicker(new File([JSON.stringify(data)], 'x.strudel.live.json', { type: 'application/json' }));
    await importLiveSessionFromFile();
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const arg = createSessionMock.mock.calls[0][0] as any;
    expect(arg.name).toBe('Imported');
    expect(arg.bpm).toBe(130);
    expect(arg.finalCode).toBe('s("bd")');
    expect(arg.snapshots[1].actionType).toBe('edit'); // invalid action coerced
  });

  test('importLiveSessionFromFile rejects a file with no snapshots array', async () => {
    mockFilePicker(new File([JSON.stringify({ kind: 'live-session' })], 'x.json', { type: 'application/json' }));
    await expect(importLiveSessionFromFile()).rejects.toThrow(/invalid live session/i);
  });
});

describe('fuzz: isCodeSession defensive', () => {
  test('never throws on arbitrary objects', () => {
    fc.assert(
      fc.property(
        fc.record({
          audioBlob: fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(new Blob(['data'])),
            fc.constant(new Blob([])),
          ),
        }),
        (obj) => {
          expect(() => isCodeSession(obj as any)).not.toThrow();
          expect(typeof isCodeSession(obj as any)).toBe('boolean');
        },
      ),
    );
  });

  test('exportSongAsFile never rejects with arbitrary session data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ maxLength: 60 }),
          bpm: fc.integer({ min: 0, max: 300 }),
          duration: fc.integer({ min: 0, max: 3600000 }),
        }),
        async (fields) => {
          await expect(exportSongAsFile(makeSession(fields.name, fields.bpm, fields.duration, 0) as any, [])).resolves.toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });
});
