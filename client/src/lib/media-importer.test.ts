import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { samplesMock, downloadYoutubeMock, getCtxMock } = vi.hoisted(() => ({
  samplesMock: vi.fn(() => Promise.resolve()),
  downloadYoutubeMock: vi.fn(),
  getCtxMock: vi.fn(),
}));

vi.mock('@strudel/web', () => ({ samples: samplesMock }));
vi.mock('./sample-registry', () => ({ downloadYoutubeAudio: downloadYoutubeMock }));
vi.mock('./strudel-engine', () => ({ getStrudelAudioContext: getCtxMock }));

import { MediaImporter } from './media-importer';

function fakeContext(overrides?: { reject?: boolean }) {
  return {
    decodeAudioData: vi.fn(() => {
      if (overrides?.reject) return Promise.reject(new Error('nope'));
      return Promise.resolve({
        duration: 1.5,
        sampleRate: 44100,
        numberOfChannels: 2,
      });
    }),
  };
}

describe('MediaImporter.importLocalFile', () => {
  let importer: MediaImporter;

  beforeEach(() => {
    importer = new MediaImporter();
    getCtxMock.mockReturnValue(fakeContext());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  });

  afterEach(() => vi.restoreAllMocks());

  it('sanitizes the file name and decodes the blob', async () => {
    const file = new File([new Uint8Array(64)], 'My Kick!!.wav', { type: 'audio/wav' });
    const result = await importer.importLocalFile(file);
    expect(result.name).toMatch(/^[A-Za-z0-9_]+$/);
    expect(result.name.startsWith('My_Kick')).toBe(true);
    expect(result.source).toBe('local_file');
    expect(result.duration).toBe(1.5);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(2);
  });

  it('throws a descriptive error when decoding fails', async () => {
    getCtxMock.mockReturnValue(fakeContext({ reject: true }));
    const file = new File([new Uint8Array(64)], 'bad.wav');
    await expect(importer.importLocalFile(file)).rejects.toThrow(/Could not decode audio/);
  });

  it('throws when no AudioContext is available', async () => {
    getCtxMock.mockReturnValue(null);
    const file = new File([new Uint8Array(4)], 'a.wav');
    await expect(importer.importLocalFile(file)).rejects.toThrow(/AudioContext not available/);
  });
});

describe('MediaImporter.importFromUrl', () => {
  let importer: MediaImporter;

  beforeEach(() => {
    importer = new MediaImporter();
    getCtxMock.mockReturnValue(fakeContext());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  });

  afterEach(() => vi.restoreAllMocks());

  it('fetches and decodes a non-YouTube URL', async () => {
    const blob = new Blob([new Uint8Array(32)]);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(blob) })));
    const result = await importer.importFromUrl('https://example.com/sounds/gong.wav');
    expect(result.name).toBe('gong');
    expect(result.source).toBe('url');
  });

  it('throws on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    await expect(importer.importFromUrl('https://example.com/missing.wav')).rejects.toThrow(/HTTP 404/);
  });

  it('routes YouTube URLs through the downloader', async () => {
    downloadYoutubeMock.mockResolvedValue(new Blob([new Uint8Array(64)]));
    const result = await importer.importFromUrl('https://youtu.be/abc123', 'clip');
    expect(downloadYoutubeMock).toHaveBeenCalledWith('https://youtu.be/abc123', 'clip');
    expect(result.source).toBe('youtube');
  });
});

describe('MediaImporter.registerWithStrudel', () => {
  it('registers the sample and revokes the object URL', async () => {
    samplesMock.mockClear();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const importer = new MediaImporter();
    await importer.registerWithStrudel({
      name: 'kick',
      blob: new Blob([]),
      blobUrl: 'blob:kick',
      duration: 1,
      sampleRate: 44100,
      channels: 1,
      source: 'local_file',
    });
    expect(samplesMock).toHaveBeenCalledWith({ kick: ['blob:kick'] });
    expect(revoke).toHaveBeenCalledWith('blob:kick');
  });
});
