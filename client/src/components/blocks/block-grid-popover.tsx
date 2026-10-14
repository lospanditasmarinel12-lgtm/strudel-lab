import StepGrid from '@/components/visual/step-grid';
import RowInspector from '@/components/visual/row-inspector';
import { useStrudelPlayhead } from '@/hooks/use-strudel-playhead';
import {
  defaultEffectValue,
  emptySteps,
  resizeSteps,
  setRowStepOn,
  STEPS_OPTIONS,
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
  const activeStep = useStrudelPlayhead(row.steps.length);

  return (
    <div className="w-[540px] max-w-[85vw] bg-strudel-surface border border-strudel-surface-light rounded" data-testid="block-grid-popover">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-strudel-surface-light text-[9px] text-muted-foreground">
        <span>Steps</span>
        {STEPS_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`steps-${n}`}
            onClick={() => onChange({ ...row, steps: resizeSteps(row.steps, n) })}
            className={`px-1.5 py-0.5 rounded border border-strudel-surface-light ${
              row.steps.length === n ? 'bg-strudel-accent text-black' : 'hover:text-white'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          data-testid="clear-row"
          onClick={() => onChange({ ...row, steps: emptySteps(row.steps.length) })}
          className="ml-auto px-1.5 py-0.5 rounded border border-strudel-surface-light hover:text-red-400"
        >
          clear
        </button>
      </div>

      <StepGrid
        model={model}
        selectedRowId={row.id}
        activeStep={activeStep}
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
