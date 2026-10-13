import * as monaco from 'monaco-editor';

interface Completion {
  label: string;
  detail: string;
  insertText: string;
  kind: monaco.languages.CompletionItemKind;
}

const FUNCTIONS: Completion[] = [
  { label: 's', detail: 'Set sample name', insertText: 's("$1")', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'note', detail: 'Play a note or sequence', insertText: 'note("$1")', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'n', detail: 'Set note/sample index', insertText: 'n($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'gain', detail: 'Set volume gain', insertText: 'gain($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'lpf', detail: 'Low-pass filter cutoff', insertText: 'lpf($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'hpf', detail: 'High-pass filter cutoff', insertText: 'hpf($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'delay', detail: 'Delay effect amount', insertText: 'delay($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'room', detail: 'Reverb room size', insertText: 'room($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'rsize', detail: 'Reverb size', insertText: 'rsize($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'begin', detail: 'Sample begin position', insertText: 'begin($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'end', detail: 'Sample end position', insertText: 'end($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'loop', detail: 'Loop sample', insertText: 'loop($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'clip', detail: 'Clip length', insertText: 'clip($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'mask', detail: 'Mask pattern events', insertText: 'mask($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'cpm', detail: 'Set cycles per minute', insertText: 'cpm($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'scale', detail: 'Set scale', insertText: 'scale("$1")', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'attack', detail: 'Envelope attack', insertText: 'attack($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'decay', detail: 'Envelope decay', insertText: 'decay($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'sustain', detail: 'Envelope sustain', insertText: 'sustain($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'release', detail: 'Envelope release', insertText: 'release($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'add', detail: 'Add a value', insertText: 'add($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'sub', detail: 'Subtract a value', insertText: 'sub($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'fast', detail: 'Speed up pattern', insertText: 'fast($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'slow', detail: 'Slow down pattern', insertText: 'slow($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'rev', detail: 'Reverse pattern', insertText: 'rev()', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'jux', detail: 'Juxtapose stereo', insertText: 'jux($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'ply', detail: 'Repeat each event', insertText: 'ply($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'off', detail: 'Offset pattern', insertText: 'off($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'sometimes', detail: 'Apply sometimes', insertText: 'sometimes($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'often', detail: 'Apply often', insertText: 'often($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'rarely', detail: 'Apply rarely', insertText: 'rarely($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'degradeBy', detail: 'Degrade pattern', insertText: 'degradeBy($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'superimpose', detail: 'Superimpose pattern', insertText: 'superimpose($1)', kind: monaco.languages.CompletionItemKind.Function },
  { label: 'voicings', detail: 'Chord voicings', insertText: 'voicings($1)', kind: monaco.languages.CompletionItemKind.Function },
];

const COMBINATORS: Completion[] = [
  { label: 'stack', detail: 'Combine patterns vertically', insertText: 'stack(\n  $1\n)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'cat', detail: 'Concatenate patterns sequentially', insertText: 'cat($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'slowcat', detail: 'Slow concatenation', insertText: 'slowcat($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'fastcat', detail: 'Fast concatenation', insertText: 'fastcat($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'arrange', detail: 'Arrange sections', insertText: 'arrange($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'xfade', detail: 'Crossfade patterns', insertText: 'xfade($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'sometimesBy', detail: 'Apply by probability', insertText: 'sometimesBy($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'every', detail: 'Apply every n cycles', insertText: 'every($1)', kind: monaco.languages.CompletionItemKind.Snippet },
  { label: 'when', detail: 'Conditional application', insertText: 'when($1)', kind: monaco.languages.CompletionItemKind.Snippet },
];

const SAMPLES: Completion[] = [
  { label: 'bd', detail: 'Bass drum', insertText: 'bd', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'sd', detail: 'Snare drum', insertText: 'sd', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'hh', detail: 'Hi-hat', insertText: 'hh', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'oh', detail: 'Open hi-hat', insertText: 'oh', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'cp', detail: 'Clap', insertText: 'cp', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'rim', detail: 'Rim shot', insertText: 'rim', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'crash', detail: 'Crash cymbal', insertText: 'crash', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'ride', detail: 'Ride cymbal', insertText: 'ride', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'clap', detail: 'Clap', insertText: 'clap', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'tom', detail: 'Tom drum', insertText: 'tom', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'piano', detail: 'Piano', insertText: 'piano', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'sawtooth', detail: 'Sawtooth wave', insertText: 'sawtooth', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'sine', detail: 'Sine wave', insertText: 'sine', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'square', detail: 'Square wave', insertText: 'square', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'triangle', detail: 'Triangle wave', insertText: 'triangle', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'bass', detail: 'Bass synth', insertText: 'bass', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'pad', detail: 'Pad synth', insertText: 'pad', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'lead', detail: 'Lead synth', insertText: 'lead', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'pluck', detail: 'Pluck synth', insertText: 'pluck', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'bell', detail: 'Bell', insertText: 'bell', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'arp', detail: 'Arpeggio', insertText: 'arp', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'organ', detail: 'Organ', insertText: 'organ', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'reese', detail: 'Reese bass', insertText: 'reese', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'wobble', detail: 'Wobble bass', insertText: 'wobble', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'subbass', detail: 'Sub bass', insertText: 'subbass', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'acid', detail: 'Acid bass', insertText: 'acid', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'noise', detail: 'Noise', insertText: 'noise', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'wind', detail: 'Wind', insertText: 'wind', kind: monaco.languages.CompletionItemKind.Struct },
  { label: 'vinyl', detail: 'Vinyl crackle', insertText: 'vinyl', kind: monaco.languages.CompletionItemKind.Struct },
];

function toMonaco(c: Completion): monaco.languages.CompletionItem {
  return {
    label: c.label,
    detail: c.detail,
    insertText: c.insertText,
    kind: c.kind,
    range: undefined as any,
  };
}

export function registerStrudelCompletions(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('strudel', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const all = [...FUNCTIONS, ...COMBINATORS, ...SAMPLES].map(c => ({
        ...toMonaco(c),
        range,
      }));
      return { suggestions: all };
    },
  });
}

export function registerStrudelHover(): monaco.IDisposable {
  return monaco.languages.registerHoverProvider('strudel', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const all = [...FUNCTIONS, ...COMBINATORS, ...SAMPLES];
      const match = all.find(c => c.label === word.word);
      if (!match) return null;
      return {
        contents: [{ value: `**${match.label}** — ${match.detail}` }],
      };
    },
  });
}
