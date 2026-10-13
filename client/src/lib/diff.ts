export interface DiffOp {
  t: '=' | '+' | '-';
  l: string[];
}

/**
 * Sparse line splice: at line index `s` in the base document, remove `d` lines
 * and insert `i` lines. Only changed regions are stored, so patches stay small
 * even for very large files. This is the format used for compact live-session
 * snapshots (supersedes the verbose `DiffOp[]` common-line encoding).
 */
export interface SpliceOp {
  s: number;
  d: number;
  i: string[];
}

export function lineDiff(oldStr: string, newStr: string): DiffOp[] {
  const a = oldStr.split('\n');
  const b = newStr.split('\n');
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = m, j = n;
  const stack: DiffOp[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ t: '=', l: [a[i - 1]] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ t: '+', l: [b[j - 1]] });
      j--;
    } else {
      stack.push({ t: '-', l: [a[i - 1]] });
      i--;
    }
  }
  while (stack.length > 0) {
    const op = stack.pop()!;
    if (ops.length > 0 && ops[ops.length - 1].t === op.t) {
      ops[ops.length - 1].l.push(op.l[0]);
    } else {
      ops.push(op);
    }
  }
  return ops;
}

export function applyDiff(baseStr: string, ops: DiffOp[]): string {
  const base = baseStr.split('\n');
  const result: string[] = [];
  let idx = 0;
  for (const op of ops) {
    if (op.t === '=') {
      for (const _ of op.l) {
        result.push(base[idx++]);
      }
    } else if (op.t === '-') {
      idx += op.l.length;
    } else if (op.t === '+') {
      result.push(...op.l);
    }
  }
  while (idx < base.length) result.push(base[idx++]);
  return result.join('\n');
}

/**
 * Compute a sparse splice patch from `oldStr` to `newStr`. Unchanged regions
 * are never stored, so a one-line edit in a 10k-line file yields a tiny patch.
 */
export function diffToPatch(oldStr: string, newStr: string): SpliceOp[] {
  if (oldStr === newStr) return [];
  const ops = lineDiff(oldStr, newStr);
  const patches: SpliceOp[] = [];
  let oldIdx = 0;
  let delStart = -1;
  let delCount = 0;
  let inserted: string[] = [];

  const flush = () => {
    if (delStart < 0 && inserted.length === 0) return;
    patches.push({
      s: delStart >= 0 ? delStart : oldIdx,
      d: delCount,
      i: inserted,
    });
    delStart = -1;
    delCount = 0;
    inserted = [];
  };

  for (const op of ops) {
    if (op.t === '=') {
      flush();
      oldIdx += op.l.length;
    } else if (op.t === '-') {
      if (delStart < 0) delStart = oldIdx;
      delCount += op.l.length;
      oldIdx += op.l.length;
    } else {
      if (delStart < 0) delStart = oldIdx;
      inserted.push(...op.l);
    }
  }
  flush();
  return patches;
}

/** Apply a sparse splice patch produced by `diffToPatch`. */
export function applyPatch(baseStr: string, ops: SpliceOp[]): string {
  if (!ops || ops.length === 0) return baseStr;
  const lines = baseStr.split('\n');
  const sorted = [...ops].sort((a, b) => b.s - a.s);
  for (const op of sorted) {
    const start = Math.max(0, Math.min(op.s, lines.length));
    const del = Math.max(0, op.d ?? 0);
    if (op.i && op.i.length > 0) {
      lines.splice(start, del, ...op.i);
    } else {
      lines.splice(start, del);
    }
  }
  return lines.join('\n');
}

/** Type guard: does a parsed snapshot payload use the sparse splice format? */
export function isSplicePatch(value: unknown): value is SpliceOp[] {
  return (
    Array.isArray(value) &&
    value.every(
      (op) =>
        op !== null &&
        typeof op === 'object' &&
        typeof (op as SpliceOp).s === 'number' &&
        typeof (op as SpliceOp).d === 'number' &&
        Array.isArray((op as SpliceOp).i),
    )
  );
}
