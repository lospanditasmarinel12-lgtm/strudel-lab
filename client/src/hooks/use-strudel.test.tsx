import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FakeAudioContext, FakeAudioNode } from '@/test/mocks/audio';

let mockCtx: FakeAudioContext;

vi.mock('@strudel/web', function() {
  const mockDestGain = new FakeAudioNode();
  mockDestGain.gain.value = 1;
  return {
    initStrudel: vi.fn(function() { return Promise.resolve(); }),
    evaluate: vi.fn(function() { return Promise.resolve(); }),
    hush: vi.fn(),
    getAudioContext: vi.fn(function() { return mockCtx; }),
    getSuperdoughAudioController: vi.fn(function() {
      return { output: { destinationGain: mockDestGain } };
    }),
  };
});

vi.mock('../lib/sample-registry', function() {
  return {
    loadManifest: vi.fn(function() { return Promise.resolve(); }),
    scanAndRegisterBanks: vi.fn(function() { return Promise.resolve(); }),
    rehydrateCustomSamples: vi.fn(function() { return Promise.resolve(); }),
    processCodeSamples: vi.fn(function(code: string) { return Promise.resolve(code); }),
  };
});

describe('useStrudel', function() {
  let useStrudel: typeof import('./use-strudel').useStrudel;

  beforeEach(async function() {
    mockCtx = new FakeAudioContext();
    vi.clearAllMocks();
    const mod = await import('./use-strudel');
    useStrudel = mod.useStrudel;
  });

  it('returns initialized=false initially', function() {
    const { result } = renderHook(function() { return useStrudel(); });
    expect(result.current.initialized).toBe(false);
  });

  it('returns playing=false initially', function() {
    const { result } = renderHook(function() { return useStrudel(); });
    expect(result.current.playing).toBe(false);
  });

  it('returns latency as a number', function() {
    const { result } = renderHook(function() { return useStrudel(); });
    expect(typeof result.current.latency).toBe('number');
  });

  it('evaluate does not throw', async function() {
    const { result } = renderHook(function() { return useStrudel(); });
    await act(async function() {
      await expect(result.current.evaluate('s("bd")')).resolves.toBeUndefined();
    });
  });

  it('stop does not throw', function() {
    const { result } = renderHook(function() { return useStrudel(); });
    act(function() {
      expect(function() { result.current.stop(); }).not.toThrow();
    });
  });

  it('setVolume does not throw', function() {
    const { result } = renderHook(function() { return useStrudel(); });
    act(function() {
      expect(function() { result.current.setVolume(0.5); }).not.toThrow();
    });
  });
});
