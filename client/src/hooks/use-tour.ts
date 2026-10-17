import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TOUR_STEPS, type TourActions, type TourStep } from '@/lib/tour/steps';
import type { TourSignals } from '@/lib/tour/signals';
import { loadTourState, saveTourState, resetTour } from '@/lib/tour/storage';

export type TourStatus = 'idle' | 'active' | 'done';

export interface UseTourResult {
  status: TourStatus;
  stepIndex: number;
  step: TourStep | null;
  total: number;
  /** True once the current step's action has been performed (or it's manual). */
  canAdvance: boolean;
  next: () => void;
  back: () => void;
  skip: () => void;
  replay: () => void;
}

/**
 * Action-gated guided tour.
 *
 * On first launch the tour is active. Each step captures the signals snapshot at
 * activation; when the step's `advanceWhen(signals, baseline)` becomes true the
 * tour advances automatically. Manual steps (no `advanceWhen`) advance on Next.
 * Progress is persisted so a reload resumes.
 */
export function useTour(
  signals: TourSignals,
  actions: TourActions,
  steps: TourStep[] = TOUR_STEPS,
): UseTourResult {
  const [status, setStatus] = useState<TourStatus>(() => (loadTourState().done ? 'done' : 'active'));
  const [stepIndex, setStepIndex] = useState(() => {
    const stored = loadTourState();
    if (stored.done) return 0;
    return Math.min(Math.max(0, stored.step), steps.length - 1);
  });
  const [canAdvance, setCanAdvance] = useState(false);

  const baselineRef = useRef<TourSignals>(signals);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const signalsKey = useMemo(() => JSON.stringify(signals), [signals]);
  const step = steps[stepIndex] ?? null;

  const advance = useCallback(() => {
    setStepIndex((i) => {
      const nextIndex = i + 1;
      if (nextIndex >= steps.length) {
        setStatus('done');
        saveTourState({ done: true, step: 0 });
        return i;
      }
      return nextIndex;
    });
  }, [steps.length]);

  // On activation: capture the baseline, run setup, persist progress.
  useEffect(() => {
    if (status !== 'active') return;
    const current = steps[stepIndex];
    if (!current) {
      setStatus('done');
      saveTourState({ done: true, step: 0 });
      return;
    }
    baselineRef.current = signals;
    setCanAdvance(!current.advanceWhen);
    current.setup?.(actionsRef.current);
    saveTourState({ done: false, step: stepIndex });
    // `signals` intentionally read at activation only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stepIndex]);

  // Gate evaluation: advance as soon as the action is observed.
  useEffect(() => {
    if (status !== 'active') return;
    const current = steps[stepIndex];
    if (!current?.advanceWhen) return;
    if (current.advanceWhen(signals, baselineRef.current)) {
      setCanAdvance(true);
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalsKey, status, stepIndex]);

  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const skip = useCallback(() => {
    setStatus('done');
    saveTourState({ done: true, step: 0 });
  }, []);

  const replay = useCallback(() => {
    resetTour();
    setStepIndex(0);
    setStatus('active');
  }, []);

  return {
    status,
    stepIndex,
    step,
    total: steps.length,
    canAdvance,
    next: advance,
    back,
    skip,
    replay,
  };
}
