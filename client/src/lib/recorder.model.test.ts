import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { FakeAudioNode } from '@/test/mocks/audio';

/**
 * Model-based (L3) tests for `SessionRecorder`.
 *
 * A reference model tracks the control state (`recording`/`paused`) and the last
 * full code the user saw. Every command replays against the real recorder and
 * asserts the model and real agree on lifecycle and on the final code returned by
 * `stopRecording`. Snapshot invariants are checked after each run.
 */

const mockDestinationGain = new FakeAudioNode();
mockDestinationGain.gain.value = 1;

const mockEvaluateStrudelCode = vi.fn(() => Promise.resolve());
const mockStopStrudel = vi.fn();

vi.mock('./strudel-engine', () => ({
  getStrudelAudioContext: vi.fn(() => null),
  evaluateStrudelCode: mockEvaluateStrudelCode,
  stopStrudel: mockStopStrudel,
  getSuperdoughDestination: vi.fn(() => mockDestinationGain),
}));

vi.mock('./timeline-parser', () => ({
  parseEntities: vi.fn((code: string) => {
    const blocks = code.split('\n\n').filter((b) => b.trim());
    return blocks.map((b, i) => ({ id: `e${i}`, codeLines: b.split('\n') }));
  }),
}));

const CODE_POOL = [
  's("bd")',
  's("bd ~ bd ~")',
  's("bd hh")',
  's("bd hh cp").gain(0.7)',
  'note("c3 e3").s("sawtooth")',
  'setcps(0.5)',
];

class RecModel {
  recording = false;
  paused = false;
  lastCode = '';
  counter = 0;

  next(): string {
    return CODE_POOL[this.counter++ % CODE_POOL.length];
  }
}

interface Cmd {
  check(model: RecModel): boolean;
  run(model: RecModel, real: any): void;
  toString(): string;
}

const ACTIONS = ['evaluate', 'play', 'stop', 'bpm_change'] as const;

const startCommand: Cmd = {
  check: (m) => !m.recording,
  run: (m, r) => {
    const code = m.next();
    r.startRecording('p1', 120, code);
    m.recording = true;
    m.paused = false;
    m.lastCode = code;
    expect(r.recording).toBe(true);
  },
  toString: () => 'start',
};

const editCommand: Cmd = {
  check: (m) => m.recording && !m.paused,
  run: (m, r) => {
    const code = m.next();
    r.handleCodeChange(code);
    m.lastCode = code;
    expect(r.recording).toBe(true);
  },
  toString: () => 'edit',
};

const actionCommand: Cmd = {
  check: (m) => m.recording && !m.paused,
  run: (m, r) => {
    const code = m.next();
    const type = ACTIONS[m.counter % ACTIONS.length];
    r.handleAction(code, type);
    m.lastCode = code;
  },
  toString: () => 'action',
};

const pauseCommand: Cmd = {
  check: (m) => m.recording && !m.paused,
  run: (m, r) => {
    r.pauseRecording();
    m.paused = true;
    expect(r.paused).toBe(true);
  },
  toString: () => 'pause',
};

const resumeCommand: Cmd = {
  check: (m) => m.recording && m.paused,
  run: (m, r) => {
    r.resumeRecording();
    m.paused = false;
    expect(r.paused).toBe(false);
  },
  toString: () => 'resume',
};

const stopCommand: Cmd = {
  check: (m) => m.recording,
  run: (m, r) => {
    const result = r.stopRecording();
    expect(result.finalCode).toBe(m.lastCode);
    m.recording = false;
    m.paused = false;
    expect(r.recording).toBe(false);
  },
  toString: () => 'stop',
};

function assertSnapshotInvariants(recorder: any): void {
  const snaps = recorder.getSnapshots();
  for (let i = 0; i < snaps.length; i++) {
    expect(typeof snaps[i].id).toBe('string');
    expect(typeof snaps[i].entityId).toBe('string');
    expect(typeof snaps[i].timestamp).toBe('number');
    expect(Number.isFinite(snaps[i].timestamp)).toBe(true);
    expect(['edit', 'evaluate', 'play', 'stop', 'bpm_change']).toContain(snaps[i].actionType);
    if (i > 0) expect(snaps[i].timestamp).toBeGreaterThanOrEqual(snaps[i - 1].timestamp);
  }
}

describe('SessionRecorder: model-based lifecycle', () => {
  let SessionRecorder: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockDestinationGain.connections = [];
    const mod = await import('./recorder');
    SessionRecorder = mod.SessionRecorder;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches the reference model across random command sequences', () => {
    fc.assert(
      fc.property(
        fc.commands(
          [startCommand, editCommand, actionCommand, pauseCommand, resumeCommand, stopCommand].map((c) =>
            fc.constant(c),
          ),
          { maxCommands: 30 },
        ),
        (cmds) => {
          const real = { model: new RecModel(), real: new SessionRecorder() };
          try {
            fc.modelRun(() => real, cmds);
          } finally {
            assertSnapshotInvariants(real.real);
            real.real.reset();
          }
        },
      ),
      { numRuns: 100, seed: 12345 },
    );
  });

  it('pause suspends code snapshots until resume', () => {
    const r = new SessionRecorder();
    r.startRecording('p1', 120, 's("bd")');
    r.pauseRecording();
    const before = r.getSnapshots().length;
    r.handleCodeChange('s("bd hh")');
    expect(r.getSnapshots().length).toBe(before);
    r.resumeRecording();
    r.handleCodeChange('s("bd hh cp")');
    r.commitAllEntities();
    expect(r.getSnapshots().length).toBeGreaterThan(before);
    r.reset();
  });

  it('stop is idempotent and clears recording state', () => {
    const r = new SessionRecorder();
    r.startRecording('p1', 120, 's("bd")');
    r.stopRecording();
    expect(() => r.stopRecording()).not.toThrow();
    expect(r.recording).toBe(false);
    r.reset();
  });
});
