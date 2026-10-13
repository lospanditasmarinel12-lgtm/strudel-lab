import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeAudioContext, FakeAudioNode } from '@/test/mocks/audio';

const mockDestinationGain = new FakeAudioNode();
mockDestinationGain.gain.value = 1;

vi.mock('@strudel/web', () => ({
  getSuperdoughAudioController: vi.fn(() => ({
    output: { destinationGain: mockDestinationGain },
  })),
}));

const mockGetStrudelAudioContext = vi.fn();
vi.mock('@/lib/strudel-engine', () => ({
  getStrudelAudioContext: mockGetStrudelAudioContext,
  evaluateStrudelCode: vi.fn(() => Promise.resolve()),
  stopStrudel: vi.fn(),
}));

vi.mock('@/lib/timeline-parser', () => ({
  parseEntities: vi.fn(),
}));

import { parseEntities } from '@/lib/timeline-parser';

function makeEntity(id: string, codeLines: string[]) {
  return { id, codeLines };
}

describe('stress: recorder endurance tests', () => {
  let SessionRecorder: any;
  let recorder: any;
  let ctx: FakeAudioContext;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    ctx = new FakeAudioContext();
    mockGetStrudelAudioContext.mockReturnValue(ctx);
    vi.mocked(parseEntities).mockImplementation((code: string) => {
      const blocks = code.split('\n\n').filter((b: string) => b.trim());
      return blocks.map((b: string, i: number) => makeEntity('e' + i, b.split('\n')));
    });
    const mod = await import('@/lib/recorder');
    SessionRecorder = mod.SessionRecorder;
    recorder = new SessionRecorder();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('survives 100 rapid start/stop cycles', () => {
    for (let cycle = 0; cycle < 100; cycle++) {
      recorder.startRecording(`proj-${cycle}`, 120, `s("bd").gain(0.5)`);
      vi.advanceTimersByTime(100);
      const result = recorder.stopRecording();
      expect(result).toBeDefined();
      expect(typeof result.duration).toBe('number');
    }
    expect(recorder.recording).toBe(false);
  });

  it('survives 500 rapid code changes in a single recording', () => {
    recorder.startRecording('stress-proj', 120, 's("bd")');
    for (let i = 0; i < 500; i++) {
      const code = `s("bd").gain(${(i % 100) / 100}).delay(${(i % 50) / 50})`;
      recorder.handleCodeChange(code);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(5000);
    const result = recorder.stopRecording();
    expect(result.duration).toBeGreaterThan(0);
    const snapshots = recorder.getSnapshots();
  });

  it('survives 50 rapid play/evaluate/stop action cycles', () => {
    recorder.startRecording('chaos-proj', 120, 's("hh")');
    for (let i = 0; i < 50; i++) {
      recorder.handleAction(`s("hh").gain(${i / 50})`, 'evaluate');
      vi.advanceTimersByTime(50);
      recorder.handleAction(`s("hh").gain(${i / 50})`, 'stop');
      vi.advanceTimersByTime(50);
    }
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('manages 20 simultaneous entities without performance degradation', () => {
    const code = Array.from({ length: 20 }, (_, i) =>
      `s("sound${i}").gain(0.5).lpf(${200 + i * 100})`,
    ).join('\n\n');
    recorder.startRecording('multi-entity', 120, code);
    for (let round = 0; round < 100; round++) {
      const newCode = Array.from({ length: 20 }, (_, i) =>
        `s("sound${i}").gain(${(round % 100) / 100}).lpf(${200 + i * 100 + round})`,
      ).join('\n\n');
      recorder.handleCodeChange(newCode);
      vi.advanceTimersByTime(500);
    }
    vi.advanceTimersByTime(5000);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(20);
  });

  it('handles pause/resume cycling without state corruption', () => {
    recorder.startRecording('pause-cycles', 120, 's("bd")');
    for (let i = 0; i < 30; i++) {
      recorder.pauseRecording();
      vi.advanceTimersByTime(200);
      recorder.resumeRecording();
      vi.advanceTimersByTime(200);
      recorder.handleCodeChange(`s("bd").gain(${i / 30})`);
    }
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
    const snapshots = recorder.getSnapshots();
    snapshots.forEach((s: any) => {
      expect(typeof s.timestamp).toBe('number');
      expect(typeof s.entityId).toBe('string');
    });
  });

  it('handles empty code without crashing', () => {
    recorder.startRecording('empty-proj', 120, '');
    vi.advanceTimersByTime(1000);
    recorder.handleCodeChange('');
    vi.advanceTimersByTime(1000);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
  });

  it('handles code with 50+ lines without crashing', () => {
    const longCode = Array.from({ length: 50 }, (_, i) =>
      `// line ${i}\ns("bd").gain(0.5).delay(0.${i % 9 + 1})`,
    ).join('\n');
    recorder.startRecording('long-proj', 120, longCode);
    vi.advanceTimersByTime(1000);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
  });

  it('survives start → pause → pause (double pause) without error', () => {
    recorder.startRecording('double-pause', 120, 's("bd")');
    recorder.pauseRecording();
    expect(() => recorder.pauseRecording()).not.toThrow();
    vi.advanceTimersByTime(1000);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
  });

  it('survives stop → stop (double stop) without error', () => {
    recorder.startRecording('double-stop', 120, 's("bd")');
    vi.advanceTimersByTime(100);
    recorder.stopRecording();
    expect(() => recorder.stopRecording()).not.toThrow();
  });

  it('snapshot count does not exceed 5000 limit', () => {
    recorder.startRecording('limit-proj', 120, 's("bd")');
    for (let i = 0; i < 6000; i++) {
      recorder.handleCodeChange(`s("bd").gain(${i / 6000})`);
      vi.advanceTimersByTime(1);
    }
    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeLessThanOrEqual(5000);
  });
});
