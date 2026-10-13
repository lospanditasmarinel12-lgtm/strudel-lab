import { memo } from 'react';
import { GripVertical, Grid3x3, Lock, Trash2, Eye, EyeOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ParsedBlock } from '@/lib/blocks/parse-blocks';
import type { GridVisualRow } from '@/lib/visual/visual-model';
import BlockGridPopover from './block-grid-popover';

interface BlockBarProps {
  block: ParsedBlock;
  onDragStart: (block: ParsedBlock, x: number, y: number) => void;
  onRemove: (block: ParsedBlock) => void;
  onGridChange: (block: ParsedBlock, row: GridVisualRow) => void;
}

export default memo(function BlockBar({ block, onDragStart, onRemove, onGridChange }: BlockBarProps) {
  const row = block.row;
  const label = row ? row.source : 'code';

  return (
    <div
      data-testid={`block-bar-${block.id}`}
      data-block-kind={block.kind}
      className="flex items-center gap-1.5 h-[24px] px-1.5 rounded-sm border border-strudel-surface-light bg-strudel-surface/95 text-white select-none"
      style={{ borderLeft: `3px solid ${row?.color ?? '#6b7280'}` }}
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

      {block.kind === 'raw' && <Lock size={10} className="text-muted-foreground shrink-0" />}
      <span className="text-[10px] font-mono truncate" title={label}>
        {label}
      </span>
      {row && row.kind === 'note' && <span className="text-[8px] text-muted-foreground shrink-0">note</span>}

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
