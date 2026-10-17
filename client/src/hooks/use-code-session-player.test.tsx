import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Wiring tests for `useCodeSessionPlayer`: the hook is the bridge between the
 * `CodeSessionPlayer` engine and React state. The engine's own behavior is
 * covered by `code-session-player.model.test.ts`; here we assert the hook binds
 * callbacks, forwards commands, seeds the initial code, and cleans up.
 */

const { Fake, instances } = vi.hoisted(() => {
  class Fake {
    state = 'idle';
    currentTime = 0;
    duration = 0;
    bpm = 120;
    loop = false;
    destroyed = false;
    stopped = false;
    onTimeUpdate: ((t: number) => void) | null = null;
    onCodeUpdate: ((c: string) => void) | null = null;
    onStateChange: ((s: string) => void) | null = null;
    onError: ((e: string) => void) | null = null;
    constructor() {
      instances.push(this);
    }
    setSnapshots(): void {}
    play(): void {
      this.state = 'playing';
      this.onStateChange?.('playing');
    }
    pause(): void {
      this.state = 'paused';
      this.onStateChange?.('paused');
    }
    stop(): void {
      this.stopped = true;
      this.state = 'idle';
      this.onStateChange?.('idle');
    }
    seek(ms: number): void {
      this.currentTime = ms;
      this.onTimeUpdate?.(ms);
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  const instances: Fake[] = [];
  return { Fake, instances };
});

vi.mock('@/lib/code-session-player', () => ({ CodeSessionPlayer: Fake }));

import { useCodeSessionPlayer } from './use-code-session-player';

const snaps = [
  { timestamp: 0, code: 's("bd")', actionType: 'edit' },
  { timestamp: 100, code: 's("bd hh")', actionType: 'evaluate' },
];

describe('useCodeSessionPlayer', () => {
  beforeEach(() => {
    instances.length = 0;
  });

  it('seeds currentCode with the first snapshot on load', () => {
    const { result } = renderHook(() => useCodeSessionPlayer());
    act(() => result.current.loadSession(snaps as any, 1000, 120));
    expect(result.current.currentCode).toBe('s("bd")');
    expect(result.current.state).toBe('idle');
  });

  it('reflects engine state transitions', () => {
    const { result } = renderHook(() => useCodeSessionPlayer());
    act(() => result.current.loadSession(snaps as any, 1000, 120));
    act(() => result.current.play());
    expect(result.current.state).toBe('playing');
    act(() => result.current.pause());
    expect(result.current.state).toBe('paused');
    act(() => result.current.stop());
    expect(result.current.state).toBe('idle');
  });

  it('forwards time and code updates from the engine', () => {
    const { result } = renderHook(() => useCodeSessionPlayer());
    act(() => result.current.loadSession(snaps as any, 1000, 120));
    const player = instances[0];
    act(() => player.onTimeUpdate?.(250));
    expect(result.current.currentTime).toBe(250);
    act(() => player.onCodeUpdate?.('s("bd hh")'));
    expect(result.current.currentCode).toBe('s("bd hh")');
  });

  it('stopping and destroying the previous player on reload', () => {
    const { result } = renderHook(() => useCodeSessionPlayer());
    act(() => result.current.loadSession(snaps as any, 1000, 120));
    const first = instances[0];
    act(() => result.current.loadSession(snaps as any, 2000, 130));
    expect(first.stopped).toBe(true);
    expect(first.destroyed).toBe(true);
    expect(instances.length).toBe(2);
  });

  it('cleans up the player on unmount', () => {
    const { result, unmount } = renderHook(() => useCodeSessionPlayer());
    act(() => result.current.loadSession(snaps as any, 1000, 120));
    const player = instances[0];
    unmount();
    expect(player.stopped).toBe(true);
    expect(player.destroyed).toBe(true);
  });
});
