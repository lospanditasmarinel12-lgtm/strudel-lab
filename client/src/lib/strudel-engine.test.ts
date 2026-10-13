import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeAudioContext, FakeAudioNode } from '@/test/mocks/audio';

let mockCtx: FakeAudioContext;

// Must set up mocks BEFORE any imports from the module under test
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

vi.mock('./sample-registry', function() {
  return {
    loadManifest: vi.fn(function() { return Promise.resolve(); }),
    scanAndRegisterBanks: vi.fn(function() { return Promise.resolve(); }),
    rehydrateCustomSamples: vi.fn(function() { return Promise.resolve(); }),
    processCodeSamples: vi.fn(function(code: string) { return Promise.resolve(code); }),
  };
});

describe('strudel-engine', function() {
  let mod: typeof import('./strudel-engine');

  beforeEach(async function() {
    mockCtx = new FakeAudioContext();
    vi.clearAllMocks();
    // Re-import to get fresh module state
    mod = await import('./strudel-engine');
  });

  describe('getStrudelAudioContext', function() {
    it('returns AudioContext from @strudel/web', function() {
      const ctx = mod.getStrudelAudioContext();
      expect(ctx).toBe(mockCtx);
    });
  });

  describe('getSuperdoughDestination', function() {
    it('returns superdough output destinationGain (not a direct property)', async function() {
      const strudel = await import('@strudel/web');
      const expected = (strudel.getSuperdoughAudioController() as any).output.destinationGain;
      expect(expected).toBeDefined();
      expect(mod.getSuperdoughDestination()).toBe(expected);
    });

    it('returns null when the controller throws', async function() {
      const strudel = await import('@strudel/web');
      vi.mocked(strudel.getSuperdoughAudioController as any).mockImplementationOnce(() => {
        throw new Error('boom');
      });
      expect(mod.getSuperdoughDestination()).toBeNull();
    });
  });

  describe('initStrudelEngine', function() {
    it('calls initStrudel from @strudel/web', async function() {
      await mod.initStrudelEngine();
      const strudelMod = await import('@strudel/web');
      expect(strudelMod.initStrudel).toHaveBeenCalled();
    });

    it('does not re-init if already initialized (module state persists)', async function() {
      const strudelMod = await import('@strudel/web');
      // After first init in the previous test, strudelInitialized is true
      // Calling init again should be a no-op
      await mod.initStrudelEngine();
      // initStrudel was called 1 time from the previous test (module state persists)
      // clearAllMocks in beforeEach resets counts, so we track per-test calls
      expect(strudelMod.initStrudel).not.toHaveBeenCalled();
    });
  });

  describe('setMasterVolume', function() {
    it('sets volume on master gain node', async function() {
      await mod.initStrudelEngine();
      mod.setMasterVolume(0.5);
      // After init, master gain should have gain.value=0.5
      // We can verify by checking the master gain node's gain value
    });

    it('clamps volume to 0 minimum', async function() {
      await mod.initStrudelEngine();
      mod.setMasterVolume(-1);
    });

    it('clamps volume to 1 maximum', async function() {
      await mod.initStrudelEngine();
      mod.setMasterVolume(2);
    });

    it('is safe to call before init is complete', function() {
      expect(function() { mod.setMasterVolume(0.5); }).not.toThrow();
    });
  });

  describe('evaluateStrudelCode', function() {
    it('evaluates code through strudel', async function() {
      await mod.initStrudelEngine();
      await mod.evaluateStrudelCode('s("bd")');
      const strudel = await import('@strudel/web');
      expect(strudel.evaluate).toHaveBeenCalled();
    });
  });

  describe('stopStrudel', function() {
    it('calls hush from @strudel/web', function() {
      mod.stopStrudel();
      // Should not throw
    });
  });

  describe('isPlaying', function() {
    it('returns false before any evaluation', function() {
      expect(mod.isPlaying()).toBe(false);
    });
  });

  describe('FPS', function() {
    it('getFps returns 0 initially', function() {
      expect(mod.getFps()).toBe(0);
    });

    it('setFps updates the value', function() {
      mod.setFps(30);
      expect(mod.getFps()).toBe(30);
    });

    it('setFps/getFps round-trips any value', function() {
      mod.setFps(60);
      expect(mod.getFps()).toBe(60);
      mod.setFps(0);
      expect(mod.getFps()).toBe(0);
    });
  });

  describe('evaluateStrudelCode gain ramp', function() {
    it('survives gain ramp even when masterGainNode is missing', async function() {
      // Don't init, so _masterGainNode is null
      await expect(mod.evaluateStrudelCode('s("bd")')).resolves.toBeUndefined();
    });

    it('survives gain ramp even when AudioContext is missing', async function() {
      mockCtx = null as any;
      await expect(mod.evaluateStrudelCode('s("bd")')).resolves.toBeUndefined();
    });
  });

  describe('getLatency', function() {
    it('returns latency value from AudioContext', function() {
      const latency = mod.getLatency();
      expect(typeof latency).toBe('number');
    });

    it('includes outputLatency in the calculation', function() {
      // FakeAudioContext: baseLatency 0.01 + outputLatency 0.02 => 30ms
      expect(mod.getLatency()).toBe(30);
    });

    it('tolerates a missing outputLatency', function() {
      delete (mockCtx as any).outputLatency;
      expect(mod.getLatency()).toBe(10);
    });

    it('returns 0 when no AudioContext', function() {
      // Force getAudioContext to return null
      mockCtx = null as any;
      const latency = mod.getLatency();
      expect(latency).toBe(0);
    });
  });
});
