import { useMemo, useState } from 'react';
import StepGrid from '@/components/visual/step-grid';
import RowInspector from '@/components/visual/row-inspector';
import { codeToVisual } from '@/lib/visual/code-to-visual';
import { visualToCode } from '@/lib/visual/visual-to-code';
import {
  defaultEffectValue,
  isGridRow,
  setRowStepOn,
  type GridVisualRow,
  type VisualModel,
} from '@/lib/visual/visual-model';
import { useStrudelPlayhead } from '@/hooks/use-strudel-playhead';

interface GridPanelProps {
  code: string;
  onChange: (code: string) => void;
}

/**
 * First-class step-grid panel over the shared visual model. Edits serialize
 * back to code (text stays the source of truth).
 */
export default function GridPanel({ code, onChange }: GridPanelProps) {
  const model = useMemo<VisualModel>(() => codeToVisual(code), [code]);
  const activeStep = useStrudelPlayhead(model.stepsPerCycle);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const gridRows = model.rows.filter(isGridRow) as GridVisualRow[];
  const selected = gridRows.find((r) => r.id === selectedId) ?? gridRows[0] ?? null;

  const replaceRow = (row: GridVisualRow) => {
    const next: VisualModel = { ...model, rows: model.rows.map((r) => (r.id === row.id ? row : r)) };
    onChange(visualToCode(next));
  };

  if (gridRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-xs text-muted-foreground">
        No grid rows yet — write a simple <code className="mx-1 text-strudel-accent">s(&quot;…&quot;)</code> or{' '}
        <code className="mx-1 text-strudel-accent">note(&quot;…&quot;)</code> pattern.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 overflow-hidden">
        <StepGrid
          model={{ stepsPerCycle: model.stepsPerCycle, rows: gridRows }}
          selectedRowId={selected?.id ?? null}
          activeStep={activeStep}
          onSelectRow={setSelectedId}
          onToggleStep={(id, i, on) => {
            const r = gridRows.find((x) => x.id === id);
            if (r) replaceRow(setRowStepOn(r, i, on));
          }}
          onToggleMute={(id) => {
            const r = gridRows.find((x) => x.id === id);
            if (r) replaceRow({ ...r, muted: !r.muted });
          }}
          onRemoveRow={(id) => onChange(visualToCode({ ...model, rows: model.rows.filter((r) => r.id !== id) }))}
        />
      </div>
      <div className="w-64 shrink-0 border-l border-strudel-surface-light overflow-auto">
        <RowInspector
          row={selected}
          onUpdateSource={(_id, source) => selected && replaceRow({ ...selected, source })}
          onUpdateName={(_id, name) => selected && replaceRow({ ...selected, name })}
          onAddEffect={(_id, name) =>
            selected && replaceRow({ ...selected, effects: [...selected.effects, { name, value: defaultEffectValue(name) }] })
          }
          onUpdateEffect={(_id, i, value) =>
            selected && replaceRow({ ...selected, effects: selected.effects.map((e, j) => (j === i ? { ...e, value } : e)) })
          }
          onRemoveEffect={(_id, i) =>
            selected && replaceRow({ ...selected, effects: selected.effects.filter((_, j) => j !== i) })
          }
        />
      </div>
    </div>
  );
}
