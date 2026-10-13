import { nanoid } from 'nanoid';
import { getModifierDef } from '@/lib/modifier-registry';
import { DEFAULT_STEPS, emptySteps, pickRowColor, type GridVisualRow, type VisualEffect, type VisualModel, type VisualRow } from './visual-model';
import { MUTED_PREFIX } from './visual-to-code';

/** Tokens the grid can represent: plain words, numbers and rests. */
const TOKEN_RE = /^[A-Za-z0-9_#~-]+$/;
const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;

interface ParsedGrid {
  kind: 'drum' | 'note';
  source: string;
  tokens: string[];
  effects: VisualEffect[];
  muted: boolean;
}

/**
 * Join method chains that span lines (e.g. `note("c3")\n.gain(0.3)`) so simple
 * multi-line patterns can still be represented in the grid.
 */
function normalizeCode(code: string): string {
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

function splitBlocks(code: string): string[] {
  return code
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function parseEffects(rest: string): VisualEffect[] | null {
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

function parseBlock(block: string): ParsedGrid | null {
  let text = block.trim();
  let muted = false;
  if (text.startsWith(MUTED_PREFIX)) {
    muted = true;
    text = text.slice(MUTED_PREFIX.length).trim();
  }
  if (text.startsWith('$:')) text = text.slice(2).trim();
  if (text.includes('\n')) return null;

  const noteMatch = text.match(/^note\(\s*(["'])([\s\S]*?)\1\s*\)([\s\S]*)$/);
  if (noteMatch) {
    const tokens = noteMatch[2].split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || !tokens.every((t) => TOKEN_RE.test(t))) return null;
    let rest = noteMatch[3];
    let source = 'sawtooth';
    const soundMatch = rest.match(/^\s*\.s\(\s*(["'])([\s\S]*?)\1\s*\)/);
    if (soundMatch) {
      source = soundMatch[2] || 'sawtooth';
      rest = rest.slice(soundMatch[0].length);
    }
    const effects = parseEffects(rest);
    if (!effects) return null;
    return { kind: 'note', source, tokens, effects, muted };
  }

  const drumMatch = text.match(/^s\(\s*(["'])([\s\S]*?)\1\s*\)([\s\S]*)$/);
  if (drumMatch) {
    const tokens = drumMatch[2].split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || !tokens.every((t) => TOKEN_RE.test(t))) return null;
    const effects = parseEffects(drumMatch[3]);
    if (!effects) return null;
    return { kind: 'drum', source: '', tokens, effects, muted };
  }

  return null;
}

function tokensToSteps(tokens: string[]): GridVisualRow['steps'] {
  return tokens.map((t) => (t === '~' ? { on: false } : { on: true, value: t }));
}

function rawRow(block: string, index: number): VisualRow {
  const firstLine = block.split('\n').find((l) => l.trim())?.trim() ?? 'code';
  return {
    id: nanoid(8),
    kind: 'raw',
    name: firstLine.slice(0, 28),
    color: pickRowColor(index),
    code: block,
  };
}

function gridRow(
  kind: 'drum' | 'note',
  source: string,
  steps: GridVisualRow['steps'],
  effects: VisualEffect[],
  muted: boolean,
  index: number,
): GridVisualRow {
  return {
    id: nanoid(8),
    kind,
    name: kind === 'note' ? `${source}` : source,
    source,
    color: pickRowColor(index),
    steps,
    effects,
    muted,
  };
}

/**
 * Best-effort conversion of Strudel code into a grid model. Blocks the grid
 * cannot represent are preserved verbatim as `raw` rows (never edited here).
 */
export function codeToVisual(code: string): VisualModel {
  const normalized = normalizeCode(code ?? '');
  const blocks = splitBlocks(normalized);
  const rows: VisualRow[] = [];
  let stepsPerCycle = 0;

  blocks.forEach((block, index) => {
    const parsed = parseBlock(block);
    if (!parsed) {
      rows.push(rawRow(block, index));
      return;
    }

    if (parsed.kind === 'drum') {
      const distinct = Array.from(new Set(parsed.tokens.filter((t) => t !== '~')));
      if (distinct.length > 1) {
        rows.push(rawRow(block, index));
        return;
      }
      const source = distinct[0] ?? 'bd';
      const steps = tokensToSteps(parsed.tokens).map((s) => (s.on ? { on: true, value: source } : s));
      rows.push(gridRow('drum', source, steps, parsed.effects, parsed.muted, index));
      stepsPerCycle = Math.max(stepsPerCycle, parsed.tokens.length);
      return;
    }

    rows.push(gridRow('note', parsed.source || 'sawtooth', tokensToSteps(parsed.tokens), parsed.effects, parsed.muted, index));
    stepsPerCycle = Math.max(stepsPerCycle, parsed.tokens.length);
  });

  const finalSteps = stepsPerCycle > 0 ? stepsPerCycle : DEFAULT_STEPS;
  const normalizedRows = rows.map((row) => {
    if (row.kind === 'raw') return row;
    if (row.steps.length === finalSteps) return row;
    const steps = row.steps.slice(0, finalSteps);
    while (steps.length < finalSteps) steps.push(...emptySteps(finalSteps - steps.length));
    return { ...row, steps };
  });

  return { stepsPerCycle: finalSteps, rows: normalizedRows };
}
