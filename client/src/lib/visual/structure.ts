import { getModifierDef } from '@/lib/modifier-registry';
import { MUTED_PREFIX } from './visual-to-code';
import { serializeCells, splitTopLevel } from './mini-notation';
import { miniNotationToTree } from './strudel-mini-adapter';
import type {
  ContainerNode,
  GridPatternNode,
  PatternNode,
  RawNode,
  SectionNode,
  StructureModel,
  StructureNode,
  VisualEffect,
} from './visual-model';

/**
 * Structure layer: parse/serialize top-level sections (`$:` blocks) and
 * `stack`/`cat` containers. Anything unsupported is preserved as a `RawNode`.
 */

const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;

// ---------------------------------------------------------------------------
// Chain normalization (join method chains that span lines)
// ---------------------------------------------------------------------------

export function normalizeCode(code: string): string {
  const lines = code.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('.') && out.length > 0 && !out[out.length - 1].trim().startsWith('//')) {
      out[out.length - 1] = out[out.length - 1].replace(/\s+$/, '') + trimmed;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export function parseEffects(rest: string): VisualEffect[] | null {
  if (!rest) return [];
  const effects: VisualEffect[] = [];
  const re = /\.([A-Za-z_][A-Za-z0-9_]*)\(\s*([^()]*?)\s*\)/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    if (m.index !== consumed) return null;
    consumed = m.index + m[0].length;
    const name = m[1];
    if (!getModifierDef(name)) return null;
    const raw = m[2];
    let value: number | string;
    if (raw === '') value = '';
    else if (NUMBER_RE.test(raw)) value = Number(raw);
    else {
      const str = raw.match(/^["'](.*)["']$/);
      if (!str) return null;
      value = str[1];
    }
    effects.push({ name, value });
  }
  if (consumed !== rest.length) return null;
  return effects;
}

export function formatEffect(effect: VisualEffect): string {
  const { name, value } = effect;
  if (value === '' || value === undefined || value === null) return `.${name}()`;
  if (typeof value === 'number') return `.${name}(${value})`;
  return `.${name}(${JSON.stringify(String(value))})`;
}

// ---------------------------------------------------------------------------
// Pattern layer
// ---------------------------------------------------------------------------

function tryParseMini(text: string): GridPatternNode['steps'] | null {
  try {
    return miniNotationToTree(text);
  } catch {
    return null;
  }
}

/** Parse a single-line pattern (optionally `$:`-prefixed) into a grid node. */
export function parsePattern(text: string): GridPatternNode | null {
  if (text.includes('\n')) return null;
  let t = text.trim();
  if (t.startsWith('$:')) t = t.slice(2).trim();

  // note-like factories (pitch / index / chord)
  const noteMatch = t.match(/^(note|n|chord)\(\s*(["'])([\s\S]*?)\2\s*\)([\s\S]*)$/);
  if (noteMatch) {
    const cells = tryParseMini(noteMatch[3]);
    if (!cells) return null;
    let rest = noteMatch[4];
    let sound = 'sawtooth';
    const soundMatch = rest.match(/^\s*\.s\(\s*(["'])([\s\S]*?)\1\s*\)/);
    if (soundMatch) {
      sound = soundMatch[2] || 'sawtooth';
      rest = rest.slice(soundMatch[0].length);
    }
    const effects = parseEffects(rest);
    if (!effects) return null;
    return { kind: 'grid', id: '', rowKind: 'note', factory: noteMatch[1], sound, steps: cells, effects };
  }

  // drum-like factories (`s` / `sound`)
  const drumMatch = t.match(/^(s|sound)\(\s*(["'])([\s\S]*?)\2\s*\)([\s\S]*)$/);
  if (drumMatch) {
    const cells = tryParseMini(drumMatch[3]);
    if (!cells) return null;
    const effects = parseEffects(drumMatch[4]);
    if (!effects) return null;
    return { kind: 'grid', id: '', rowKind: 'drum', factory: drumMatch[1], steps: cells, effects };
  }

  return null;
}

export function serializePattern(p: PatternNode): string {
  if (p.kind === 'raw-pattern') return p.code;
  const cellsStr = serializeCells(p.steps);
  const effects = p.effects.map(formatEffect).join('');
  if (p.rowKind === 'note') {
    const factory = p.factory ?? 'note';
    const sound = p.sound ?? (factory === 'n' ? undefined : 'sawtooth');
    const base = sound !== undefined ? `${factory}(${JSON.stringify(cellsStr)}).s(${JSON.stringify(sound)})` : `${factory}(${JSON.stringify(cellsStr)})`;
    return base + effects;
  }
  const factory = p.factory ?? 's';
  return `${factory}(${JSON.stringify(cellsStr)})${effects}`;
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function parseContainer(text: string): ContainerNode | null {
  const t = text.trim();
  const m = t.match(/^(stack|cat)\s*\(([\s\S]*)\)\s*$/);
  if (!m) return null;
  const op = m[1] as 'stack' | 'cat';
  const children: PatternNode[] = [];
  for (const part of splitTopLevel(m[2], ',')) {
    const p = part.trim();
    if (!p) continue;
    const pat = parsePattern(p);
    children.push(pat ?? { kind: 'raw-pattern', id: '', code: p });
  }
  return { kind: 'container', id: '', op, children };
}

export function serializeContainer(c: ContainerNode): string {
  const inner = c.children.map((child) => `  ${serializePattern(child)}`).join(',\n');
  return `${c.op}(\n${inner}\n)`;
}

// ---------------------------------------------------------------------------
// Block splitting
// ---------------------------------------------------------------------------

interface RawBlock {
  text: string;
  muted: boolean;
  startLine: number;
  endLine: number;
}

function startsNewBlock(line: string): boolean {
  const t = line.trim();
  return t.startsWith('$:') || t.startsWith(MUTED_PREFIX.trim());
}

export function splitTopLevelBlocks(code: string): RawBlock[] {
  const lines = normalizeCode(code ?? '').split('\n');
  const blocks: RawBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    const start = i;
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !startsNewBlock(lines[i])) i++;
    const end = i - 1;
    const text = lines.slice(start, end + 1).join('\n');
    blocks.push({
      text,
      muted: text.trimStart().startsWith(MUTED_PREFIX.trim()),
      startLine: start + 1,
      endLine: end + 1,
    });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Node parsing / serialization
// ---------------------------------------------------------------------------

function stripMuted(text: string): string {
  const t = text.trimStart();
  return t.startsWith(MUTED_PREFIX.trim()) ? t.slice(MUTED_PREFIX.trim().length).trimStart() : t;
}

export function parseNode(block: RawBlock): StructureNode {
  const body = stripMuted(block.text);
  const src = { startLine: block.startLine, endLine: block.endLine };

  if (!block.muted) {
    const container = parseContainer(body);
    if (container) return { ...container, src };
  }

  const pattern = parsePattern(body);
  if (pattern) {
    const section: SectionNode = { kind: 'section', id: '', pattern, muted: block.muted, src };
    return section;
  }

  const raw: RawNode = { kind: 'raw', id: '', code: block.text, src };
  return raw;
}

export function serializeNode(node: StructureNode): string {
  switch (node.kind) {
    case 'section': {
      const prefix = (node.muted ? MUTED_PREFIX : '') + '$: ';
      return prefix + serializePattern(node.pattern);
    }
    case 'container':
      return serializeContainer(node);
    case 'raw':
      return node.code;
  }
}

export function parseStructure(code: string): StructureModel {
  const blocks = splitTopLevelBlocks(code);
  const nodes = blocks.map((b, i) => {
    const node = parseNode(b);
    node.id = `node-${i}`;
    return node;
  });
  return { nodes };
}

export function serializeStructure(model: StructureModel): string {
  return model.nodes.map(serializeNode).join('\n\n');
}
