import { useState } from 'react';
import { Boxes, ChevronDown, ChevronRight } from 'lucide-react';
import { MODIFIERS_BY_CATEGORY, type ModifierDef } from '@/lib/modifier-registry';
import { defaultEffectValue } from '@/lib/visual/visual-model';
import { blockDrag, type LegoPayload } from '@/lib/blocks/drag-controller';

interface BlockPaletteProps {
  enabled: boolean;
}

const PATTERN_LEGOS: { label: string; code: string }[] = [
  { label: 'kick', code: '$: s("bd ~ bd ~")' },
  { label: 'snare', code: '$: s("~ sd ~ sd")' },
  { label: 'hats', code: '$: s("hh hh hh hh")' },
  { label: 'bass', code: '$: note("c2 ~ c2 ~").s("sawtooth").gain(0.5)' },
  { label: 'melody', code: '$: note("c3 e3 g3 b3").s("sawtooth").gain(0.3)' },
];

const COMBINATOR_NAMES = ['stack', 'cat'];

function methodFor(mod: ModifierDef): string {
  if (mod.controlType === 'none') return `.${mod.name}()`;
  const value = defaultEffectValue(mod.name);
  return typeof value === 'string' ? `.${mod.name}("${value}")` : `.${mod.name}(${value})`;
}

function Lego({
  testId,
  label,
  payload,
  title,
}: {
  testId: string;
  label: string;
  payload: LegoPayload;
  title: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        blockDrag.start(payload, e.clientX, e.clientY);
      }}
      className="w-full text-left text-[10px] font-mono px-1.5 py-1 rounded border border-strudel-surface-light bg-strudel-dark text-muted-foreground hover:text-white hover:border-strudel-accent cursor-grab active:cursor-grabbing"
    >
      {label}
    </button>
  );
}

export default function BlockPalette({ enabled }: BlockPaletteProps) {
  const [open, setOpen] = useState(true);

  if (!enabled) return null;

  return (
    <div
      data-testid="block-palette"
      className="absolute top-2 right-2 z-20 w-44 rounded border border-strudel-surface-light bg-strudel-surface/95 backdrop-blur-sm shadow-lg"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 border-b border-strudel-surface-light text-[10px] font-bold text-strudel-accent uppercase"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Boxes size={12} />
        Lego palette
      </button>

      {open && (
        <div className="max-h-[45vh] overflow-auto p-1.5 space-y-2">
          <div className="space-y-1">
            <div className="text-[8px] uppercase text-muted-foreground px-0.5">Patterns</div>
            {PATTERN_LEGOS.map((p) => (
              <Lego
                key={p.label}
                testId={`lego-pattern-${p.label}`}
                label={p.label}
                title={p.code}
                payload={{ kind: 'pattern', label: p.label, code: p.code }}
              />
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-[8px] uppercase text-muted-foreground px-0.5">Effects</div>
            {MODIFIERS_BY_CATEGORY.audio.map((mod) => (
              <Lego
                key={mod.name}
                testId={`lego-effect-${mod.name}`}
                label={mod.name}
                title={mod.detail}
                payload={{ kind: 'method', label: mod.name, method: methodFor(mod) }}
              />
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-[8px] uppercase text-muted-foreground px-0.5">Transforms</div>
            {MODIFIERS_BY_CATEGORY.pattern.map((mod) => (
              <Lego
                key={mod.name}
                testId={`lego-transform-${mod.name}`}
                label={mod.name}
                title={mod.detail}
                payload={{ kind: 'method', label: mod.name, method: methodFor(mod) }}
              />
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-[8px] uppercase text-muted-foreground px-0.5">Combinators</div>
            {MODIFIERS_BY_CATEGORY.combinator
              .filter((mod) => COMBINATOR_NAMES.includes(mod.name))
              .map((mod) => (
                <Lego
                  key={mod.name}
                  testId={`lego-combinator-${mod.name}`}
                  label={mod.name}
                  title={mod.detail}
                  payload={{ kind: 'combinator', label: mod.name, wrapper: mod.name as 'stack' | 'cat' }}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
