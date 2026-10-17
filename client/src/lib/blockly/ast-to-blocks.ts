import { parse } from 'acorn';
import { resolveFunction, type ArgSpec, type FnSpec } from './strudel-functions';
import { PLAY_TYPE, factoryType, isSettingType, methodType, settingType } from './registry';
import { GENERIC_FACTORY_TYPE, GENERIC_METHOD_TYPE } from './core-blocks';

/**
 * `code → Blockly serialization JSON`.
 *
 * The JS layer is parsed with acorn. Recognized Strudel calls become a vertical
 * chain of statement blocks under a `play` C-block; comments and statements the
 * model can't represent are preserved as **passthrough** text attached to the
 * nearest block (never shown as blocks), so no source is lost.
 */

export interface SerializedBlock {
  type: string;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, { block?: SerializedBlock; shadow?: SerializedBlock }>;
  next?: { block: SerializedBlock };
  extraState?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export interface WorkspaceSerialization {
  blocks: { languageVersion: number; blocks: SerializedBlock[] };
}

interface AcNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface AcComment {
  type: 'Line' | 'Block';
  value: string;
  start: number;
  end: number;
}

interface Chain {
  root: { name: string; args: AcNode[] | null };
  methods: { name: string; args: AcNode[] }[];
}

const isLiteral = (n: AcNode): boolean => n.type === 'Literal';

function flatten(node: AcNode): Chain | null {
  if (node.type === 'Identifier') {
    return { root: { name: node.name as string, args: null }, methods: [] };
  }
  if (node.type !== 'CallExpression') return null;
  const callee = node.callee as AcNode;
  const args = (node.arguments as AcNode[]) ?? [];
  if (callee.type === 'Identifier') {
    return { root: { name: callee.name as string, args }, methods: [] };
  }
  if (callee.type === 'MemberExpression' && !callee.computed) {
    const inner = flatten(callee.object as AcNode);
    if (!inner) return null;
    const prop = callee.property as AcNode;
    if (prop.type !== 'Identifier') return null;
    return { root: inner.root, methods: [...inner.methods, { name: prop.name as string, args }] };
  }
  return null;
}

function literalValue(n: AcNode): number | string | null {
  if (!isLiteral(n)) return null;
  const v = n.value as unknown;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return null;
}

function argsFitFields(spec: FnSpec, args: AcNode[]): boolean {
  if (args.length > spec.args.length) return false;
  return spec.args.slice(0, args.length).every((argSpec, i) => {
    const node = args[i];
    if (!node) return true;
    if (argSpec.type === 'value') return true;
    if (argSpec.type === 'number') return isLiteral(node) && typeof node.value === 'number';
    return isLiteral(node);
  });
}

function fieldValue(node: AcNode | undefined, spec: ArgSpec, source: string): string | number {
  if (!node) return spec.default;
  if (spec.type === 'number') {
    const v = literalValue(node);
    return typeof v === 'number' ? v : Number(spec.default) || 0;
  }
  if (spec.type === 'text') {
    const v = literalValue(node);
    return typeof v === 'string' ? v : source.slice(node.start, node.end);
  }
  const v = literalValue(node);
  return v !== null ? String(v) : source.slice(node.start, node.end);
}

function fieldMap(spec: FnSpec, args: AcNode[], source: string): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  spec.args.forEach((argSpec, i) => {
    fields[`ARG_${i}`] = fieldValue(args[i], argSpec, source);
  });
  return fields;
}

function rawArgsSource(args: AcNode[], source: string): string {
  if (!args.length) return '';
  return source.slice(args[0].start, args[args.length - 1].end);
}

/**
 * Map an expression to a vertical chain of statement blocks `[root, …methods]`,
 * linked through `next`. Returns `null` when the expression isn't representable.
 */
export function exprToChain(node: AcNode, source: string): SerializedBlock[] | null {
  const chain = flatten(node);
  if (!chain || chain.root.args === null) return null;

  const rootSpec = resolveFunction(chain.root.name);
  let root: SerializedBlock;
  if (rootSpec && rootSpec.role === 'setting') {
    root = { type: settingType(rootSpec.name), fields: fieldMap(rootSpec, chain.root.args, source) };
  } else if (rootSpec && rootSpec.role === 'factory' && argsFitFields(rootSpec, chain.root.args)) {
    root = { type: factoryType(rootSpec.name), fields: fieldMap(rootSpec, chain.root.args, source) };
  } else {
    root = {
      type: GENERIC_FACTORY_TYPE,
      fields: { NAME: chain.root.name, ARGS: rawArgsSource(chain.root.args, source) },
    };
  }

  const blocks: SerializedBlock[] = [root];
  for (const method of chain.methods) {
    const spec = resolveFunction(method.name);
    if (spec && argsFitFields(spec, method.args)) {
      blocks.push({ type: methodType(spec.name), fields: fieldMap(spec, method.args, source) });
    } else {
      blocks.push({
        type: GENERIC_METHOD_TYPE,
        fields: { NAME: method.name, ARGS: rawArgsSource(method.args, source) },
      });
    }
  }

  for (let i = 0; i < blocks.length - 1; i++) blocks[i].next = { block: blocks[i + 1] };
  return blocks;
}

