import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineEngine } from './timeline-engine';

function makeEngine(config?: any) {
  return new TimelineEngine(config || { bpm: 120, timeSignature: [4, 4] });
}

function makeTrack(id: string, name: string) {
  return { id: id, name: name, category: 'drums', color: '#ff0000', events: [] };
}

describe('TimelineEngine', function() {
  let engine: TimelineEngine;

  beforeEach(function() {
    engine = makeEngine();
  });

  describe('constructor', function() {
    it('sets bpm and timeSignature', function() {
      expect(engine.bpm).toBe(120);
      expect(engine.timeSignature).toEqual([4, 4]);
    });

    it('starts in idle mode', function() {
      expect(engine.mode).toBe('idle');
    });

    it('has zero duration', function() {
      expect(engine.duration).toBe(0);
    });
  });

  describe('addTrack', function() {
    it('adds a track', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      expect(engine.tracks.length).toBe(1);
    });

    it('does not add duplicate track with same id', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      engine.addTrack(makeTrack('t1', 'hh'));
      expect(engine.tracks.length).toBe(1);
    });
  });

  describe('addEvent', function() {
    it('adds event to existing track', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      const evt = engine.addEvent('t1', 0, 1000, 's("bd")');
      expect(evt.trackId).toBe('t1');
      expect(engine.tracks[0].events.length).toBe(1);
    });

    it('does not add event to non-existent track', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      const evt = engine.addEvent('nonexistent', 0, 1000, 's("bd")');
      expect(evt).toBeDefined();
      expect(engine.tracks[0].events.length).toBe(0);
    });
  });

  describe('removeEvent', function() {
    it('removes event from track', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      const evt = engine.addEvent('t1', 0, 1000, 's("bd")');
      engine.removeEvent(evt.id);
      expect(engine.tracks[0].events.length).toBe(0);
    });

    it('does nothing for non-existent event', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      engine.addEvent('t1', 0, 1000, 's("bd")');
      engine.removeEvent('nonexistent');
      expect(engine.tracks[0].events.length).toBe(1);
    });
  });

  describe('moveEvent', function() {
    it('moves event start and preserves duration', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      const evt = engine.addEvent('t1', 0, 1000, 's("bd")');
      engine.moveEvent(evt.id, 500);
      expect(evt.startMs).toBe(500);
      expect(evt.endMs).toBe(1500);
    });

    it('does nothing for non-existent event', function() {
      expect(function() {
        engine.moveEvent('nonexistent', 500);
      }).not.toThrow();
    });
  });

  describe('resizeEvent', function() {
    it('changes event end time', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      const evt = engine.addEvent('t1', 0, 1000, 's("bd")');
      engine.resizeEvent(evt.id, 2000);
      expect(evt.endMs).toBe(2000);
    });

    it('clamps end time to at least start+100ms', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      const evt = engine.addEvent('t1', 0, 1000, 's("bd")');
      engine.resizeEvent(evt.id, 20);
      expect(evt.endMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('tick', function() {
    it('advances currentTime when playing', function() {
      engine.mode = 'playing';
      engine.tick(100);
      expect(engine.currentTime).toBe(100);
    });

    it('does not advance when idle', function() {
      engine.mode = 'idle';
      engine.tick(100);
      expect(engine.currentTime).toBe(0);
    });

    it('does not advance when paused', function() {
      engine.mode = 'paused';
      engine.tick(100);
      expect(engine.currentTime).toBe(0);
    });

    it('ignores negative delta', function() {
      engine.mode = 'playing';
      engine.tick(-50);
      expect(engine.currentTime).toBe(0);
    });

    it('pauses when reaching duration', function() {
      engine.mode = 'playing';
      engine.duration = 200;
      engine.tick(300);
      expect(engine.mode).toBe('paused');
      expect(engine.currentTime).toBe(200);
    });

    it('loops when loopRegion is set and time exceeds end', function() {
      engine.mode = 'playing';
      engine.loopRegion = { start: 0, end: 100 };
      engine.tick(150);
      expect(engine.currentTime).toBe(0);
    });
  });

  describe('seekTo', function() {
    it('seeks to valid time', function() {
      engine.seekTo(500);
      expect(engine.currentTime).toBe(500);
    });

    it('clamps to 0', function() {
      engine.seekTo(-100);
      expect(engine.currentTime).toBe(0);
    });

    it('clamps to duration', function() {
      engine.duration = 1000;
      engine.seekTo(2000);
      expect(engine.currentTime).toBe(1000);
    });

    it('allows seeking when duration is 0 (unset)', function() {
      engine.seekTo(500);
      expect(engine.currentTime).toBe(500);
    });
  });

  describe('clear', function() {
    it('resets all state', function() {
      engine.addTrack(makeTrack('t1', 'bd'));
      engine.addEvent('t1', 0, 1000, 's("bd")');
      engine.mode = 'playing';
      engine.duration = 5000;
      engine.currentTime = 100;
      engine.clear();
      expect(engine.mode).toBe('idle');
      expect(engine.tracks.length).toBe(0);
      expect(engine.currentTime).toBe(0);
      expect(engine.duration).toBe(0);
      expect(engine.loopRegion).toBeNull();
    });
  });

  describe('getCodeAt', function() {
    it('returns empty for no snapshots', function() {
      expect(engine.getCodeAt(0)).toBe('// empty');
    });

    it('returns code at exact timestamp', function() {
      engine.snapshots = [
        { timestamp: 0, code: 'a', entityId: 'e1' },
        { timestamp: 1000, code: 'b', entityId: 'e1' },
      ];
      expect(engine.getCodeAt(0)).toBe('a');
    });

    it('returns most recent code before timestamp', function() {
      engine.snapshots = [
        { timestamp: 0, code: 'a', entityId: 'e1' },
        { timestamp: 1000, code: 'b', entityId: 'e1' },
      ];
      expect(engine.getCodeAt(500)).toBe('a');
    });
  });

  describe('onTick callback', function() {
    it('fires onTick with currentTime during tick', function() {
      const calls: number[] = [];
      engine.onTick = function(time: number) { calls.push(time); };
      engine.mode = 'playing';
      engine.tick(50);
      engine.tick(30);
      expect(calls).toEqual([50, 80]);
    });

    it('does not fire onTick when idle', function() {
      const calls: number[] = [];
      engine.onTick = function(time: number) { calls.push(time); };
      engine.tick(50);
      expect(calls).toEqual([]);
    });
  });

  describe('mode transitions', function() {
    it('can switch from idle to recording', function() {
      engine.mode = 'recording';
      expect(engine.mode).toBe('recording');
    });

    it('can switch from playing to paused', function() {
      engine.mode = 'playing';
      engine.mode = 'paused';
      expect(engine.mode).toBe('paused');
    });
  });
});
