import { useState } from 'react';
import { Boxes, ChevronDown, ChevronRight } from 'lucide-react';
import { blocksByCategory, toPayload, type BlockCategory, type BlockDef } from '@/lib/blocks/block-registry';
import { blockDrag } from '@/lib/blocks/drag-controller';

interface BlockPaletteProps {
  enabled: boolean;
}

const CATEGORY_ORDER: BlockCategory[] = ['pattern', 'effect', 'transform', 'combinator', 'value'];

const CATEGORY_TITLES: Record<BlockCategory, string> = {
  pattern: 'Patterns',
  effect: 'Effects',
  transform: 'Transforms',
  combinator: 'Combinators',
  value: 'Values',
};

function Lego({ def }: { def: BlockDef }) {
  const title = def.code ?? (def.field ? `${def.method} (default ${String(def.field.shadow)})` : def.detail ?? '');
  return (
    <button
      type="button"
      data-testid={`lego-${def.category}-${def.label}`}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        blockDrag.start(toPayload(def), e.clientX, e.clientY);
      }}
      className="w-full text-left text-[10px] font-mono px-1.5 py-1 rounded border border-strudel-surface-light bg-strudel-dark text-muted-foreground hover:text-white hover:border-strudel-accent cursor-grab active:cursor-grabbing"
    >
      {def.label}
    </button>
  );
}

export default function BlockPalette({ enabled }: BlockPaletteProps) {
  const [open, setOpen] = useState(true);

  if (!enabled) return null;

  const byCategory = blocksByCategory();

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
          {CATEGORY_ORDER.map((category) => (
            <div key={category} className="space-y-1">
              <div className="text-[8px] uppercase text-muted-foreground px-0.5">{CATEGORY_TITLES[category]}</div>
              {byCategory[category].map((def) => (
                <Lego key={def.id} def={def} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
