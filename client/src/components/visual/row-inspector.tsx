import { X } from 'lucide-react';
import { getModifierDef } from '@/lib/modifier-registry';
import { isGridRow, SAMPLE_CHOICES, type VisualEffect, type VisualRow } from '@/lib/visual/visual-model';
import EffectPalette from './effect-palette';

interface RowInspectorProps {
  row: VisualRow | null;
  onUpdateSource: (rowId: string, source: string) => void;
  onUpdateName: (rowId: string, name: string) => void;
  onAddEffect: (rowId: string, name: string) => void;
  onUpdateEffect: (rowId: string, index: number, value: number | string) => void;
  onRemoveEffect: (rowId: string, index: number) => void;
}

export default function RowInspector({
  row,
  onUpdateSource,
  onUpdateName,
  onAddEffect,
  onUpdateEffect,
  onRemoveEffect,
}: RowInspectorProps) {
  if (!row) {
    return (
      <div className="text-[10px] text-muted-foreground px-2 py-2">
        Select a row to edit its sound and effects.
      </div>
    );
  }

  if (!isGridRow(row)) {
    return (
      <div className="px-2 py-2 space-y-1">
        <div className="text-[10px] text-yellow-400 font-bold uppercase">Code-only row (locked)</div>
        <pre className="text-[9px] text-muted-foreground font-mono whitespace-pre-wrap max-h-24 overflow-auto bg-strudel-dark rounded p-1">
          {row.code}
        </pre>
        <p className="text-[9px] text-muted-foreground">
          This block uses Strudel features the grid can't represent, so it is preserved verbatim.
        </p>
      </div>
    );
  }

  const existing = row.effects.map((e) => e.name);

  return (
    <div className="px-2 py-2 space-y-2" data-testid="row-inspector">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
        <span className="text-[10px] text-strudel-accent font-bold uppercase">
          {row.kind === 'note' ? 'Note row' : 'Drum row'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[9px] text-muted-foreground w-10 shrink-0">Name</label>
        <input
          data-testid="row-name"
          value={row.name}
          onChange={(e) => onUpdateName(row.id, e.target.value)}
          className="flex-1 bg-strudel-dark border border-strudel-surface-light rounded text-[10px] text-white px-1 py-0.5"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[9px] text-muted-foreground w-10 shrink-0">
          {row.kind === 'note' ? 'Sound' : 'Sample'}
        </label>
        <input
          data-testid="row-source"
          list="visual-sample-choices"
          value={row.source}
          onChange={(e) => onUpdateSource(row.id, e.target.value)}
          className="flex-1 bg-strudel-dark border border-strudel-surface-light rounded text-[10px] text-white px-1 py-0.5"
        />
        <datalist id="visual-sample-choices">
          {SAMPLE_CHOICES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1">
        <div className="text-[9px] text-muted-foreground uppercase font-bold">Effects</div>
        {row.effects.map((effect: VisualEffect, i: number) => {
          const def = getModifierDef(effect.name);
          const min = def?.defaultMin ?? 0;
          const max = def?.defaultMax ?? 1;
          const step = def?.defaultStep ?? 0.01;
          return (
            <div key={`${effect.name}-${i}`} className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground w-12 shrink-0 font-mono">{effect.name}</span>
              {effect.raw && (
                <input
                  value={typeof effect.value === 'string' ? effect.value : String(effect.value)}
                  onChange={(e) => onUpdateEffect(row.id, i, e.target.value)}
                  className="flex-1 bg-strudel-dark border border-strudel-surface-light rounded text-[10px] text-strudel-accent font-mono px-1 py-0.5"
                  title="Raw expression (e.g. rev, perlin.range(0,1), 1/16, x=>x.add(4))"
                />
              )}
              {!effect.raw && def?.controlType === 'slider' && (
                <>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={typeof effect.value === 'number' ? effect.value : min}
                    onChange={(e) => onUpdateEffect(row.id, i, parseFloat(e.target.value))}
                    className="flex-1 h-1 accent-strudel-accent cursor-pointer min-w-0"
                  />
                  <span className="text-[9px] text-muted-foreground font-mono w-10 text-right tabular-nums">
                    {typeof effect.value === 'number' ? effect.value.toFixed(step < 0.1 ? 2 : 1) : ''}
                  </span>
                </>
              )}
              {!effect.raw && def?.controlType === 'text' && (
                <input
                  value={typeof effect.value === 'string' ? effect.value : ''}
                  onChange={(e) => onUpdateEffect(row.id, i, e.target.value)}
                  className="flex-1 bg-strudel-dark border border-strudel-surface-light rounded text-[10px] text-white px-1 py-0.5"
                />
              )}
              {!effect.raw && def?.controlType === 'none' && (
                <span className="flex-1 text-[9px] text-muted-foreground">on</span>
              )}
              <button
                type="button"
                onClick={() => onRemoveEffect(row.id, i)}
                className="shrink-0 text-muted-foreground hover:text-red-400"
                title="Remove effect"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <EffectPalette existing={existing} onAdd={(name) => onAddEffect(row.id, name)} />
      </div>
    </div>
  );
}
