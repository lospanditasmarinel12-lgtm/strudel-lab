import { Pattern as StrudelPattern } from '@strudel/web';
import type { LineWidgetCanvas } from './line-widget-canvas';

let drawSpiralFn: any = null;
let pitchwheelFn: any = null;
let __pianorollFn: any = null;
let getDrawOptionsFn: any = null;
let drawTimeScopeFn: any = null;
let drawFrequencyScopeFn: any = null;
let drawSpectrumFn: any = null;
let webaudioModule: any = null;

async function loadDrawFunctions() {
  const [spiralMod, pwMod, drawMod] = await Promise.all([
    import('@strudel/draw/spiral.mjs'),
    import('@strudel/draw/pitchwheel.mjs'),
    import('@strudel/draw'),
  ]);
  drawSpiralFn = spiralMod.drawSpiral;
  pitchwheelFn = pwMod.pitchwheel;
  __pianorollFn = drawMod.__pianoroll;
  getDrawOptionsFn = drawMod.getDrawOptions;
  try {
    webaudioModule = await import('@strudel/webaudio');
    drawTimeScopeFn = webaudioModule.drawTimeScope;
    drawFrequencyScopeFn = webaudioModule.drawFrequencyScope;
    drawSpectrumFn = webaudioModule.drawSpectrum;
  } catch {}
}

function makeId(name: string, opts?: any): string {
  return opts?.id || `${name}_${Math.random().toString(36).slice(2, 8)}`;
}

export function registerInlineVisuals(
  getLineCanvas: (id: string, line?: number, w?: number, h?: number) => HTMLCanvasElement | null,
  getWidgetLine: (id: string) => number | undefined,
): void {
  const Proto = StrudelPattern.prototype as any;
  if (!Proto) { /* console.warn('[VisualRegistry] Pattern.prototype not available'); */ return; }
  // console.log('[VisualRegistry] Registering _ inline visual methods...');

  function tryGetCanvas(id: string, line: number | undefined, w?: number, h?: number): HTMLCanvasElement | null {
    try { return getLineCanvas(id, line, w, h); } catch { return null; }
  }

  Proto._pianoroll = function (options: any = {}) {
    const id = makeId('pianoroll', options);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.onPaint((_: any, time: number, haps: any[], drawTime: any) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (__pianorollFn && getDrawOptionsFn) {
        __pianorollFn({ ctx, time, haps, ...getDrawOptionsFn(drawTime, options) });
      }
    });
  };

  Proto._punchcard = function (options: any = {}) {
    const id = makeId('punchcard', options);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.onPaint((_: any, time: number, haps: any[], drawTime: any) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (__pianorollFn && getDrawOptionsFn) {
        __pianorollFn({ ctx, time, haps, ...getDrawOptionsFn(drawTime, options) });
      }
    });
  };

  Proto._wordfall = function (options: any = {}) {
    return this._punchcard({ vertical: 1, labels: 1, stroke: 0, fillActive: 1, active: 'white', ...options });
  };

  Proto._spiral = function (options: any = {}) {
    const id = makeId('spiral', options);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line, 400, 400);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.onPaint((_: any, time: number, haps: any[], drawTime: any) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (drawSpiralFn) {
        drawSpiralFn({ ctx, time, haps, drawTime, ...options });
      }
    });
  };

  Proto._scope = function (config: any = {}) {
    const id = makeId('scope', config);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.analyze(id).onPaint((_: any, _t: number, haps: any[]) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (drawTimeScopeFn && webaudioModule?.analysers?.[id]) {
        const color = haps[0]?.value?.color || 'white';
        drawTimeScopeFn(webaudioModule.analysers[id], { ...config, ctx, color, id, scale: config.scale ?? 0.5 });
      }
    });
  };

  Proto._tscope = function (config: any = {}) {
    return this._scope(config);
  };

  Proto._fscope = function (config: any = {}) {
    const id = makeId('fscope', config);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.analyze(id).onPaint(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (drawFrequencyScopeFn && webaudioModule?.analysers?.[id]) {
        drawFrequencyScopeFn(webaudioModule.analysers[id], { ...config, ctx, id });
      }
    });
  };

  Proto._spectrum = function (config: any = {}) {
    const id = makeId('spectrum', config);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line, 600, 150);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.analyze(id).onPaint((_: any, _t: number, haps: any[]) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (drawSpectrumFn && webaudioModule?.analysers?.[id]) {
        const color = haps[0]?.value?.color || 'white';
        drawSpectrumFn(webaudioModule.analysers[id], { ...config, ctx, color, id });
      }
    });
  };

  Proto._pitchwheel = function (config: any = {}) {
    const id = makeId('pitchwheel', config);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line, 300, 300);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    return this.onPaint((_: any, time: number, haps: any[], _drawTime: any) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (pitchwheelFn) {
        pitchwheelFn({ ctx, time, haps, ...config, id });
      }
    });
  };

  Proto._animate = function (options: any = {}) {
    const id = makeId('animate', options);
    const line = getWidgetLine(id);
    const canvas = tryGetCanvas(id, line);
    if (!canvas) return this;
    const ctx = canvas.getContext('2d')!;
    if (!options.callback) return this;

    let frameId = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try { options.callback(ctx, canvas.width, canvas.height); } catch {}
      if (this._animateActive !== false) {
        frameId = requestAnimationFrame(render);
      }
    };
    frameId = requestAnimationFrame(render);

    const result = this;
    result._animateActive = true;
    result._animateStop = () => {
      result._animateActive = false;
      cancelAnimationFrame(frameId);
    };
    return result;
  };

  loadDrawFunctions().then(() => {
    // console.log('[VisualRegistry] All draw renderers pre-loaded');
  });

  // console.log('[VisualRegistry] All _ inline visual methods registered');
}
