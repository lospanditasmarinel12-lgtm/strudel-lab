import { mini2ast } from '@strudel/web';
import { parseMiniNotation } from './mini-notation';
import type { StepTree } from './visual-model';

/**
 * Authoritative mini-notation parsing: converts Strudel's own parser output
 * (`@strudel/web`'s re-export of `@strudel/mini` `mini2ast`) into our `StepTree`.
 *
 * Falls back to our hand-rolled parser when the Strudel parser is unavailable or
 * the AST uses a construct we don't model yet.
 */

// Minimal shape of @strudel/mini's AST (only the parts we consume).
interface MiniAtom {
  type_: 'atom';
  source_: string;
}
interface MiniOp {
  type_: string;
  arguments_?: Record<string, unknown>;
}
interface MiniOptions {
  ops?: MiniOp[];
  weight?: number;
  reps?: number;
}
interface MiniElement {
  type_: 'element';
  source_: MiniPattern | MiniAtom;
  options_?: MiniOptions;
}
interface MiniPattern {
  type_: 'pattern';
  arguments_?: { alignment?: string };
  // `fastcat` nests elements; `stack`/`polymeter_slowcat` nest patterns.
  source_: Array<MiniElement | MiniPattern>;
}
type MiniNode = MiniPattern | MiniAtom;

export class MiniAstUnsupported extends Error {}

const KNOWN_OPS = new Set(['stretch', 'bjorklund', 'replicate', 'degradeBy']);

function atomToTree(source: string): StepTree {
  return source === '~' || source === '-' ? { t: 'rest' } : { t: 'token', value: source };
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && (value as MiniAtom).type_ === 'atom') {
    const n = Number((value as MiniAtom).source_);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function sourceToTree(src: MiniPattern | MiniAtom): StepTree {
  return src.type_ === 'atom' ? atomToTree(src.source_) : patternToTree(src);
}

function childToTree(item: MiniElement | MiniPattern): StepTree {
  return item.type_ === 'element' ? elementToTree(item) : patternToTree(item);
}

function patternToTree(p: MiniPattern): StepTree {
  const children = (p.source_ ?? []).map(childToTree);
  const align = p.arguments_?.alignment ?? 'fastcat';
  if (align === 'fastcat') return { t: 'group', op: 'seq', children };
  if (align === 'stack') return { t: 'group', op: 'stack', children };
  if (align === 'rand') return { t: 'group', op: 'choice', children };
  if (align === 'polymeter_slowcat') {
    // `<...>` alternation; flatten an inner sequence so cells read naturally.
    const flat: StepTree[] = [];
    for (const c of children) {
      if (c.t === 'group' && c.op === 'seq') flat.push(...c.children);
      else flat.push(c);
    }
    return { t: 'group', op: 'alt', children: flat };
  }
  throw new MiniAstUnsupported(`unsupported alignment: ${align}`);
}

function elementToTree(el: MiniElement): StepTree {
  let node = sourceToTree(el.source_);
  const opts = el.options_ ?? {};
  const ops = opts.ops ?? [];
  const hasReplicate = ops.some((o) => o.type_ === 'replicate');

  for (const op of ops) {
    if (!KNOWN_OPS.has(op.type_)) throw new MiniAstUnsupported(`unsupported op: ${op.type_}`);
    if (op.type_ === 'stretch') {
      const amount = num(op.arguments_?.amount) ?? 2;
      const kind = op.arguments_?.type === 'slow' ? 'slow' : 'fast';
      node = { t: 'group', op: kind, factor: amount, children: [node] };
    } else if (op.type_ === 'bjorklund') {
      const fill = num(op.arguments_?.pulse) ?? 3;
      const steps = num(op.arguments_?.step) ?? 8;
      const rotate = op.arguments_?.rotation ? num(op.arguments_.rotation) : undefined;
      node = { t: 'euclid', fill, steps, rotate, child: node };
    } else if (op.type_ === 'replicate') {
      const count = opts.reps ?? num(op.arguments_?.amount) ?? 2;
      node = { t: 'repeat', count, child: node };
    } else if (op.type_ === 'degradeBy') {
      const amount = op.arguments_?.amount;
      node = { t: 'prob', value: typeof amount === 'number' ? amount : 0.5, child: node };
    }
  }

  if (!hasReplicate && typeof opts.weight === 'number' && opts.weight > 1) {
    node = { t: 'elongate', weight: opts.weight, child: node };
  }
  return node;
}

function treeFromAst(ast: MiniNode): StepTree[] {
  const tree = ast.type_ === 'atom' ? atomToTree(ast.source_) : patternToTree(ast);
  if (tree.t === 'group' && tree.op === 'seq') return tree.children;
  if (tree.t === 'group' && (tree.op === 'stack' || tree.op === 'choice')) {
    return [{ ...tree, top: true }];
  }
  return [tree];
}

/**
 * Parse a mini-notation string into top-level cells. Uses Strudel's parser when
 * available; otherwise falls back to the local parser.
 */
export function miniNotationToTree(text: string): StepTree[] {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return [];

  if (typeof mini2ast === 'function') {
    try {
      return treeFromAst(mini2ast(JSON.stringify(trimmed)) as MiniNode);
    } catch {
      // fall through to the local parser
    }
  }
  return parseMiniNotation(trimmed);
}
