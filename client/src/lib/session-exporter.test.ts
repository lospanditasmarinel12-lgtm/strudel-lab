import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stores/session-store', () => ({
  createSession: vi.fn(() => Promise.resolve({ id: 'session-1' })),
}));

vi.mock('@/lib/stores/project-store', () => ({
  createProject: vi.fn(() => Promise.resolve({ id: 'project-1', name: 'song', code: '', bpm: 120 })),
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

import {
  isCodeSession,
  buildSongScript,
  parseSongScript,
  exportSongAsFile,
  exportLiveSessionAsFile,
  blobToBase64,
  base64ToBlob,
} from './session-exporter';

function makeSession(audioBlob: Blob | null) {
  return {
    id: 's1',
    projectId: 'p1',
    name: 'test',
    bpm: 120,
    duration: 5000,
    createdAt: Date.now(),
    audioBlob,
    tracks: [],
  } as any;
}

function makeSnapshots() {
  return [
    { id: 'n1', sessionId: 's1', entityId: 'entity-1', timestamp: 0, code: 's("bd")', actionType: 'edit' as const },
    { id: 'n2', sessionId: 's1', entityId: 'entity-1', timestamp: 1000, code: 's("bd").gain(0.5)', actionType: 'play' as const, baseSnapshotId: 'n1' },
  ];
}

describe('isCodeSession', () => {
  it('returns false for session with audio data', () => {
    const blob = new Blob(['audio-data']);
    Object.defineProperty(blob, 'size', { value: 10 });
    expect(isCodeSession(makeSession(blob))).toBe(false);
  });

  it('returns true for session with empty blob', () => {
    expect(isCodeSession(makeSession(new Blob([])))).toBe(true);
  });

  it('returns true for session with null audioBlob', () => {
    expect(isCodeSession(makeSession(null))).toBe(true);
  });

  it('does not crash on malformed session', () => {
    expect(function() {
      isCodeSession({} as any);
    }).not.toThrow();
  });
});

describe('song script format', () => {
  it('round-trips metadata, samples and code', () => {
    const data = {
      title: 'My "Song"',
      bpm: 140,
      createdAt: 123,
      sources: ['github:tidalcycles/dirt-samples'],
      samples: [{ name: 'vox', mime: 'audio/wav', data: 'AAAA' }],
      code: 's("bd")\nnote("c3").s("vox")',
    };
    const script = buildSongScript(data);
    const parsed = parseSongScript(script);
    expect(parsed.title).toBe('My "Song"');
    expect(parsed.bpm).toBe(140);
    expect(parsed.sources).toEqual(['github:tidalcycles/dirt-samples']);
    expect(parsed.samples).toHaveLength(1);
    expect(parsed.samples[0].name).toBe('vox');
    expect(parsed.code).toBe('s("bd")\nnote("c3").s("vox")');
  });

  it('handles a script with no samples', () => {
    const script = buildSongScript({ title: 'x', bpm: 120, createdAt: 1, sources: [], samples: [], code: 's("bd")' });
    expect(script).not.toContain('samples({');
    expect(parseSongScript(script).code).toBe('s("bd")');
  });
});

describe('base64 helpers', () => {
  it('round-trips binary data', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const b64 = await blobToBase64(blob);
    const restored = base64ToBlob(b64, 'audio/wav');
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(Array.from(restoredBytes)).toEqual(Array.from(bytes));
  });
});

describe('exports', () => {
  beforeEach(function() {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(function() {});
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as any);
  });

  it('exportSongAsFile downloads a .strudel file', async () => {
    const anchor: any = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    await exportSongAsFile(makeSession(new Blob([])), makeSnapshots() as any);
    expect(anchor.download).toContain('.strudel');
    expect(anchor.download).not.toContain('.live.json');
  });

  it('exportLiveSessionAsFile downloads a .strudel.live.json file and preserves the diff chain', async () => {
    const anchor: any = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    await exportLiveSessionAsFile(makeSession(new Blob([])), makeSnapshots() as any);
    expect(anchor.download).toContain('.strudel.live.json');

    const calls = vi.mocked(URL.createObjectURL).mock.calls;
    const blob = calls[calls.length - 1][0] as Blob;
    const parsed = JSON.parse(await blob.text());
    expect(parsed.kind).toBe('live-session');
    expect(parsed.snapshots[1].baseSnapshotId).toBe('n1');
    expect(parsed.snapshots[1].actionType).toBe('play');
  });
});
