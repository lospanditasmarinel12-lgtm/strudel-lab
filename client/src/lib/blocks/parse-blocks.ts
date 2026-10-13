import { codeToVisual } from '@/lib/visual/code-to-visual';
import { isGridRow, type GridVisualRow } from '@/lib/visual/visual-model';

export type BlockKind = 'pattern' | 'raw' | 'comment';

export interface ParsedBlock {
  id: string;
  kind: BlockKind;
  /** 1-based, inclusive. */
  startLine: number;
  /** 1-based, inclusive. */
  endLine: number;
  /** Original code for this block, lines joined with \n. */
  code: string;
  /** Present for `pattern` blocks: the parsed visual row (controls, effects). */
  row?: GridVisualRow;
}

const MUTED_PREFIX = '// [muted]';

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') && !t.startsWith(MUTED_PREFIX);
}

function startsNewBlock(line: string): boolean {
  const t = line.trim();
  return t.startsWith('$:') || t.startsWith(MUTED_PREFIX) || t.startsWith('// [muted]');
}

/**
 * Split Strudel code into blocks with exact line ranges.
 *
 * A block starts at the first non-blank line, at every `$:` line, and at every
 * muted-comment line. Pure comment blocks are skipped (they get no lego bar).
 * Each block is classified as a `pattern` (editable in the grid) or `raw`
 * (preserved verbatim, only movable/removable).
 */
export function parseBlocks(code: string): ParsedBlock[] {
  const lines = (code ?? '').split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    const start = i;
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !startsNewBlock(lines[i])) {
      i++;
    }
    const end = i - 1;

    const blockLines = lines.slice(start, end + 1);
    const blockCode = blockLines.join('\n');

    // Comment blocks are kept (so reordering can preserve them) but get no bar.
    if (blockLines.every(isCommentLine)) {
      blocks.push({
        id: `block-${blocks.length}`,
        kind: 'comment',
        startLine: start + 1,
        endLine: end + 1,
        code: blockCode,
      });
      continue;
    }

    const model = codeToVisual(blockCode);
    const row = model.rows[0];
    const isPattern = !!row && isGridRow(row);

    blocks.push({
      id: `block-${blocks.length}`,
      kind: isPattern ? 'pattern' : 'raw',
      startLine: start + 1,
      endLine: end + 1,
      code: blockCode,
      row: isPattern ? (row as GridVisualRow) : undefined,
    });
  }

  return blocks;
}

/** Stable signature used to detect when the block layout actually changed. */
export function blocksSignature(blocks: ParsedBlock[]): string {
  return blocks.map((b, i) => `${i}:${b.kind}:${b.startLine}-${b.endLine}`).join('|');
}

export function findBlockAtLine(blocks: ParsedBlock[], line: number): ParsedBlock | undefined {
  return blocks.find((b) => line >= b.startLine && line <= b.endLine);
}

/** Blocks that should render a lego bar (everything except pure comments). */
export function barBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
  return blocks.filter((b) => b.kind !== 'comment');
}
