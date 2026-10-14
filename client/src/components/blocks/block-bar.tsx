import { memo, useMemo } from 'react';
import { GripVertical, Grid3x3, Lock, Trash2, Eye, EyeOff, Copy } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ParsedBlock } from '@/lib/blocks/parse-blocks';
import type { GridPatternNode, GridVisualRow } from '@/lib/visual/visual-model';
import { parseStructure } from '@/lib/visual/structure';
import BlockGridPopover from './block-grid-popover';
import SubPatternEditor from '@/components/visual/sub-pattern-editor';

interface BlockBarProps {
  block: ParsedBlock;
  active?: boolean;
  onDragStart: (block: ParsedBlock, x: number, y: number) => void;
  onRemove: (block: ParsedBlock) => void;
  onDuplicate: (block: ParsedBlock) => void;
  onDropSample: (block: ParsedBlock, sample: string) => void;
  onGridChange: (block: ParsedBlock, row: GridVisualRow) => void;
  onAdvancedChange: (block: ParsedBlock, pattern: GridPatternNode) => void;
}

/** Compact inline step preview (up to 16 steps). */
function StepPreview({ row }: { row: GridVisualRow }) {
  const steps = row.steps.slice(0, 16);
  return (
    <span className="hidden sm:flex items-center gap-[1px] shrink-0" data-testid="block-step-preview">
      {steps.map((step, i) => (
        <span
          key={i}
          className="inline-block w-[5px] h-[10px] rounded-[1px]"
          style={{
            backgroundColor: step.on ? row.color : 'transparent',
            border: step.on ? 'none' : '1px solid rgba(255,255,255,0.15)',
            opacity: row.muted ? 0.4 : 1,
          }}
        />
      ))}
    </span>
  );
}

export default memo(function BlockBar({ block, active, onDragStart, onRemove, onDuplicate, onDropSample, onGridChange, onAdvancedChange }: BlockBarProps) {
  const row = block.row;
  const label = row ? row.source : 'code';

  const advancedPattern = useMemo<GridPatternNode | null>(() => {
    if (!block.advanced) return null;
    const node = parseStructure(block.code).nodes[0];
    return node && node.kind === 'section' && node.pattern.kind === 'grid' ? node.pattern : null;
  }, [block.advanced, block.code]);

  return (
    <div
      data-testid={`block-bar-${block.id}`}
      data-block-kind={block.kind}
      data-active={active ? '1' : '0'}
      onDragOver={(e) => {
        if (block.row && e.dataTransfer.types.includes('application/x-strudel-sample')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const sample = e.dataTransfer.getData('application/x-strudel-sample');
        if (sample && block.row) {
          e.preventDefault();
          onDropSample(block, sample);
        }
      }}
      className={`flex items-center gap-1.5 h-[24px] px-1.5 rounded-sm border bg-strudel-surface/95 text-white select-none ${
        active ? 'border-strudel-accent ring-1 ring-strudel-accent' : 'border-strudel-surface-light'
      }`}
      style={{ borderLeft: `3px solid ${row?.color ?? '#93A69E'}` }}
    >
      <button
        type="button"
        data-testid={`block-drag-${block.id}`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragStart(block, e.clientX, e.clientY);
        }}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-white shrink-0"
        title="Drag to move block"
      >
        <GripVertical size={12} />
      </button>

      {block.kind === 'raw' && block.advanced && advancedPattern && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={`block-advanced-${block.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-[8px] font-mono px-1 rounded bg-strudel-dark text-strudel-accent shrink-0 hover:bg-strudel-surface-light"
              title="Edit advanced mini-notation (chords, euclid, groups)"
            >
              grid+
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-0 border-strudel-surface-light bg-strudel-surface w-auto">
            <SubPatternEditor pattern={advancedPattern} onChange={(p) => onAdvancedChange(block, p)} />
          </PopoverContent>
        </Popover>
      )}
      {block.kind === 'raw' && (!block.advanced || !advancedPattern) && (
        <Lock size={10} className="text-muted-foreground shrink-0" />
      )}
      <span className="text-[10px] font-mono truncate" title={label}>
        {label}
      </span>
      {row && row.kind === 'note' && <span className="text-[8px] text-muted-foreground shrink-0">note</span>}

      {row && <StepPreview row={row} />}

      {row && row.effects.length > 0 && (
        <span className="flex items-center gap-0.5 shrink-0">
          {row.effects.slice(0, 3).map((e, i) => (
            <span
              key={`${e.name}-${i}`}
              className="text-[8px] font-mono px-1 rounded bg-strudel-dark text-strudel-accent"
              title={`${e.name}(${String(e.value)})`}
            >
              {e.name}
            </span>
          ))}
          {row.effects.length > 3 && <span className="text-[8px] text-muted-foreground">+{row.effects.length - 3}</span>}
        </span>
      )}

      {row && (
        <button
          type="button"
          data-testid={`block-mute-${block.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onGridChange(block, { ...row, muted: !row.muted })}
          className={`shrink-0 ${row.muted ? 'text-red-400' : 'text-muted-foreground hover:text-white'}`}
          title={row.muted ? 'Unmute' : 'Mute'}
        >
          {row.muted ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}

      {row && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={`block-grid-${block.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              className="shrink-0 text-muted-foreground hover:text-strudel-accent"
              title="Edit pattern grid"
            >
              <Grid3x3 size={11} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-0 border-strudel-surface-light bg-strudel-surface w-auto">
            <BlockGridPopover row={row} onChange={(next) => onGridChange(block, next)} />
          </PopoverContent>
        </Popover>
      )}

      <button
        type="button"
        data-testid={`block-duplicate-${block.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDuplicate(block)}
        className="shrink-0 text-muted-foreground hover:text-white"
        title="Duplicate block"
      >
        <Copy size={11} />
      </button>
      <button
        type="button"
        data-testid={`block-remove-${block.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(block)}
        className="shrink-0 text-muted-foreground hover:text-red-400"
        title="Remove block"
      >
        <Trash2 size={11} />
      </button>
      <div className="flex-1" />
    </div>
  );
});
