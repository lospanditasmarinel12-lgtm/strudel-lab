import { vi } from 'vitest';

/**
 * Deterministic clock for tests.
 *
 * Vitest's fake timers (sinon) fake `Date`, `performance`, and
 * `requestAnimationFrame`, so `Date.now()` and `performance.now()` advance
 * together when timers are ticked. This wrapper exists so every suite installs
 * the clock the same way and tears it down reliably.
 */
export interface FakeClock {
  /** Advance the clock by `ms` and run any timers that fall in the window. */
  advance(ms: number): void;
  /** Advance far enough to fire a pending animation frame (≈ one frame). */
  frame(): void;
  /** Current `Date.now()`. */
  readonly now: number;
  /** Run all currently-pending timers and microtasks. */
  flush(): Promise<void>;
  uninstall(): void;
}

export function installFakeClock(startMs = 0): FakeClock {
  vi.useFakeTimers();
  vi.setSystemTime(startMs);
  let installed = true;

  return {
    advance(ms: number) {
      vi.advanceTimersByTime(ms);
    },
    frame() {
      // rAF is scheduled on a ~16ms timer by default; advance a full frame.
      vi.advanceTimersByTime(16);
    },
    get now() {
      return Date.now();
    },
    async flush() {
      await vi.runOnlyPendingTimersAsync();
    },
    uninstall() {
      if (installed) {
        installed = false;
        vi.useRealTimers();
      }
    },
  };
}

/**
 * Advance the clock repeatedly in frame-sized steps, running microtasks between
 * frames so promise chains inside `requestAnimationFrame` callbacks resolve.
 * Used to drive `CodeSessionPlayer.tick()` deterministically.
 */
export async function advanceFrames(clock: FakeClock, frames: number): Promise<void> {
  for (let i = 0; i < frames; i++) {
    clock.frame();
    await Promise.resolve();
    await Promise.resolve();
  }
}