/** Kept for backwards-compatible imports/tests. */
export function exprToBlock(node: AcNode, source: string): SerializedBlock | null {
  const chain = exprToChain(node, source);
  return chain ? chain[0] : null;
}

function isSettingCall(node: AcNode): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee as AcNode;
  if (callee.type !== 'Identifier') return false;
  return resolveFunction(callee.name as string)?.role === 'setting';
}

function isMutedMarker(comments: AcComment[], stmtStart: number, source: string): AcComment | undefined {
  return comments.find(
    (c) =>
      c.value.trim() === '[muted]' &&
      c.end <= stmtStart &&
      !source.slice(c.end, stmtStart).includes('\n'),
  );
}

/** A representable top-level statement, or `null` (→ passthrough). */
function statementToBlock(
  stmt: AcNode,
  source: string,
  comments: AcComment[],
  consumed: Set<AcComment>,
): SerializedBlock | null {
  let label = '';
  let muted = false;
  let exprNode = stmt;

  if (stmt.type === 'LabeledStatement') {
    label = ((stmt.label as AcNode).name as string) ?? '';
    exprNode = stmt.body as AcNode;
  }

  const marker = isMutedMarker(comments, stmt.start, source);
  if (marker) {
    muted = true;
    consumed.add(marker);
  }

  if (stmt.type !== 'LabeledStatement' && stmt.type !== 'ExpressionStatement') return null;

  const expr = exprNode.type === 'ExpressionStatement' ? (exprNode.expression as AcNode) : exprNode;
  const chain = exprToChain(expr, source);
  if (!chain) return null;

  if (isSettingCall(expr) || (chain.length === 1 && isSettingType(chain[0].type))) {
    return chain[0];
  }

  return {
    type: PLAY_TYPE,
    fields: { LABEL: label, MUTED: muted ? 'TRUE' : 'FALSE' },
    inputs: { PATTERN: { block: chain[0] } },
  };
}

function withExtra(
  block: SerializedBlock,
  key: 'preamble' | 'postamble',
  value: string,
): SerializedBlock {
  block.extraState = { ...(block.extraState ?? {}), [key]: value };
  return block;
}

function commentText(c: AcComment): string {
  return c.type === 'Block' ? `/* ${c.value.trim()} */` : `// ${c.value.trim()}`;
}

/** Parse `code` into a Blockly workspace serialization object. */
export function codeToSerialization(code: string): WorkspaceSerialization {
  const src = code ?? '';
  if (src.trim() === '') return { blocks: { languageVersion: 0, blocks: [] } };

  const comments: AcComment[] = [];
  let ast: { body: AcNode[] };
  try {
    ast = parse(src, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      locations: false,
      onComment: comments,
    }) as unknown as { body: AcNode[] };
  } catch {
    // Unparseable: keep the whole source as a passthrough on an empty play block.
    return {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: PLAY_TYPE, fields: { LABEL: '', MUTED: 'FALSE' }, extraState: { preamble: src } }],
      },
    };
  }

  const statements = ast.body as AcNode[];
  const stmtRanges = statements.map((s) => [s.start, s.end] as const);
  const insideStatement = (c: AcComment) => stmtRanges.some(([s, e]) => c.start >= s && c.end <= e);
  const topComments = comments.filter((c) => !insideStatement(c));

  type Item = { start: number; comment?: AcComment; stmt?: AcNode };
  const items: Item[] = [];
  for (const stmt of statements) items.push({ start: stmt.start, stmt });
  for (const c of topComments) items.push({ start: c.start, comment: c });
  items.sort((a, b) => a.start - b.start);

  const consumed = new Set<AcComment>();
  const blocks: SerializedBlock[] = [];
  let pending = '';

  for (const item of items) {
    if (item.comment) {
      if (consumed.has(item.comment)) continue;
      pending += `${commentText(item.comment)}\n`;
      continue;
    }
    const stmt = item.stmt as AcNode;
    const block = statementToBlock(stmt, src, topComments, consumed);
    if (!block) {
      pending += `${src.slice(stmt.start, stmt.end)}\n`;
      continue;
    }
    if (pending) {
      withExtra(block, 'preamble', pending);
      pending = '';
    }
    blocks.push(block);
  }

  if (pending) {
    if (blocks.length) withExtra(blocks[blocks.length - 1], 'postamble', pending);
    else blocks.push({ type: PLAY_TYPE, fields: { LABEL: '', MUTED: 'FALSE' }, extraState: { preamble: pending } });
  }

  for (let i = 0; i < blocks.length - 1; i++) blocks[i].next = { block: blocks[i + 1] };

  return { blocks: { languageVersion: 0, blocks: blocks.length ? [blocks[0]] : [] } };
}

// re-export for tests
export { flatten, argsFitFields };
