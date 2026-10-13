import { initStrudel, evaluate, hush, getAudioContext } from '@strudel/web';
// @ts-expect-error - exported at runtime from @strudel/web dist bundle but not in type declarations
import { getSuperdoughAudioController as getSuperdoughController } from '@strudel/web';
import { loadManifest, scanAndRegisterBanks, rehydrateCustomSamples, processCodeSamples } from './sample-registry';

let strudelInitialized = false;
let isPlayingState = false;

let _miniLocations: number[][] = [];
let _lastActiveCode = '';
let _masterGainNode: GainNode | null = null;
let _onStateUpdate: ((s: StrudelVisualState) => void) | null = null;

export interface StrudelVisualState {
  miniLocations: number[][];
  activeCode: string;
  started: boolean;
  widgets: any[];
}

export function onStrudelStateUpdate(cb: (s: StrudelVisualState) => void) {
  _onStateUpdate = cb;
}

export function getMiniLocations(): number[][] { return _miniLocations; }
export function getActiveCode(): string { return _lastActiveCode; }

function log(msg: string): void {
  // console.log(`[Strudel] ${msg}`);
}

async function registerDefaultResources(): Promise<void> {
  try { const { registerSoundfonts } = await import('@strudel/soundfonts'); registerSoundfonts(); log('registerDefaultResources: GM soundfonts loaded'); } catch { log('registerDefaultResources: GM soundfonts skipped'); }
}

export async function initStrudelEngine(): Promise<void> {
  if (strudelInitialized) return;
  try {
    log('initStrudelEngine: calling initStrudel()...');
    await initStrudel({
      prebake: registerDefaultResources,
      onUpdateState: (state: any) => {
        _miniLocations = state.miniLocations || [];
        _lastActiveCode = state.activeCode || '';
        _onStateUpdate?.({
          miniLocations: _miniLocations,
          activeCode: _lastActiveCode,
          started: state.started,
          widgets: state.widgets || [],
        });
      },
    });
    log('initStrudelEngine: initStrudel() returned');

    try {
      const { registerWidgetType } = await import('@strudel/transpiler');
      ['pianoroll', 'punchcard', 'spiral', 'scope', 'tscope', 'fscope', 'spectrum', 'pitchwheel', 'animate', 'wordfall'].forEach(registerWidgetType);
      log('initStrudelEngine: widget types registered in transpiler');
    } catch (e: unknown) { log(`initStrudelEngine: widget registration failed - ${e instanceof Error ? e.message : String(e)}`); }

    strudelInitialized = true;

    // Preload bank manifest and soundfonts so live evaluation avoids async I/O
    loadManifest().catch(() => {});

    // Create a master gain node and insert it into the audio graph
    try {
      const ctx = getStrudelAudioContext();
      if (ctx) {
        _masterGainNode = ctx.createGain();
        _masterGainNode.gain.value = 1.0;
        // Reroute superdough's destinationGain through master gain so
        // setMasterVolume() controls the whole output.
        const destGain = getSuperdoughDestination();
        if (destGain) {
          destGain.disconnect();
          destGain.connect(_masterGainNode);
        }
        _masterGainNode.connect(ctx.destination);
      }
    } catch (e) { log(`initStrudelEngine: master gain setup failed - ${e}`); }

    try { log('initStrudelEngine: rehydrating...'); await rehydrateCustomSamples(); log('initStrudelEngine: rehydrate done'); } catch (e: unknown) { log(`initStrudelEngine: rehydrate failed - ${e instanceof Error ? e.message : String(e)}`); }
    log('initStrudelEngine: ready');
  } catch (error: unknown) { log(`initStrudelEngine: FATAL - ${error instanceof Error ? error.message : String(error)}`); throw error; }
}

async function audioSelfTest(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) { log('audio self-test: no AudioContext'); return; }
  log(`audio self-test: state="${ctx.state}" sr=${ctx.sampleRate}`);
  try {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    gain.gain.value = 0.15; osc.type = 'sine'; osc.frequency.value = 440;
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime; osc.start(now); osc.stop(now + 0.5);
    log('audio self-test: 440Hz scheduled');
  } catch (e: unknown) { log(`audio self-test: FAILED - ${e instanceof Error ? e.message : String(e)}`); }
}

export async function evaluateStrudelCode(code: string, onProgress?: (msg: string) => void): Promise<void> {
  if (!strudelInitialized) await initStrudelEngine();
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') await ctx.resume();
    await scanAndRegisterBanks(code);
    const processedCode = await processCodeSamples(code, onProgress);

    // Gain ramp: fade out before evaluation to mask audio gap
    let savedGain = 1.0;
    if (_masterGainNode && ctx) {
      try {
        savedGain = _masterGainNode.gain.value;
        const fadeNow = ctx.currentTime;
        _masterGainNode.gain.setValueAtTime(savedGain, fadeNow);
        _masterGainNode.gain.linearRampToValueAtTime(0.001, fadeNow + 0.02);
        await new Promise(r => setTimeout(r, 30));
      } catch {
        _masterGainNode.gain.value = savedGain;
      }
    }

    await evaluate(processedCode, true);
    isPlayingState = true;

    // Gain ramp: fade back in after evaluation
    if (_masterGainNode && ctx) {
      try {
        const fadeNow = ctx.currentTime;
        _masterGainNode.gain.setValueAtTime(0.001, fadeNow);
        _masterGainNode.gain.linearRampToValueAtTime(savedGain, fadeNow + 0.05);
      } catch {
        _masterGainNode.gain.value = savedGain;
      }
    }
  } catch (error: unknown) { throw error; }
}

export function stopStrudel(): void { try { hush(); } catch {} isPlayingState = false; }
export function getStrudelAudioContext(): AudioContext | null { try { return getAudioContext(); } catch { return null; } }

/**
 * Returns superdough's output gain node regardless of bundle shape.
 *
 * `getSuperdoughAudioController()` historically exposed the gain node as
 * `controller.output.destinationGain`; some builds also flatten it to
 * `controller.destinationGain`. Callers must use the same node for connect and
 * disconnect, so this accessor is the single source of truth.
 */
export function getSuperdoughDestination(): GainNode | null {
  try {
    const controller = getSuperdoughController?.() as
      | { destinationGain?: GainNode; output?: { destinationGain?: GainNode } }
      | undefined;
    return controller?.output?.destinationGain ?? controller?.destinationGain ?? null;
  } catch {
    return null;
  }
}
export function setMasterVolume(volume: number): void {
  if (_masterGainNode) {
    _masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
  }
}
export function isPlaying(): boolean { return isPlayingState; }

let _fpsValue = 0;
export function getFps(): number { return _fpsValue; }
export function setFps(fps: number): void { _fpsValue = fps; }

export function getLatency(): number {
  try {
    const ctx = getStrudelAudioContext();
    if (!ctx) return 0;
    const outputLatency = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((ctx.baseLatency + outputLatency) * 1000) || 0;
  } catch { return 0; }
}
