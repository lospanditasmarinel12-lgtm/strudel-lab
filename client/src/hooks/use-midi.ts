import { useState, useEffect, useCallback } from 'react';
import { initMidi, getDevices, onMidiMessage, onMidiNote, triggerNote, getMidiNoteMap, setMidiNoteMap, setDeviceEnabled, type MidiDevice } from '@/lib/midi';

export function useMidi() {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<number, string>>(getMidiNoteMap());

  useEffect(() => {
    initMidi().then(() => {
      setDevices(getDevices());
      // Poll for device changes
      const id = setInterval(() => setDevices(getDevices()), 2000);
      return () => clearInterval(id);
    });
  }, []);

  useEffect(() => {
    const unsubMsg = onMidiMessage((deviceId, data) => {
      const [status, note, velocity] = data;
      const type = (status & 0xf0) === 0x90 && velocity > 0 ? 'noteOn' : 'noteOff';
      setLastMessage(`[${deviceId.slice(0, 4)}] ${type}: note=${note} vel=${velocity}`);
    });
    const unsubNote = onMidiNote((note, velocity, type) => {
      if (type === 'on') {
        triggerNote(note, velocity);
      }
    });
    return () => {
      unsubMsg();
      unsubNote();
    };
  }, []);

  const updateNoteMap = useCallback((note: number, pattern: string) => {
    setMidiNoteMap(note, pattern);
    setNoteMap(getMidiNoteMap());
  }, []);

  const toggleDevice = useCallback((deviceId: string, enabled: boolean) => {
    setDeviceEnabled(deviceId, enabled);
    setDevices(getDevices());
  }, []);

  return {
    devices,
    connected: devices.some(d => d.enabled),
    deviceCount: devices.filter(d => d.enabled).length,
    lastMessage,
    noteMap,
    updateNoteMap,
    toggleDevice,
  };
}
