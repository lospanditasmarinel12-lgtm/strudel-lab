import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeAudioContext, FakeAudioNode, FakeMediaStreamDestination } from '@/test/mocks/audio';
import { lineDiff, applyDiff, applyPatch, isSplicePatch } from './diff';

const mockDestinationGain = new FakeAudioNode();
mockDestinationGain.gain.value = 1;

const mockGetStrudelAudioContext = vi.fn();
const mockEvaluateStrudelCode = vi.fn(() => Promise.resolve());
const mockStopStrudel = vi.fn();
const mockGetSuperdoughDestination = vi.fn(() => mockDestinationGain);

vi.mock('./strudel-engine', () => ({
  getStrudelAudioContext: mockGetStrudelAudioContext,
  evaluateStrudelCode: mockEvaluateStrudelCode,
  stopStrudel: mockStopStrudel,
  getSuperdoughDestination: mockGetSuperdoughDestination,
}));

vi.mock('./timeline-parser', () => ({
  parseEntities: vi.fn(),
}));

import { parseEntities } from './timeline-parser';

function makeEntity(id: string, codeLines: string[]) {
  return { id, codeLines };
}

describe('SessionRecorder', () => {
  let SessionRecorder;
  let recorder;
  let ctx;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockDestinationGain.connections = [];

    ctx = new FakeAudioContext();
    mockGetStrudelAudioContext.mockReturnValue(ctx);

    vi.mocked(parseEntities).mockImplementation(function(code) {
      const blocks = code.split('\n\n').filter(function(b) { return b.trim(); });
      return blocks.map(function(b, i) { return makeEntity('e' + i, b.split('\n')); });
    });

    const mod = await import('./recorder');
    SessionRecorder = mod.SessionRecorder;
    recorder = new SessionRecorder();
  });

  afterEach(function() {
    vi.useRealTimers();
  });

  describe('initial state', function() {
    it('starts with recording=false', function() {
      expect(recorder.recording).toBe(false);
    });

    it('getElapsedMs returns 0 before recording', function() {
      expect(recorder.getElapsedMs()).toBe(0);
    });
  });

  describe('startRecording', function() {
    it('sets recording=true and startTime', function() {
      vi.advanceTimersByTime(100);
      recorder.startRecording('proj1', 120, 'note("c3")');
      expect(recorder.recording).toBe(true);
      expect(recorder.startTime).toBeGreaterThan(0);
    });

    it('creates EntityTrackers from parsed entities', function() {
      vi.mocked(parseEntities).mockReturnValue([
        makeEntity('e1', ['note("c3")']),
        makeEntity('e2', ['s("bd")']),
      ]);
      recorder.startRecording('proj1', 120, 'note("c3")\n\ns("bd")');
      expect(recorder['entities'].size).toBe(2);
    });

    it('each EntityTracker has lastSnapshottedCode set', function() {
      vi.mocked(parseEntities).mockReturnValue([
        makeEntity('e1', ['note("c3")']),
      ]);
      recorder.startRecording('proj1', 120, 'note("c3")');
      const tracker = recorder['entities'].get('e1');
      expect(tracker.lastSnapshottedCode).toBe('note("c3")');
    });

    it('resets state before starting', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.recording = false;
      recorder.startRecording('p2', 140, 'b');
      expect(recorder.bpm).toBe(140);
      expect(recorder.projectId).toBe('p2');
    });
  });

  describe('getElapsedMs', function() {
    it('returns elapsed time during recording', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.advanceTimersByTime(500);
      expect(recorder.getElapsedMs()).toBeGreaterThanOrEqual(500);
    });

    it('returns non-zero after stopRecording', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.advanceTimersByTime(1000);
      recorder.stopRecording();
      expect(recorder.getElapsedMs()).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('superdough output tap', function() {
    it('connects the tap on start and disconnects the same node on stop', function() {
      recorder.startRecording('p1', 120, 'a');
      expect(mockDestinationGain.connections.length).toBe(1);
      const tap = mockDestinationGain.connections[0];

      recorder.stopRecording();
      expect(mockDestinationGain.connections).not.toContain(tap);
      expect(mockDestinationGain.connections.length).toBe(0);
    });

    it('re-establishes a single tap across recording cycles', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.stopRecording();
      recorder.startRecording('p2', 120, 'b');
      expect(mockDestinationGain.connections.length).toBe(1);
      recorder.stopRecording();
      expect(mockDestinationGain.connections.length).toBe(0);
    });
  });

  describe('stopRecording', function() {
    it('returns audioBlob and duration', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.advanceTimersByTime(2000);
      const result = recorder.stopRecording();
      expect(result.audioBlob).toBeInstanceOf(Blob);
      expect(result.duration).toBeGreaterThanOrEqual(2000);
    });

    it('sets recording=false', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.stopRecording();
      expect(recorder.recording).toBe(false);
    });

    it('is safe to call twice', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.stopRecording();
      expect(function() { recorder.stopRecording(); }).not.toThrow();
    });
  });

  describe('handleCodeChange', function() {
    it('does nothing when not recording', function() {
      recorder.handleCodeChange('new code');
      expect(recorder['snapshots'].length).toBe(0);
    });

    it('does nothing when paused', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.pauseRecording();
      recorder.handleCodeChange('b');
      expect(recorder['snapshots'].length).toBe(1);
    });

    it('adds snapshot for new entity', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['a']), makeEntity('e1', ['b'])]);
      recorder.handleCodeChange('a\n\nb');
      expect(recorder['snapshots'].length).toBe(2);
    });

    it('does NOT add duplicate snapshot for unchanged code', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['a'])]);
      recorder.handleCodeChange('a');
      expect(recorder['snapshots'].length).toBe(1);
    });

    it('adds snapshot after inactivity timer', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['a'])]);
      recorder.handleCodeChange('a');
      vi.advanceTimersByTime(3100);
      expect(recorder['snapshots'].length).toBe(1);
    });

    it('handles entity removal gracefully', function() {
      recorder.startRecording('p1', 120, 'a\n\nb');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['a'])]);
      recorder.handleCodeChange('a');
      expect(recorder['entities'].has('e1')).toBe(true);
    });
  });

  describe('handleAction', function() {
    it('records action snapshot', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.handleAction('a', 'evaluate');
      expect(recorder['snapshots'].length).toBe(2);
      expect(recorder['snapshots'][1].actionType).toBe('evaluate');
    });

    it('commits pending changes before action', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['b'])]);
      recorder.handleCodeChange('b');
      recorder.handleAction('a', 'play');
      expect(recorder['snapshots'].length).toBe(3);
    });

    it('calls evaluateStrudelCode for play action', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.handleAction('a', 'play');
      expect(mockEvaluateStrudelCode).toHaveBeenCalledWith('a');
    });
  });

  describe('commitAllEntities', function() {
    it('flushes pending changes', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['b'])]);
      recorder.handleCodeChange('b');
      recorder.commitAllEntities();
      expect(recorder['snapshots'].length).toBe(2);
    });

    it('does not create duplicate snapshots on repeated commit', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['b'])]);
      recorder.handleCodeChange('b');
      recorder.commitAllEntities();
      recorder.commitAllEntities();
      expect(recorder['snapshots'].length).toBe(2);
    });
  });

  describe('pause / resume', function() {
    it('pause sets paused=true', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.pauseRecording();
      expect(recorder.paused).toBe(true);
    });

    it('resume clears paused flag', function() {
      recorder.startRecording('p1', 120, 'a');
      recorder.pauseRecording();
      recorder.resumeRecording();
      expect(recorder.paused).toBe(false);
    });
  });

  describe('diff-based snapshots', function() {
    it('first snapshot stores full code', function() {
      recorder.startRecording('p1', 120, 'a\nb\nc');
      const snaps = recorder.getSnapshots();
      expect(snaps.length).toBeGreaterThanOrEqual(1);
      const first = snaps.find(s => s.entityId === 'e0');
      expect(first).toBeDefined();
      if (first) {
        expect(first.baseSnapshotId).toBeUndefined();
        expect(first.code).toBe('a\nb\nc');
      }
    });

    it('subsequent localized edit stores a compact splice patch', function() {
      const base = Array.from({ length: 50 }, function(_, i) { return 'line' + i + '.s("bd").gain(0.5)'; }).join('\n');
      recorder.startRecording('p1', 120, base);

      const modified = base.replace('line25.s("bd").gain(0.5)', 'line25.s("bd").gain(0.9)');
      vi.mocked(parseEntities).mockReturnValue([{ id: 'e0', codeLines: modified.split('\n'), name: 'test', category: 'melodic' as const, startIndex: 0, endIndex: 49 }]);
      recorder.handleCodeChange(modified);
      vi.advanceTimersByTime(3100);

      const snaps = recorder.getSnapshots();
      const diffSnap = snaps.find(function(s) { return !!s.baseSnapshotId; });
      expect(diffSnap).toBeDefined();
      const ops = JSON.parse(diffSnap!.code);
      expect(isSplicePatch(ops)).toBe(true);
      expect(diffSnap!.code.length).toBeLessThan(modified.length * 0.6);

      const baseSnap = snaps.find(function(s) { return s.id === diffSnap!.baseSnapshotId; });
      expect(baseSnap).toBeDefined();
      expect(applyPatch(baseSnap!.code, ops)).toBe(modified);
    });

    it('lineDiff produces correct ops even when not stored compactly', function() {
      const longCode = Array.from({ length: 10 }, function(_, i) { return 'line' + i; }).join('\n');
      const modifiedCode = Array.from({ length: 9 }, function(_, i) { return 'line' + i; }).concat(['changed']).join('\n');
      const ops = lineDiff(longCode, modifiedCode);
      const reconstructed = applyDiff(longCode, ops);
      expect(reconstructed).toBe(modifiedCode);
    });

    it('stores full code when diff would be larger', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([{ id: 'e0', codeLines: ['completely different code'], name: 'test', category: 'melodic' as const, startIndex: 0, endIndex: 0 }]);
      recorder.handleCodeChange('completely different code');
      vi.advanceTimersByTime(3100);
      const snaps = recorder.getSnapshots();
      const lastSnap = snaps[snaps.length - 1];
      expect(lastSnap.baseSnapshotId).toBeUndefined();
      expect(lastSnap.code).toBe('completely different code');
    });
  });

  describe('edge cases', function() {
    it('start with empty string does not crash', function() {
      expect(function() { recorder.startRecording('p1', 120, ''); }).not.toThrow();
    });

    it('start with null AudioContext does not crash', function() {
      mockGetStrudelAudioContext.mockReturnValue(null);
      expect(function() { recorder.startRecording('p1', 120, 'a'); }).not.toThrow();
    });

    it('reset clears all state', function() {
      recorder.startRecording('p1', 120, 'a\n\nb');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['c'])]);
      recorder.handleCodeChange('c');
      recorder.reset();
      expect(recorder.recording).toBe(false);
      expect(recorder['snapshots'].length).toBe(0);
      expect(recorder['entities'].size).toBe(0);
    });

    it('multiple consecutive resets are safe', function() {
      recorder.reset();
      recorder.reset();
      expect(recorder.recording).toBe(false);
    });
  });

  describe('getSnapshots', function() {
    it('returns snapshots sorted by timestamp', function() {
      recorder.startRecording('p1', 120, 'a');
      vi.mocked(parseEntities).mockReturnValue([makeEntity('e0', ['b'])]);
      recorder.handleCodeChange('b');
      recorder.handleAction('b', 'play');
      const snaps = recorder.getSnapshots();
      for (let i = 1; i < snaps.length; i++) {
        expect(snaps[i].timestamp).toBeGreaterThanOrEqual(snaps[i - 1].timestamp);
      }
    });
  });
});
