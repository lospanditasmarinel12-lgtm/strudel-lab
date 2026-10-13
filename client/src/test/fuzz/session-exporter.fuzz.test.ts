import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { exportSongAsFile, exportLiveSessionAsFile, buildSongScript, parseSongScript, isCodeSession } from '@/lib/session-exporter';

vi.mock('@/lib/stores/session-store', () => ({
  createSession: vi.fn(() => Promise.resolve({ id: 'session-1' })),
}));

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
  return {
    id: 'test-id',
    projectId: 'p1',
    name,
    bpm,
    duration,
    createdAt,
    audioBlob: new Blob([]),
    tracks: [],
    snapshots: [],
  };
}

describe('fuzz: session-exporter property-based tests', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exportSongAsFile never rejects with arbitrary session data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 0, maxLength: 100 }),
          bpm: fc.integer({ min: 0, max: 300 }),
          duration: fc.integer({ min: 0, max: 3600000 }),
          createdAt: fc.integer({ min: 0 }),
        }),
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 60000 }),
            code: fc.string({ minLength: 0, maxLength: 200 }),
            actionType: fc.constantFrom('edit', 'evaluate', 'play', 'stop', 'bpm_change' as const),
            entityId: fc.string({ minLength: 0, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        async (fields, snapshots) => {
          await expect(
            exportSongAsFile(makeSession(fields.name, fields.bpm, fields.duration, fields.createdAt) as any, snapshots as any),
          ).resolves.toBeUndefined();
        },
      ),
    );
  });

  test('exportLiveSessionAsFile never rejects with arbitrary snapshot arrays', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 60000 }),
            code: fc.string({ minLength: 0, maxLength: 200 }),
            actionType: fc.constantFrom('edit', 'evaluate', 'play', 'stop', 'bpm_change' as const),
            entityId: fc.string({ minLength: 0, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        async (snapshots) => {
          await expect(
            exportLiveSessionAsFile(makeSession('stress', 120, 1000, 0) as any, snapshots as any),
          ).resolves.toBeUndefined();
        },
      ),
    );
  });

  test('buildSongScript/parseSongScript round-trip arbitrary code', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (code) => {
        const parsed = parseSongScript(buildSongScript({ title: 't', bpm: 120, createdAt: 0, sources: [], samples: [], code }));
        expect(parsed.code).toBe(code.trim());
      }),
    );
  });

  test('isCodeSession never throws on arbitrary objects', () => {
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

  test('exportLiveSessionAsFile handles extreme snapshot counts', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 100, max: 500 }), async (count) => {
        const snapshots = Array.from({ length: count }, (_, i) => ({
          timestamp: i * 100,
          code: `s("bd").gain(${(i % 100) / 100})`,
          actionType: 'edit' as const,
          entityId: `entity-${i % 5}`,
        }));
        await expect(
          exportLiveSessionAsFile(makeSession('stress-test', 120, count * 100, Date.now()) as any, snapshots as any),
        ).resolves.toBeUndefined();
      }),
    );
  });

  test('exportSongAsFile handles special characters in name', async () => {
    const session = makeSession('hello!@#$%^&*()世界', 120, 5000, Date.now());
    await expect(exportSongAsFile(session as any, [])).resolves.toBeUndefined();
    const createEl = vi.spyOn(document, 'createElement');
    await exportSongAsFile(session as any, []);
    const anchor = createEl.mock.results[0]?.value as any;
    expect(anchor.download).toMatch(/\.strudel$/);
  });
});
