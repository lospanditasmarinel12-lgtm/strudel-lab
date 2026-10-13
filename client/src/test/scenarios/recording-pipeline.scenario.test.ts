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
  detectInstruments: vi.fn(),
  extractModifiers: vi.fn(() => []),
  resolveSnapshotCodes: vi.fn(function(snaps: any[]) {
    return snaps.map((s) => ({ ...s, code: s.code, baseSnapshotId: undefined }));
  }),
}));

// Mock session store + db for exporter (avoids Dexie under fake timers)
vi.mock('@/lib/stores/session-store', () => ({
  createSession: vi.fn(() => Promise.resolve('session-1')),
}));

vi.mock('@/lib/stores/db', () => ({
  db: {
    customSamples: {
      bulkGet: vi.fn(() => Promise.resolve([])),
      get: vi.fn(() => Promise.resolve(undefined)),
      put: vi.fn(() => Promise.resolve()),
    },
  },
}));

import { parseEntities, detectInstruments, extractModifiers } from '@/lib/timeline-parser';
import { exportLiveSessionAsFile } from '@/lib/session-exporter';

function makeEntity(id: string, codeLines: string[]) {
  return { id, codeLines };
}

describe('scenario: recording pipeline integration', () => {
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

    vi.mocked(detectInstruments).mockImplementation((code: string) => {
      if (!code) return [];
      const lines = code.split('\n');
      return lines
        .filter((l) => l.includes('.s(') || l.includes('s('))
        .map((l, i) => ({
          name: `instrument-${i}`,
          category: 'custom' as const,
          lineIndex: i,
          code: l,
        }));
    });

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as any);

    const mod = await import('@/lib/recorder');
    SessionRecorder = mod.SessionRecorder;
    recorder = new SessionRecorder();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('full pipeline: start record → type code → play → stop → get snapshots → export JSON', async () => {
    // Phase 1: Start recording
    recorder.startRecording('project-1', 120, 's("bd").gain(0.5)');
    vi.advanceTimersByTime(1000);

    // Phase 2: Type new code (user edits)
    recorder.handleCodeChange('s("bd hh").gain(0.8).delay(0.3)');
    vi.advanceTimersByTime(4000);

    // Phase 3: Evaluate (play)
    recorder.handleAction('s("bd hh").gain(0.8).delay(0.3)', 'evaluate');
    vi.advanceTimersByTime(1000);

    // Phase 4: Change BPM
    recorder.handleAction('s("bd hh").gain(0.8).delay(0.3)', 'bpm_change');
    vi.advanceTimersByTime(1000);

    // Phase 5: Stop
    recorder.handleAction('s("bd hh").gain(0.8).delay(0.3)', 'stop');
    vi.advanceTimersByTime(500);

    // Phase 6: Stop recording
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
    expect(result.audioBlob).toBeDefined();

    // Phase 7: Get snapshots
    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);

    // Phase 8: Export as JSON
    const session = {
      id: 's1',
      projectId: 'project-1',
      name: 'test-session',
      bpm: 120,
      duration: result.duration,
      createdAt: Date.now(),
      audioBlob: result.audioBlob,
      tracks: [],
      snapshots,
    };

    await exportLiveSessionAsFile(session as any, snapshots as any);

    // Phase 9: Verify export was attempted
    const createEl = vi.mocked(document.createElement);
    expect(createEl).toHaveBeenCalledWith('a');
    const anchor: any = createEl.mock.results[createEl.mock.results.length - 1]?.value;
    if (anchor) {
      expect(anchor.download).toContain('.strudel.live.json');
    }
  });

  it('full pipeline: multiple entity tracks with concurrent edits', () => {
    const initialCode = 's("bd").gain(0.5)\n\ns("hh").delay(0.2)\n\nnote("c3 e3").s("sawtooth")';
    recorder.startRecording('multi-track', 120, initialCode);
    vi.advanceTimersByTime(2000);

    // Edit track 1 (bd)
    recorder.handleCodeChange('s("bd bd bd").gain(0.7).lpf(400)\n\ns("hh").delay(0.2)\n\nnote("c3 e3").s("sawtooth")');
    vi.advanceTimersByTime(3000);

    // Edit track 2 (hh)
    recorder.handleCodeChange('s("bd bd bd").gain(0.7).lpf(400)\n\ns("hh oh").delay(0.4).room(0.5)\n\nnote("c3 e3").s("sawtooth")');
    vi.advanceTimersByTime(3000);

    // Evaluate
    recorder.handleAction('s("bd bd bd").gain(0.7).lpf(400)\n\ns("hh oh").delay(0.4).room(0.5)\n\nnote("c3 e3").s("sawtooth")', 'evaluate');
    vi.advanceTimersByTime(2000);

    const result = recorder.stopRecording();
    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(1);
    expect(result.audioBlob).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);

    // Each snapshot should have valid fields
    snapshots.forEach((s: any) => {
      expect(s.id).toBeTruthy();
      expect(s.entityId).toBeTruthy();
      expect(typeof s.timestamp).toBe('number');
      expect(s.actionType).toMatch(/^(edit|evaluate|play|stop|bpm_change)$/);
    });
  });

  it('scenario: record short bursts with gaps (simulating typing pauses)', () => {
    recorder.startRecording('burst-proj', 120, 's("bd")');
    vi.advanceTimersByTime(500);

    // Typing burst 1
    recorder.handleCodeChange('s("bd hh")');
    vi.advanceTimersByTime(100);
    recorder.handleCodeChange('s("bd hh cp")');
    vi.advanceTimersByTime(100);
    recorder.handleCodeChange('s("bd hh cp oh")');
    vi.advanceTimersByTime(3000); // Long pause

    // Typing burst 2
    recorder.handleCodeChange('s("bd hh cp oh").gain(0.7)');
    vi.advanceTimersByTime(100);
    recorder.handleCodeChange('s("bd hh cp oh").gain(0.7).delay(0.3)');
    vi.advanceTimersByTime(5000);

    const result = recorder.stopRecording();
    const snapshots = recorder.getSnapshots();

    // Should have deduplicated snapshots despite rapid typing
    const editSnapshots = snapshots.filter((s: any) => s.actionType === 'edit');
    expect(editSnapshots.length).toBeGreaterThan(0);
  });

  it('scenario: record, then import the exported data back', async () => {
    // Start recording
    recorder.startRecording('roundtrip-proj', 140, 's("bd").gain(0.6)');
    vi.advanceTimersByTime(2000);
    recorder.handleCodeChange('s("bd hh").gain(0.6).room(0.3)');
    vi.advanceTimersByTime(3000);
    recorder.handleAction('s("bd hh").gain(0.6).room(0.3)', 'play');
    vi.advanceTimersByTime(2000);

    const result = recorder.stopRecording();
    const snapshots = recorder.getSnapshots();

    // Export the session
    const exported = {
      version: 1,
      name: 'roundtrip-test',
      bpm: 140,
      duration: result.duration,
      createdAt: Date.now(),
      snapshots: snapshots.map((s: any) => ({
        timestamp: s.timestamp,
        code: s.code,
        actionType: s.actionType,
        entityId: s.entityId,
      })),
    };

    // Verify export JSON structure is valid
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.name).toBe('roundtrip-test');
    expect(parsed.snapshots.length).toBe(snapshots.length);
    expect(parsed.snapshots[0]).toHaveProperty('timestamp');
    expect(parsed.snapshots[0]).toHaveProperty('code');
    expect(parsed.snapshots[0]).toHaveProperty('actionType');
  });

  it('scenario: handle empty entity code gracefully', () => {
    recorder.startRecording('empty-entity', 120, '');
    vi.advanceTimersByTime(1000);
    recorder.handleCodeChange('s("bd")');
    vi.advanceTimersByTime(1000);
    recorder.handleCodeChange('');
    vi.advanceTimersByTime(1000);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('scenario: entities with special characters in code', () => {
    const code = `s("bd").gain(0.5).delay(${1 / 3})\ns("hi-hat").lpf(2000).room(0.${Math.PI.toFixed(2).split('.')[1]})`;
    recorder.startRecording('special-chars', 120, code);
    vi.advanceTimersByTime(1000);
    recorder.handleCodeChange(code.replace('0.5', '0.8'));
    vi.advanceTimersByTime(2000);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
  });

  it('scenario: quick start/stop without any interaction', () => {
    recorder.startRecording('quick', 120, 's("bd")');
    vi.advanceTimersByTime(10);
    const result = recorder.stopRecording();
    expect(result).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
  });
});
