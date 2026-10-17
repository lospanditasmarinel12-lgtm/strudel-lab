import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getCtxMock, registerSampleMock } = vi.hoisted(() => ({
  getCtxMock: vi.fn(),
  registerSampleMock: vi.fn(() => Promise.resolve('mic')),
}));

vi.mock('./strudel-engine', () => ({ getStrudelAudioContext: getCtxMock }));
vi.mock('./sample-registry', () => ({ registerCustomSample: registerSampleMock }));

import { MicCaptureEngine } from './mic-capture-engine';

function stubMediaDevices(getUserMedia: () => Promise<unknown>, enumerate = () => Promise.resolve([])) {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia, enumerateDevices: enumerate },
  });
}

describe('MicCaptureEngine error paths', () => {
  let engine: MicCaptureEngine;

  beforeEach(() => {
    engine = new MicCaptureEngine();
    registerSampleMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stop() is safe before start', () => {
    expect(() => engine.stop()).not.toThrow();
    expect(engine.isCapturing).toBe(false);
  });

  it('getLatestBuffer resolves null with no context/data', async () => {
    getCtxMock.mockReturnValue(null);
    await expect(engine.getLatestBuffer()).resolves.toBeNull();
  });

  it('start() maps a denied microphone to a friendly error', async () => {
    getCtxMock.mockReturnValue({ sampleRate: 48000 });
    const err = new DOMException('denied', 'NotAllowedError');
    stubMediaDevices(() => Promise.reject(err));
    await expect(engine.start()).rejects.toThrow(/Microphone access denied/);
  });

  it('start() maps a missing microphone to a friendly error', async () => {
    getCtxMock.mockReturnValue({ sampleRate: 48000 });
    const err = new DOMException('none', 'NotFoundError');
    stubMediaDevices(() => Promise.reject(err));
    await expect(engine.start()).rejects.toThrow(/No microphone found/);
  });

  it('getDevices filters to audio inputs', async () => {
    stubMediaDevices(
      () => Promise.resolve({ getTracks: () => [] }),
      () =>
        Promise.resolve([
          { kind: 'audioinput', deviceId: 'a' },
          { kind: 'videoinput', deviceId: 'b' },
          { kind: 'audioinput', deviceId: 'c' },
        ]),
    );
    const devices = await engine.getDevices();
    expect(devices.map((d) => d.deviceId)).toEqual(['a', 'c']);
  });

  it('freezeAsSample throws when there is no captured audio', async () => {
    getCtxMock.mockReturnValue({ sampleRate: 48000, createBuffer: vi.fn() });
    await expect(engine.freezeAsSample('x', 1)).rejects.toThrow(/No mic data/);
  });
});
