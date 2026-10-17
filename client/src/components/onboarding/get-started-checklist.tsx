import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import type { TourSignals } from '@/lib/tour/signals';
import { loadChecklist, saveChecklist } from '@/lib/tour/storage';

interface ChecklistItem {
  id: string;
  label: string;
  done: (s: TourSignals) => boolean;
}

const ITEMS: ChecklistItem[] = [
  { id: 'play', label: 'Press Play', done: (s) => s.playing },
  { id: 'blocks', label: 'Explore Blocks', done: (s) => s.showVisual },
  { id: 'sample', label: 'Insert a sample', done: (s) => s.sampleInserted > 0 },
  { id: 'record', label: 'Record a session', done: (s) => s.recording || s.hasSession },
  { id: 'export', label: 'Export your work', done: (s) => s.exported > 0 },
];

/**
 * Dismissible "Get started" card. Items check themselves off from the same tour
 * signals; completion and dismissal persist.
 */
export default function GetStartedChecklist({ signals }: { signals: TourSignals }) {
  const [state, setState] = useState(loadChecklist);
  const signalsKey = useMemo(() => JSON.stringify(signals), [signals]);

  useEffect(() => {
    const completed = new Set(state.completed);
    let changed = false;
    for (const item of ITEMS) {
      if (item.done(signals) && !completed.has(item.id)) {
        completed.add(item.id);
        changed = true;
      }
    }
    if (changed) {
      const next = { ...state, completed: Array.from(completed) };
      setState(next);
      saveChecklist(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalsKey]);

  if (state.dismissed) return null;

  const completedCount = ITEMS.filter((i) => state.completed.includes(i.id)).length;
  const allDone = completedCount === ITEMS.length;

  const dismiss = () => {
    const next = { ...state, dismissed: true };
    setState(next);
    saveChecklist(next);
  };

  return (
    <div
      data-testid="get-started"
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 w-64 bg-strudel-surface border border-strudel-surface-light rounded-lg shadow-lg p-3 font-mono text-white"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-strudel-accent">
          {allDone ? 'You’re all set!' : 'Get started'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{completedCount}/{ITEMS.length}</span>
          <button
            type="button"
            data-testid="get-started-dismiss"
            onClick={dismiss}
            aria-label="Dismiss checklist"
            className="text-muted-foreground hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const done = state.completed.includes(item.id);
          return (
            <li key={item.id} className="flex items-center gap-2 text-[11px]">
              {done ? (
                <CheckCircle2 size={12} className="text-strudel-accent shrink-0" />
              ) : (
                <Circle size={12} className="text-muted-foreground shrink-0" />
              )}
              <span className={done ? 'text-muted-foreground line-through' : 'text-white'}>
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
