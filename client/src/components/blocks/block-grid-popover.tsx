import StepGrid from '@/components/visual/step-grid';
import RowInspector from '@/components/visual/row-inspector';
import {
  defaultEffectValue,
  setRowStepOn,
  type GridVisualRow,
  type VisualModel,
} from '@/lib/visual/visual-model';

interface BlockGridPopoverProps {
  row: GridVisualRow;
  onChange: (row: GridVisualRow) => void;
}

/**
 * Reuses the step grid + row inspector for a single block. Edits produce a new
 * row which the block layer serializes back into the code range.
 */
export default function BlockGridPopover({ row, onChange }: BlockGridPopoverProps) {
  const model: VisualModel = { stepsPerCycle: row.steps.length, rows: [row] };

  return (
    <div className="w-[540px] max-w-[85vw] bg-strudel-surface border border-strudel-surface-light rounded" data-testid="block-grid-popover">
      <StepGrid
        model={model}
        selectedRowId={row.id}
        onSelectRow={() => {}}
        onToggleStep={(_id, index, on) => onChange(setRowStepOn(row, index, on))}
        onToggleMute={() => onChange({ ...row, muted: !row.muted })}
        onRemoveRow={() => {}}
      />
      <div className="border-t border-strudel-surface-light">
        <RowInspector
          row={row}
          onUpdateSource={(_id, source) => onChange({ ...row, source })}
          onUpdateName={(_id, name) => onChange({ ...row, name })}
          onAddEffect={(_id, name) => onChange({ ...row, effects: [...row.effects, { name, value: defaultEffectValue(name) }] })}
          onUpdateEffect={(_id, i, value) => onChange({ ...row, effects: row.effects.map((e, j) => (j === i ? { ...e, value } : e)) })}
          onRemoveEffect={(_id, i) => onChange({ ...row, effects: row.effects.filter((_, j) => j !== i) })}
        />
      </div>
    </div>
  );
}
