import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { installFakeClock, advanceFrames } from '@/test/clock';

/**
 * Model-based (L3) tests for `CodeSessionPlayer`, the re-enactment engine behind
 * the playback page. A reference model defines which snapshot should be applied
 * at a given time; the real player must match it and perform the right audio
 * side effect.
 */

const { mockEvaluate, mockStop } = vi.hoisted(() => ({
  mockEvaluate: vi.fn(() => Promise.resolve()),
  mockStop: vi.fn(),
}));

vi.mock('./strudel-engine', () => ({
  evaluateStrudelCode: mockEvaluate,
  stopStrudel: mockStop,
}));

import { CodeSessionPlayer, type CodeSnapshotEntry } from './code-session-player';

type Action = NonNullable<CodeSnapshotEntry['actionType']>;

const snapArb = fc
  .array(
    fc.record({
      timestamp: fc.integer({ min: 0, max: 5000 }),
      code: fc.constantFrom('s("bd")', 's("bd hh")', 's("bd hh cp")', 'setcps(0.5)'),
      actionType: fc.constantFrom<Action>('edit', 'evaluate', 'play', 'stop', 'bpm_change'),
    }),
    { maxLength: 8 },
  )
  .map((snaps) => [...snaps].sort((a, b) => a.timestamp - b.timestamp));

function expectedAt(snaps: CodeSnapshotEntry[], t: number): CodeSnapshotEntry | null {
  let found: CodeSnapshotEntry | null = null;
  for (const s of snaps) if (s.timestamp <= t) found = s;
  return found;
}

describe('CodeSessionPlayer: seek model (L3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies exactly the latest snapshot at or before the seek target', () => {
    fc.assert(
      fc.property(snapArb, fc.integer({ min: 0, max: 6000 }), (snaps, target) => {
        const player = new CodeSessionPlayer(snaps, 6000, 120);
        let lastCode = '';
        player.onCodeUpdate = (c) => {
          lastCode = c;
        };
        player.seek(target);
        const expected = expectedAt(snaps, Math.max(0, Math.min(6000, target)));
        if (expected) expect(lastCode).toBe(expected.code);
        player.destroy();
      }),
      { numRuns: 200 },
    );
  });

  it('edit is visual-only, stop hushes, evaluate/play re-evaluate', () => {
    const snaps: CodeSnapshotEntry[] = [
      { timestamp: 0, code: 'a', actionType: 'edit' },
      { timestamp: 100, code: 'b', actionType: 'evaluate' },
      { timestamp: 200, code: 'c', actionType: 'stop' },
      { timestamp: 300, code: 'd', actionType: 'play' },
    ];
    const player = new CodeSessionPlayer(snaps, 1000, 120);
    player.onCodeUpdate = () => {};

    player.seek(50);
    expect(mockEvaluate).toHaveBeenCalledTimes(0);
    expect(mockStop).toHaveBeenCalledTimes(0);

    player.seek(150);
    expect(mockEvaluate).toHaveBeenCalledWith('b');

    player.seek(250);
    expect(mockStop).toHaveBeenCalledTimes(1);

    player.seek(350);
    expect(mockEvaluate).toHaveBeenCalledWith('d');
    player.destroy();
  });
});

describe('CodeSessionPlayer: play/pause/stop scenario', () => {
  let clock: ReturnType<typeof installFakeClock>;

  beforeEach(() => {
    vi.clearAllMocks();
    clock = installFakeClock(0);
  });

  afterEach(() => {
    clock.uninstall();
  });

  it('walks snapshots in time and stops at duration', async () => {
    const snaps: CodeSnapshotEntry[] = [
      { timestamp: 0, code: 's("bd")', actionType: 'edit' },
      { timestamp: 1000, code: 's("bd hh")', actionType: 'evaluate' },
      { timestamp: 2000, code: 's("bd hh cp")', actionType: 'stop' },
    ];
    const player = new CodeSessionPlayer(snaps, 3000, 120);
    const codes: string[] = [];
    const states: string[] = [];
    player.onCodeUpdate = (c) => codes.push(c);
    player.onStateChange = (s) => states.push(s);

    await player.play();
    expect(player.state).toBe('playing');
    expect(codes[0]).toBe('s("bd")');

    await advanceFrames(clock, 70); // ~1120ms
    expect(codes).toContain('s("bd hh")');
    expect(mockEvaluate).toHaveBeenCalledWith('s("bd hh")');

    await advanceFrames(clock, 70); // ~2240ms
    expect(codes).toContain('s("bd hh cp")');
    expect(mockStop).toHaveBeenCalled();

    await advanceFrames(clock, 60); // past duration
    expect(player.state).toBe('idle');
    expect(states).toContain('playing');
    expect(states).toContain('idle');
    player.destroy();
  });

  it('pause freezes time; resume continues; stop resets to zero', async () => {
    const snaps: CodeSnapshotEntry[] = [{ timestamp: 0, code: 'x', actionType: 'edit' }];
    const player = new CodeSessionPlayer(snaps, 5000, 120);
    await player.play();
    await advanceFrames(clock, 30);
    const at = player.currentTime;
    player.pause();
    expect(player.state).toBe('paused');
    await advanceFrames(clock, 30);
    expect(player.currentTime).toBe(at);
    await player.play();
    expect(player.state).toBe('playing');
    player.stop();
    expect(player.state).toBe('idle');
    expect(player.currentTime).toBe(0);
    player.destroy();
  });

  it('loop restarts at zero instead of idling', async () => {
    const snaps: CodeSnapshotEntry[] = [
      { timestamp: 0, code: 'a', actionType: 'edit' },
      { timestamp: 500, code: 'b', actionType: 'evaluate' },
    ];
    const player = new CodeSessionPlayer(snaps, 800, 120);
    player.loop = true;
    player.onCodeUpdate = () => {};
    await player.play();
    await advanceFrames(clock, 70); // past 800ms
    expect(player.state).toBe('playing');
    player.destroy();
  });

  it('destroy tears down callbacks and cancels the loop', async () => {
    const snaps: CodeSnapshotEntry[] = [{ timestamp: 0, code: 'x', actionType: 'edit' }];
    const player = new CodeSessionPlayer(snaps, 5000, 120);
    player.onTimeUpdate = vi.fn();
    player.onCodeUpdate = vi.fn();
    await player.play();
    player.destroy();
    expect(player.onTimeUpdate).toBeNull();
    expect(player.onCodeUpdate).toBeNull();
    await advanceFrames(clock, 20);
    // No throw and no further state change after destroy.
    await player.play();
    expect(player.state).toBe('idle');
  });

  it('reports evaluate failures through onError', async () => {
    mockEvaluate.mockRejectedValueOnce(new Error('boom'));
    const snaps: CodeSnapshotEntry[] = [{ timestamp: 0, code: 'bad', actionType: 'evaluate' }];
    const player = new CodeSessionPlayer(snaps, 1000, 120);
    const errors: string[] = [];
    player.onError = (e) => errors.push(e);
    player.seek(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('boom');
    player.destroy();
  });
});
