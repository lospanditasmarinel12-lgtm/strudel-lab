import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTour } from './use-tour';
import { INITIAL_SIGNALS, type TourSignals } from '@/lib/tour/signals';
import type { TourActions, TourStep } from '@/lib/tour/steps';
import { loadTourState, saveTourState, resetAllOnboarding } from '@/lib/tour/storage';

const actions: TourActions = {
  openRightPanel: vi.fn(),
  setTimeline: vi.fn(),
  setVisual: vi.fn(),
};

const steps: TourStep[] = [
  { id: 'intro', title: 'Intro', body: 'Welcome' },
  { id: 'play', title: 'Play', body: 'Press play', advanceWhen: (s, b) => s.playing && !b.playing },
  { id: 'done', title: 'Done', body: 'All set' },
];

function signals(over: Partial<TourSignals> = {}): TourSignals {
  return { ...INITIAL_SIGNALS, ...over };
}

beforeEach(() => {
  resetAllOnboarding();
});

describe('useTour', () => {
  it('starts active on first launch', () => {
    const { result } = renderHook(() => useTour(signals(), actions, steps));
    expect(result.current.status).toBe('active');
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.canAdvance).toBe(true); // manual step
  });

  it('advances a manual step with next()', () => {
    const { result } = renderHook(() => useTour(signals(), actions, steps));
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.canAdvance).toBe(false); // gated
  });

  it('auto-advances when the action gate flips true', () => {
    const { result, rerender } = renderHook(({ s }) => useTour(s, actions, steps), {
      initialProps: { s: signals() },
    });
    act(() => result.current.next()); // now on the gated 'play' step
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.canAdvance).toBe(false);

    rerender({ s: signals({ playing: true }) });
    expect(result.current.stepIndex).toBe(2);
    expect(result.current.canAdvance).toBe(true);
  });

  it('does not advance a gate that was already true at activation', () => {
    const { result, rerender } = renderHook(({ s }) => useTour(s, actions, steps), {
      initialProps: { s: signals({ playing: true }) },
    });
    act(() => result.current.next()); // activate 'play' with playing already true
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.canAdvance).toBe(false);
    rerender({ s: signals({ playing: true }) });
    expect(result.current.stepIndex).toBe(1); // baseline was true, so no advance
  });

  it('skip finishes and persists', () => {
    const { result } = renderHook(() => useTour(signals(), actions, steps));
    act(() => result.current.skip());
    expect(result.current.status).toBe('done');
    expect(loadTourState().done).toBe(true);
  });

  it('resumes from a stored step', () => {
    saveTourState({ done: false, step: 2 });
    const { result } = renderHook(() => useTour(signals(), actions, steps));
    expect(result.current.status).toBe('active');
    expect(result.current.stepIndex).toBe(2);
  });

  it('stays done when the stored state is done', () => {
    saveTourState({ done: true, step: 0 });
    const { result } = renderHook(() => useTour(signals(), actions, steps));
    expect(result.current.status).toBe('done');
  });

  it('replay resets and restarts', () => {
    saveTourState({ done: true, step: 0 });
    const { result } = renderHook(() => useTour(signals(), actions, steps));
    expect(result.current.status).toBe('done');
    act(() => result.current.replay());
    expect(result.current.status).toBe('active');
    expect(result.current.stepIndex).toBe(0);
  });

  it('runs a step setup on activation', () => {
    const setup = vi.fn();
    const withSetup: TourStep[] = [{ id: 'x', title: 'X', body: '', setup }];
    renderHook(() => useTour(signals(), actions, withSetup));
    expect(setup).toHaveBeenCalledWith(actions);
  });
});
