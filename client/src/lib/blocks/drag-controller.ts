import { findBlockAtLine, type ParsedBlock } from './parse-blocks';

/** A draggable "lego": a pattern, a method (effect/transform), a combinator, or an existing block. */
export type LegoPayload =
  | { kind: 'pattern'; label: string; code: string }
  | { kind: 'method'; label: string; method: string }
  | { kind: 'combinator'; label: string; wrapper: 'stack' | 'cat' }
  | { kind: 'reorder'; label: string; blockId: string; startLine: number; endLine: number };

export interface DragEventInfo {
  type: 'move' | 'drop' | 'cancel';
  x: number;
  y: number;
  payload: LegoPayload;
}

type DragHandler = (info: DragEventInfo) => void;

const DRAG_THRESHOLD = 4;

/**
 * Pointer-based drag manager (no HTML5 dataTransfer, so it works reliably in
 * tests and gives us full control of the drop indicator). A single instance is
 * shared by the palette and the block bars.
 */
class BlockDragManager {
  private handler: DragHandler | null = null;
  private payload: LegoPayload | null = null;
  private startX = 0;
  private startY = 0;
  private moved = false;
  private active = false;

  setHandler(handler: DragHandler | null): void {
    this.handler = handler;
  }

  start(payload: LegoPayload, x: number, y: number): void {
    this.payload = payload;
    this.startX = x;
    this.startY = y;
    this.moved = false;
    this.active = true;
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('pointercancel', this.onCancel, true);
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.active || !this.payload) return;
    if (!this.moved && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < DRAG_THRESHOLD) return;
    this.moved = true;
    this.handler?.({ type: 'move', x: e.clientX, y: e.clientY, payload: this.payload });
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.active || !this.payload) return;
    const payload = this.payload;
    const moved = this.moved;
    this.end();
    this.handler?.({ type: moved ? 'drop' : 'cancel', x: e.clientX, y: e.clientY, payload });
  };

  private onCancel = (): void => {
    if (!this.payload) return;
    const payload = this.payload;
    this.end();
    this.handler?.({ type: 'cancel', x: 0, y: 0, payload });
  };

  private end(): void {
    this.active = false;
    this.payload = null;
    this.moved = false;
    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('pointerup', this.onUp, true);
    window.removeEventListener('pointercancel', this.onCancel, true);
  }
}

export const blockDrag = new BlockDragManager();

// ---------------------------------------------------------------------------
// Pure document operations (line-based, testable without Monaco)
// ---------------------------------------------------------------------------

function normalizeBlankLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' && out.length > 0 && out[out.length - 1].trim() === '') continue;
    out.push(line);
  }
  while (out.length > 0 && out[0].trim() === '') out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Insert a new block before `atLine` (1-based). */
export function insertBlock(code: string, atLine: number, blockCode: string): string {
  const lines = code.split('\n');
  const idx = clamp(atLine - 1, 0, lines.length);
  const out = [...lines.slice(0, idx), ...blockCode.split('\n'), '', ...lines.slice(idx)];
  return normalizeBlankLines(out).join('\n');
}

/** Remove the lines [startLine, endLine] (1-based, inclusive). */
export function removeBlockAt(code: string, startLine: number, endLine: number): string {
  const lines = code.split('\n');
  const out = [...lines.slice(0, startLine - 1), ...lines.slice(endLine)];
  return normalizeBlankLines(out).join('\n');
}

/** Replace the lines [startLine, endLine] with new block code. */
export function replaceBlock(code: string, startLine: number, endLine: number, blockCode: string): string {
  const lines = code.split('\n');
  const out = [...lines.slice(0, startLine - 1), ...blockCode.split('\n'), ...lines.slice(endLine)];
  return normalizeBlankLines(out).join('\n');
}

/** Append a method call (e.g. `.gain(0.8)`) to the end of a block's last line. */
export function appendToBlock(code: string, startLine: number, endLine: number, method: string): string {
  const lines = code.split('\n');
  const last = endLine - 1;
  if (last < 0 || last >= lines.length) return code;
  lines[last] = `${lines[last].replace(/\s+$/, '')}${method}`;
  return lines.join('\n');
}

/** Wrap a block in a single-child combinator: `stack(` / `cat(`. */
export function wrapBlock(code: string, startLine: number, endLine: number, wrapper: 'stack' | 'cat'): string {
  const lines = code.split('\n');
  const s = startLine - 1;
  const e = endLine - 1;
  const child = lines.slice(s, e + 1).map((line) => {
    const stripped = line
      .replace(/^\s*\/\/\s*\[muted\]\s?/, '')
      .replace(/^\s*\$:\s?/, '')
      .trimStart();
    return `  ${stripped}`;
  });
  const wrapped = [`${wrapper}(`, ...child, ')'];
  const out = [...lines.slice(0, s), ...wrapped, ...lines.slice(e + 1)];
  return normalizeBlankLines(out).join('\n');
}

/** Snap a raw line to the nearest block boundary (start, or end+1). */
export function snapToBlockBoundary(blocks: ParsedBlock[], line: number): number {
  let best = line;
  let bestDist = Infinity;
  for (const b of blocks) {
    for (const candidate of [b.startLine, b.endLine + 1]) {
      const dist = Math.abs(candidate - line);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
  }
  return best;
}

/** Serialize an ordered block list back into a document (one blank line apart). */
export function serializeBlocks(blocks: ParsedBlock[]): string {
  return blocks.map((b) => b.code).join('\n\n');
}

/**
 * Compute the new document for a drop, or `null` when the drop is invalid
 * (e.g. an effect dropped on empty space).
 */
export function applyDrop(
  code: string,
  blocks: ParsedBlock[],
  payload: LegoPayload,
  dropLine: number,
): string | null {
  switch (payload.kind) {
    case 'pattern':
      return insertBlock(code, snapToBlockBoundary(blocks, dropLine), payload.code);
    case 'method': {
      const block = findBlockAtLine(blocks, dropLine);
      if (!block || block.kind !== 'pattern') return null;
      return appendToBlock(code, block.startLine, block.endLine, payload.method);
    }
    case 'combinator': {
      const block = findBlockAtLine(blocks, dropLine);
      if (!block || block.kind !== 'pattern') return null;
      return wrapBlock(code, block.startLine, block.endLine, payload.wrapper);
    }
    case 'reorder': {
      const fromIdx = blocks.findIndex((b) => b.id === payload.blockId);
      if (fromIdx < 0) return null;
      let toIdx = blocks.filter((b) => b.endLine < dropLine).length;
      if (toIdx > fromIdx) toIdx -= 1;
      if (toIdx === fromIdx || toIdx < 0 || toIdx >= blocks.length) return null;
      const reordered = [...blocks];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return serializeBlocks(reordered);
    }
  }
}
