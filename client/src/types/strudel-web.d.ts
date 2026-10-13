declare module '@strudel/web' {
  export function initStrudel(options?: any): Promise<any>;
  export function evaluate(code: string, autoplay?: boolean): Promise<any>;
  export function hush(): void;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(context: AudioContext): AudioContext;
  export function superdoughTrigger(t: number, hap: { s: string; gain?: number; n?: number; duration?: number; bank?: string; [key: string]: any }, ct: number, cps: number): void;
  export function getAudioContextCurrentTime(): number;
  export function samples(obj: Record<string, string[]>, src?: string): void;
  export function doughTrigger(hap: { value: any; s: string; duration: number }, currentTime: number, cps: number, time: number): void;
  export const stop: typeof hush;
  export function s(pattern: string): any;
  export function note(pattern: string): any;
  export function getTime(): number;
  export function getPattern(): any;
  // Mini-notation parser (authoritative; re-exported from @strudel/mini).
  export function mini2ast(code: string): any;
  export function mini(...args: string[]): any;
  export function parse(code: string): any;
  export function patternifyAST(...args: any[]): any;
  export function getLeaves(...args: any[]): any[];
  export function getLeafLocations(...args: any[]): any[];
  export function miniAllStrings(...args: any[]): any;
  export function minify(...args: any[]): any;
  export class Pattern {
    prototype: any;
    static prototype: any;
    constructor(...args: any[]): any;
    play(): any;
    pianoroll(opts?: any): any;
    punchcard(opts?: any): any;
    spiral(opts?: any): any;
    scope(opts?: any): any;
    tscope(opts?: any): any;
    fscope(opts?: any): any;
    spectrum(opts?: any): any;
    pitchwheel(opts?: any): any;
    animate(opts?: any): any;
    wordfall(opts?: any): any;
    draw(fn: Function, opts?: any): any;
    onPaint(fn: Function): any;
    onTrigger(fn: Function, dominant?: boolean): any;
    analyze(id: string): any;
  }
}

declare module '@strudel/core' {
  export function getTime(): number;
  export function getPattern(): any;
  export class Pattern {
    prototype: any;
    constructor(...args: any[]): any;
  }
}

declare module '@strudel/draw' {
  export function getDrawContext(id?: string, options?: any): CanvasRenderingContext2D & { canvas: HTMLCanvasElement };
  export function getTheme(): any;
  export function setTheme(theme: any): void;
  export function __pianoroll(opts: any): void;
  export function getPunchcardPainter(opts?: any): any;
  export function getDrawOptions(drawTime: any, opts?: any): any;
  export function drawPianoroll(opts: any): void;
}

declare module '@strudel/draw/spiral.mjs' {
  export function drawSpiral(options: any): void;
}

declare module '@strudel/draw/pitchwheel.mjs' {
  export function pitchwheel(options: any): void;
}

declare module '@strudel/webaudio' {
  export const analysers: Record<string, AnalyserNode>;
  export function getAnalyzerData(type: string, id: string): Float32Array;
  export function drawTimeScope(analyser: AnalyserNode | null, config?: any): void;
  export function drawFrequencyScope(analyser: AnalyserNode | null, config?: any): void;
  export function drawSpectrum(analyser: AnalyserNode | null, config?: any): void;
  export function webaudioRepl(opts?: any): any;
  export function registerSynthSounds(): void;
  export function initAudioOnFirstClick(): void;
  export const webaudioOutput: any;
}

declare module '@strudel/transpiler' {
  export function registerWidgetType(name: string): void;
  export const transpiler: any;
  export function evaluate(code: string, autoplay?: boolean): Promise<any>;
}

declare module '@strudel/soundfonts' {
  export function registerSoundfonts(): void;
}

declare module 'superdough' {
  export function registerSampleSource(key: string, bank: any, params?: any): void;
  export function registerSound(key: string, onTrigger: Function, data?: any): void;
  export function resetLoadedSounds(): void;
}

declare module 'superdough/sampler.mjs' {
  export function registerSampleSource(key: string, bank: any, params?: any): void;
  export function registerSound(key: string, onTrigger: Function, data?: any): void;
  export function loadBuffer(url: string, ac: AudioContext, s?: string, n?: number): Promise<AudioBuffer>;
}
