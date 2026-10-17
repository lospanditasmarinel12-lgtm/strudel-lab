/**
 * Independent reference implementation of the sparse line-splice apply used by
 * `client/src/lib/diff.ts`. Built by walking the base document forward, in
 * contrast to the library's descending in-place splice, so it cross-checks the
 * library's ordering and offset math.
 */

export interface SpliceOpLike {
  s: number;
  d: number;
  i: string[];
}

export function applySpliceReference(base: string, ops: SpliceOpLike[]): string {
  const baseLines = base.split('\n');
  const sorted = [...ops].sort((a, b) => a.s - b.s);
  const out: string[] = [];
  let cursor = 0;

  for (const op of sorted) {
    const start = Math.max(0, Math.min(op.s, baseLines.length));
    while (cursor < start) out.push(baseLines[cursor++]);
    const del = Math.max(0, op.d ?? 0);
    cursor = Math.min(baseLines.length, cursor + del);
    if (op.i && op.i.length > 0) out.push(...op.i);
  }
  while (cursor < baseLines.length) out.push(baseLines[cursor++]);
  return out.join('\n');
}
