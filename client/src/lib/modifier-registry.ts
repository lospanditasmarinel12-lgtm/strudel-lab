export interface ModifierDef {
  name: string;
  detail: string;
  syntax: string;
  category: 'audio' | 'pattern' | 'combinator' | 'value';
  controlType: 'slider' | 'none' | 'text';
  defaultMin?: number;
  defaultMax?: number;
  defaultStep?: number;
}

const AUDIO: ModifierDef[] = [
  { name: 'gain', detail: 'Set volume gain', syntax: 'gain(0.5)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 2, defaultStep: 0.01 },
  { name: 'lpf', detail: 'Low-pass filter cutoff frequency', syntax: 'lpf(800)', category: 'audio', controlType: 'slider', defaultMin: 20, defaultMax: 20000, defaultStep: 10 },
  { name: 'hpf', detail: 'High-pass filter cutoff frequency', syntax: 'hpf(200)', category: 'audio', controlType: 'slider', defaultMin: 20, defaultMax: 20000, defaultStep: 10 },
  { name: 'delay', detail: 'Delay effect amount', syntax: 'delay(0.3)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.01 },
  { name: 'room', detail: 'Reverb room size', syntax: 'room(0.5)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.01 },
  { name: 'rsize', detail: 'Reverb size', syntax: 'rsize(0.7)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.01 },
  { name: 'begin', detail: 'Sample begin position', syntax: 'begin(0.25)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.01 },
  { name: 'end', detail: 'Sample end position', syntax: 'end(0.75)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.01 },
  { name: 'loop', detail: 'Loop sample region', syntax: 'loop(1)', category: 'audio', controlType: 'none' },
  { name: 'clip', detail: 'Clip length in cycles', syntax: 'clip(1)', category: 'audio', controlType: 'slider', defaultMin: 0.1, defaultMax: 4, defaultStep: 0.1 },
  { name: 'attack', detail: 'Envelope attack time', syntax: 'attack(0.01)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.001 },
  { name: 'decay', detail: 'Envelope decay time', syntax: 'decay(0.3)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 2, defaultStep: 0.01 },
  { name: 'sustain', detail: 'Envelope sustain level', syntax: 'sustain(0.8)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.01 },
  { name: 'release', detail: 'Envelope release time', syntax: 'release(0.5)', category: 'audio', controlType: 'slider', defaultMin: 0, defaultMax: 4, defaultStep: 0.01 },
  { name: 'bank', detail: 'Select the sample bank', syntax: 'bank("RolandTR909")', category: 'audio', controlType: 'text' },
];

const PATTERN: ModifierDef[] = [
  { name: 'fast', detail: 'Speed up pattern', syntax: 'fast(2)', category: 'pattern', controlType: 'slider', defaultMin: 0.25, defaultMax: 8, defaultStep: 0.25 },
  { name: 'slow', detail: 'Slow down pattern', syntax: 'slow(2)', category: 'pattern', controlType: 'slider', defaultMin: 0.25, defaultMax: 8, defaultStep: 0.25 },
  { name: 'rev', detail: 'Reverse pattern', syntax: 'rev()', category: 'pattern', controlType: 'none' },
  { name: 'jux', detail: 'Juxtapose stereo', syntax: 'jux(rev)', category: 'pattern', controlType: 'none' },
  { name: 'ply', detail: 'Repeat each event N times', syntax: 'ply(2)', category: 'pattern', controlType: 'slider', defaultMin: 1, defaultMax: 16, defaultStep: 1 },
  { name: 'off', detail: 'Offset pattern by time', syntax: 'off(0.25)', category: 'pattern', controlType: 'slider', defaultMin: 0, defaultMax: 4, defaultStep: 0.125 },
  { name: 'add', detail: 'Add a value to events', syntax: 'add(0.5)', category: 'pattern', controlType: 'slider', defaultMin: -2, defaultMax: 2, defaultStep: 0.1 },
  { name: 'sub', detail: 'Subtract a value from events', syntax: 'sub(0.5)', category: 'pattern', controlType: 'slider', defaultMin: -2, defaultMax: 2, defaultStep: 0.1 },
  { name: 'sometimes', detail: 'Apply effect sometimes', syntax: 'sometimes(rev)', category: 'pattern', controlType: 'none' },
  { name: 'often', detail: 'Apply effect often', syntax: 'often(rev)', category: 'pattern', controlType: 'none' },
  { name: 'rarely', detail: 'Apply effect rarely', syntax: 'rarely(rev)', category: 'pattern', controlType: 'none' },
  { name: 'degradeBy', detail: 'Degrade pattern by probability', syntax: 'degradeBy(0.3)', category: 'pattern', controlType: 'slider', defaultMin: 0, defaultMax: 1, defaultStep: 0.05 },
  { name: 'superimpose', detail: 'Superimpose a transformed pattern', syntax: 'superimpose(fast(2))', category: 'pattern', controlType: 'none' },
];

const COMBINATOR: ModifierDef[] = [
  { name: 'stack', detail: 'Combine patterns vertically', syntax: 'stack(p1, p2)', category: 'combinator', controlType: 'none' },
  { name: 'cat', detail: 'Concatenate patterns sequentially', syntax: 'cat(p1, p2)', category: 'combinator', controlType: 'none' },
  { name: 'slowcat', detail: 'Slow concatenation', syntax: 'slowcat(p1, p2)', category: 'combinator', controlType: 'none' },
  { name: 'fastcat', detail: 'Fast concatenation', syntax: 'fastcat(p1, p2)', category: 'combinator', controlType: 'none' },
  { name: 'arrange', detail: 'Arrange sections in sequence', syntax: 'arrange([a, b, c])', category: 'combinator', controlType: 'none' },
  { name: 'xfade', detail: 'Crossfade between patterns', syntax: 'xfade(p1, p2, 0.5)', category: 'combinator', controlType: 'none' },
  { name: 'sometimesBy', detail: 'Apply by exact probability', syntax: 'sometimesBy(0.75, rev)', category: 'combinator', controlType: 'none' },
  { name: 'every', detail: 'Apply every N cycles', syntax: 'every(4, rev)', category: 'combinator', controlType: 'none' },
  { name: 'when', detail: 'Conditional application', syntax: 'when(<0.5, rev)', category: 'combinator', controlType: 'none' },
];

const VALUE: ModifierDef[] = [
  { name: 'cpm', detail: 'Set cycles per minute', syntax: 'cpm(60)', category: 'value', controlType: 'slider', defaultMin: 20, defaultMax: 300, defaultStep: 5 },
  { name: 'scale', detail: 'Set musical scale', syntax: 'scale("C major")', category: 'value', controlType: 'text' },
  { name: 'mask', detail: 'Mask pattern events by index', syntax: 'mask(0)', category: 'value', controlType: 'none' },
  { name: 'voicings', detail: 'Set chord voicings', syntax: 'voicings("drop2")', category: 'value', controlType: 'text' },
  { name: 'n', detail: 'Set note/sample index', syntax: 'n(0)', category: 'value', controlType: 'slider', defaultMin: 0, defaultMax: 127, defaultStep: 1 },
];

export const ALL_MODIFIERS: ModifierDef[] = [...AUDIO, ...PATTERN, ...COMBINATOR, ...VALUE];

export const MODIFIERS_BY_CATEGORY = {
  audio: AUDIO,
  pattern: PATTERN,
  combinator: COMBINATOR,
  value: VALUE,
};

export const CATEGORY_LABELS: Record<string, string> = {
  audio: 'Audio Effects',
  pattern: 'Pattern Transformers',
  combinator: 'Combinators',
  value: 'Values & Settings',
};

export function getModifierDef(name: string): ModifierDef | undefined {
  return ALL_MODIFIERS.find(m => m.name === name);
}

export function isSliderModifier(name: string): boolean {
  const def = getModifierDef(name);
  return def?.controlType === 'slider';
}

export function getModifierCategory(name: string): string {
  const def = getModifierDef(name);
  return def?.category ?? 'audio';
}
