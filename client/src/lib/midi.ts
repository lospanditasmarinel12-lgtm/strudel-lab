import { evaluateStrudelCode } from './strudel-engine';

export interface MidiDevice {
  id: string;
  name: string;
  connected: boolean;
  enabled: boolean;
}

export type MidiMessageCallback = (deviceId: string, data: Uint8Array) => void;

type NoteCallback = (note: number, velocity: number, type: 'on' | 'off') => void;

let _midiAccess: MIDIAccess | null = null;
let _devices: MidiDevice[] = [];
const _messageCallbacks: Set<MidiMessageCallback> = new Set();
const _noteCallbacks: Set<NoteCallback> = new Set();
const _enabledDeviceIds = new Set<string>();

const NOTE_MAP: Record<number, string> = {
  36: 's("bd")',
  38: 's("sd")',
  42: 's("hh")',
  46: 's("oh")',
  39: 's("clap")',
  37: 's("cp")',
  40: 's("rim")',
  41: 's("tom")',
  43: 's("tom").n(1)',
  45: 's("tom").n(2)',
  47: 's("tom").n(3)',
  48: 's("hh")',
  49: 's("crash")',
  51: 's("ride")',
};

export async function initMidi(): Promise<void> {
  if (_midiAccess) return;
  if (!navigator.requestMIDIAccess) {
    console.warn('[MIDI] Web MIDI API not available');
    return;
  }
  try {
    _midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    _midiAccess.onstatechange = handleStateChange as (this: MIDIAccess, ev: Event) => any;
    updateDeviceList();
    console.log('[MIDI] initialized');
  } catch (e) {
    console.warn('[MIDI] failed to initialize:', e);
  }
}

function handleStateChange(e: MIDIConnectionEvent) {
  updateDeviceList();
}

function updateDeviceList() {
  if (!_midiAccess) return;
  const seen = new Set<string>();
  _devices = [];
  for (const input of _midiAccess.inputs.values()) {
    seen.add(input.id);
    if (!_enabledDeviceIds.has(input.id)) {
      _enabledDeviceIds.add(input.id);
    }
    _devices.push({
      id: input.id,
      name: input.name || 'Unknown MIDI Device',
      connected: input.state === 'connected',
      enabled: _enabledDeviceIds.has(input.id),
    });
    input.onmidimessage = handleMidiMessage;
  }
  // Remove stale entries for disconnected devices
  for (const id of _enabledDeviceIds) {
    if (!seen.has(id)) _enabledDeviceIds.delete(id);
  }
}

function handleMidiMessage(e: MIDIMessageEvent) {
  if (!e.data || e.data.length < 3) return;
  const deviceId = (e.target as MIDIInput).id;
  if (!_enabledDeviceIds.has(deviceId)) return;
  const [status, note, velocity] = e.data;
  const msgType = status & 0xf0;

  // Notify all message callbacks
  for (const cb of _messageCallbacks) {
    cb(deviceId, e.data);
  }

  // Notify note callbacks for note on/off
  if (msgType === 0x90 && velocity > 0) {
    for (const cb of _noteCallbacks) cb(note, velocity, 'on');
  } else if (msgType === 0x80 || (msgType === 0x90 && velocity === 0)) {
    for (const cb of _noteCallbacks) cb(note, velocity, 'off');
  }
}

export function getDevices(): MidiDevice[] {
  return _devices;
}

export function isDeviceEnabled(id: string): boolean {
  return _enabledDeviceIds.has(id);
}

export function setDeviceEnabled(id: string, enabled: boolean): void {
  if (enabled) {
    _enabledDeviceIds.add(id);
  } else {
    _enabledDeviceIds.delete(id);
  }
  // Update the devices list so UI reflects the change
  for (const d of _devices) {
    if (d.id === id) d.enabled = enabled;
  }
}

export function onMidiMessage(cb: MidiMessageCallback): () => void {
  _messageCallbacks.add(cb);
  return () => _messageCallbacks.delete(cb);
}

export function onMidiNote(cb: NoteCallback): () => void {
  _noteCallbacks.add(cb);
  return () => _noteCallbacks.delete(cb);
}

export function getMidiNoteMap(): Record<number, string> {
  return { ...NOTE_MAP };
}

export function setMidiNoteMap(note: number, pattern: string): void {
  if (pattern) {
    NOTE_MAP[note] = pattern;
  } else {
    delete NOTE_MAP[note];
  }
}

export function triggerNote(note: number, velocity: number): void {
  const pattern = NOTE_MAP[note];
  if (pattern) {
    evaluateStrudelCode(pattern).catch(() => {});
  }
}
