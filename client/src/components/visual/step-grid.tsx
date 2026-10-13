import { memo, useCallback, useEffect, useRef } from 'react';
import { EyeOff, Eye, Lock, Trash2 } from 'lucide-react';
import type { VisualModel, VisualRow } from '@/lib/visual/visual-model';
import { isGridRow } from '@/lib/visual/visual-model';

interface StepGridProps {
  model: VisualModel;
  selectedRowId: string | null;
  onSelectRow: (id: string) => void;
  onToggleStep: (rowId: string, stepIndex: number, on: boolean) => void;
  onToggleMute: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
}

const HEADER_WIDTH = 150;

function StepCell({
  rowId,
  index,
  on,
  color,
  muted,
  beat,
  onPaint,
}: {
  rowId: string;
  index: number;
  on: boolean;
  color: string;
  muted: boolean;
  beat: boolean;
  onPaint: (rowId: string, index: number, value?: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`step-cell-${rowId}-${index}`}
      data-on={on ? '1' : '0'}
      onMouseDown={(e) => {
        e.preventDefault();
        onPaint(rowId, index, !on);
      }}
      onMouseEnter={(e) => {
        if (e.buttons === 1) onPaint(rowId, index);
      }}
      className={`h-6 min-w-0 flex-1 rounded-[3px] border transition-colors ${
        beat ? 'border-strudel-surface-light' : 'border-transparent'
      } ${on ? '' : 'bg-strudel-dark hover:bg-strudel-surface-light'}`}
      style={on ? { backgroundColor: color, opacity: muted ? 0.35 : 1 } : undefined}
      aria-label={`step ${index + 1}${on ? ' on' : ' off'}`}
    />
  );
}

const MemoStepCell = memo(StepCell);

export default function StepGrid({
  model,
  selectedRowId,
  onSelectRow,
  onToggleStep,
  onToggleMute,
  onRemoveRow,
}: StepGridProps) {
  const paintValueRef = useRef<boolean | null>(null);

  const handlePaint = useCallback(
    (rowId: string, index: number, value?: boolean) => {
      const resolved = value === undefined ? paintValueRef.current ?? true : value;
      if (value !== undefined) paintValueRef.current = value;
      onToggleStep(rowId, index, resolved);
    },
    [onToggleStep],
  );

  useEffect(() => {
    const clear = () => {
      paintValueRef.current = null;
    };
    window.addEventListener('mouseup', clear);
    return () => window.removeEventListener('mouseup', clear);
  }, []);

  if (model.rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        No rows yet — add a drum or note row.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-2 py-2 space-y-1" data-testid="step-grid">
      {model.rows.map((row: VisualRow) => {
        const selected = row.id === selectedRowId;
        return (
          <div
            key={row.id}
            data-testid={`visual-row-${row.id}`}
            onMouseDown={() => onSelectRow(row.id)}
            className={`flex items-center gap-1 rounded ${selected ? 'bg-strudel-surface-light/60' : 'hover:bg-strudel-surface-light/30'}`}
          >
            <div className="flex items-center gap-1 shrink-0" style={{ width: HEADER_WIDTH }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-[10px] text-white font-mono truncate flex-1" title={row.name}>
                {row.name}
              </span>
              {row.kind === 'raw' && <Lock size={10} className="text-muted-foreground shrink-0" />}
              {isGridRow(row) && (
                <button
                  type="button"
                  data-testid={`row-mute-${row.id}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute(row.id);
                  }}
                  className={`shrink-0 ${row.muted ? 'text-red-400' : 'text-muted-foreground hover:text-white'}`}
                  title={row.muted ? 'Unmute' : 'Mute'}
                >
                  {row.muted ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              )}
              <button
                type="button"
                data-testid={`row-remove-${row.id}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRow(row.id);
                }}
                className="shrink-0 text-muted-foreground hover:text-red-400"
                title="Remove row"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {row.kind === 'raw' ? (
              <div className="flex-1 min-w-0 text-[9px] text-muted-foreground font-mono truncate px-2 py-1 bg-strudel-dark rounded">
                {row.code.replace(/\s+/g, ' ').slice(0, 120)}
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-[2px] min-w-0">
                {row.steps.map((step, i) => (
                  <MemoStepCell
                    key={i}
                    rowId={row.id}
                    index={i}
                    on={step.on}
                    color={row.color}
                    muted={!!row.muted}
                    beat={i % 4 === 0}
                    onPaint={handlePaint}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
