import { useState } from 'react';
import { parseMiniNotation, serializeTree } from '@/lib/visual/mini-notation';
import type { GridPatternNode, StepTree } from '@/lib/visual/visual-model';

interface SubPatternEditorProps {
  pattern: GridPatternNode;
  onChange: (pattern: GridPatternNode) => void;
}

function isSimple(cell: StepTree): cell is Extract<StepTree, { t: 'rest' | 'token' }> {
  return cell.t === 'rest' || cell.t === 'token';
}

function cellLabel(cell: StepTree): string {
  if (cell.t === 'rest') return '~';
  if (cell.t === 'token') return cell.value;
  if (cell.t === 'euclid') return `${serializeTree(cell.child)}(${cell.fill},${cell.steps})`;
  return `[${cell.t}]`;
}

/**
 * Edits a pattern's top-level mini-notation cells over the rich `StepTree`
 * model (tier-2: chords, groups, euclid, repeat, elongate, probability). Simple
 * cells toggle on click; complex cells open a mini-notation text editor.
 */
export default function SubPatternEditor({ pattern, onChange }: SubPatternEditorProps) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const setSteps = (steps: StepTree[]) => onChange({ ...pattern, steps });

  const toggle = (index: number) => {
    const cell = pattern.steps[index];
    if (cell.t === 'token') {
      const steps = [...pattern.steps];
      steps[index] = { t: 'rest' };
      setSteps(steps);
    } else if (cell.t === 'rest') {
      const steps = [...pattern.steps];
      steps[index] = { t: 'token', value: pattern.sound ?? 'bd' };
      setSteps(steps);
    }
  };

  const commit = (index: number) => {
    try {
      const cells = parseMiniNotation(draft.trim());
      if (cells.length === 1) {
        const steps = [...pattern.steps];
        steps[index] = cells[0];
        setSteps(steps);
      } else if (cells.length > 1) {
        setSteps([...pattern.steps.slice(0, index), ...cells, ...pattern.steps.slice(index + 1)]);
      }
    } catch {
      /* keep the previous cell on invalid input */
    }
    setEditing(null);
  };

  return (
    <div data-testid="sub-pattern-editor" className="flex flex-wrap gap-1 p-2">
      {pattern.steps.map((cell, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            data-testid={`sub-cell-${i}`}
            title={serializeTree(cell)}
            onClick={() => {
              if (isSimple(cell)) {
                toggle(i);
              } else {
                setEditing(i);
                setDraft(serializeTree(cell));
              }
            }}
            className={`text-[9px] font-mono px-1.5 py-1 rounded border min-w-[24px] ${
              cell.t === 'rest'
                ? 'border-strudel-surface-light text-muted-foreground'
                : isSimple(cell)
                  ? 'border-strudel-accent text-white'
                  : 'border-yellow-500 text-yellow-300'
            }`}
          >
            {cellLabel(cell)}
          </button>
          {editing === i && (
            <input
              autoFocus
              data-testid={`sub-input-${i}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="w-20 bg-strudel-dark border border-strudel-accent rounded text-[9px] font-mono px-1"
            />
          )}
        </div>
      ))}
    </div>
  );
}
