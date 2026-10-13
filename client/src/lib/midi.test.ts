import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock navigator.requestMIDIAccess — defined before any imports
const mockInputs = new Map<string, any>();
const mockMidiAccess = {
  inputs: mockInputs,
  onstatechange: null as any,
};

vi.stubGlobal('navigator', {
  ...navigator,
  requestMIDIAccess: vi.fn(() => Promise.resolve(mockMidiAccess)),
});

// Must reset modules to get fresh internal state (_midiAccess, _devices, etc.)
beforeEach(() => {
  vi.clearAllMocks();
  mockInputs.clear();
  vi.resetModules();
});

describe('MIDI manager', () => {
  async function loadMidi() {
    return import('./midi');
  }

  describe('initMidi', () => {
    it('initializes when Web MIDI API is available', async () => {
      const midi = await loadMidi();
      await midi.initMidi();
      expect(navigator.requestMIDIAccess).toHaveBeenCalled();
    });

    it('is safe to call twice', async () => {
      const midi = await loadMidi();
      await midi.initMidi();
      await expect(midi.initMidi()).resolves.toBeUndefined();
      expect(navigator.requestMIDIAccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDevices', () => {
    it('returns empty array when no devices', async () => {
      const midi = await loadMidi();
      await midi.initMidi();
      expect(midi.getDevices()).toEqual([]);
    });

    it('returns connected devices', async () => {
      mockInputs.set('dev1', { id: 'dev1', name: 'Test Keyboard', state: 'connected' });
      const midi = await loadMidi();
      await midi.initMidi();
      const devices = midi.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].name).toBe('Test Keyboard');
    });
  });

  describe('onMidiMessage', () => {
    it('registers and unregisters callbacks', async () => {
      const midi = await loadMidi();
      await midi.initMidi();
      const cb = vi.fn();
      const unsub = midi.onMidiMessage(cb);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('onMidiNote', () => {
    it('registers and unregisters callbacks', async () => {
      const midi = await loadMidi();
      await midi.initMidi();
      const cb = vi.fn();
      const unsub = midi.onMidiNote(cb);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('note mapping', () => {
    it('has default mappings for drum notes', async () => {
      const midi = await loadMidi();
      const map = midi.getMidiNoteMap();
      expect(map[36]).toBe('s("bd")');
      expect(map[38]).toBe('s("sd")');
    });

    it('supports updating mappings', async () => {
      const midi = await loadMidi();
      midi.setMidiNoteMap(60, 's("piano")');
      const map = midi.getMidiNoteMap();
      expect(map[60]).toBe('s("piano")');
    });

    it('supports removing mappings', async () => {
      const midi = await loadMidi();
      midi.setMidiNoteMap(36, '');
      const map = midi.getMidiNoteMap();
      expect(map[36]).toBeUndefined();
    });
  });

  describe('triggerNote', () => {
    it('calls evaluateStrudelCode for mapped notes', async () => {
      const mod = await import('./strudel-engine');
      const spy = vi.spyOn(mod, 'evaluateStrudelCode').mockResolvedValue();
      const midi = await loadMidi();
      midi.triggerNote(36, 100);
      expect(spy).toHaveBeenCalledWith('s("bd")');
    });

    it('does nothing for unmapped notes', async () => {
      const mod = await import('./strudel-engine');
      const spy = vi.spyOn(mod, 'evaluateStrudelCode').mockResolvedValue();
      const midi = await loadMidi();
      midi.triggerNote(99, 100);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not throw for invalid note', async () => {
      const midi = await loadMidi();
      expect(() => midi.triggerNote(-1, 100)).not.toThrow();
    });
  });
});
