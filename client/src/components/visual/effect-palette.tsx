import { MODIFIERS_BY_CATEGORY, CATEGORY_LABELS } from '@/lib/modifier-registry';
import { Plus } from 'lucide-react';

interface EffectPaletteProps {
  existing: string[];
  onAdd: (name: string) => void;
}

export default function EffectPalette({ existing, onAdd }: EffectPaletteProps) {
  const categories = Object.keys(MODIFIERS_BY_CATEGORY) as (keyof typeof MODIFIERS_BY_CATEGORY)[];

  return (
    <div className="flex items-center gap-1">
      <select
        data-testid="effect-palette"
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
          e.currentTarget.value = '';
        }}
        className="flex-1 bg-strudel-dark border border-strudel-surface-light rounded text-[10px] text-white px-1 py-0.5"
      >
        <option value="">+ Add effect…</option>
        {categories.map((cat) => (
          <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
            {MODIFIERS_BY_CATEGORY[cat].map((mod) => (
              <option key={mod.name} value={mod.name} disabled={existing.includes(mod.name)}>
                {mod.name}
                {existing.includes(mod.name) ? ' (added)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Plus size={10} className="text-muted-foreground shrink-0" />
    </div>
  );
}
