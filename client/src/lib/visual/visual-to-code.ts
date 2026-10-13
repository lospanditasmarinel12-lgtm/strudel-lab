import type { VisualEffect, VisualModel, VisualRow } from './visual-model';

export const MUTED_PREFIX = '// [muted] ';
export const NOTE_FALLBACK = 'c3';

function formatEffect(effect: VisualEffect): string {
  const { name, value } = effect;
  if (value === '' || value === undefined || value === null) return `.${name}()`;
  if (typeof value === 'number') return `.${name}(${value})`;
  return `.${name}(${JSON.stringify(String(value))})`;
}

function stepToken(row: Extract<VisualRow, { kind: 'drum' | 'note' }>, index: number): string {
  const step = row.steps[index];
  if (!step || !step.on) return '~';
  if (row.kind === 'note') return step.value || NOTE_FALLBACK;
  return step.value || row.source;
}

function serializeGridRow(row: Extract<VisualRow, { kind: 'drum' | 'note' }>): string {
  const tokens = row.steps.map((_, i) => stepToken(row, i)).join(' ');
  const base =
    row.kind === 'note'
      ? `note(${JSON.stringify(tokens)}).s(${JSON.stringify(row.source)})`
      : `s(${JSON.stringify(tokens)})`;
  const effects = row.effects.map(formatEffect).join('');
  return `$: ${base}${effects}`;
}

export function visualRowToCode(row: VisualRow): string {
  if (row.kind === 'raw') return row.code;
  const line = serializeGridRow(row);
  return row.muted ? `${MUTED_PREFIX}${line}` : line;
}

export function visualToCode(model: VisualModel): string {
  return model.rows.map(visualRowToCode).join('\n\n');
}
