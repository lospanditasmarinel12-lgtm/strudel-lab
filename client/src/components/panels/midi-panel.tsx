import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MidiDevice } from '@/lib/midi';

interface MidiPanelProps {
  devices: MidiDevice[];
  connected: boolean;
  deviceCount: number;
  lastMessage: string | null;
  noteMap: Record<number, string>;
  onUpdateNoteMap: (note: number, pattern: string) => void;
  onToggleDevice?: (deviceId: string, enabled: boolean) => void;
}

const NOTE_NAMES: Record<number, string> = {
  36: 'C2', 38: 'D2', 42: 'F#2', 46: 'A#2',
  39: 'E2', 37: 'C#2', 40: 'E2', 41: 'F2',
  43: 'G2', 45: 'A2', 47: 'B2', 48: 'C3',
  49: 'C#3', 51: 'D#3',
};

export default function MidiPanel({ devices, connected, deviceCount, lastMessage, noteMap, onUpdateNoteMap, onToggleDevice }: MidiPanelProps) {
  const [editNote, setEditNote] = useState<number | null>(null);
  const [editPattern, setEditPattern] = useState('');

  const startEdit = (note: number, current: string) => {
    setEditNote(note);
    setEditPattern(current);
  };

  const saveEdit = () => {
    if (editNote !== null) {
      onUpdateNoteMap(editNote, editPattern);
      setEditNote(null);
      setEditPattern('');
    }
  };

  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="px-2 py-1 border-b border-strudel-surface-light text-[10px] font-bold text-muted-foreground">
        MIDI {connected ? `● ${deviceCount}/${devices.length} enabled` : '○ Disconnected'}
      </div>

      {/* Device list */}
      <div className="border-b border-strudel-surface-light overflow-y-auto" style={{ maxHeight: 120 }}>
        {devices.length === 0 && (
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
            No MIDI devices found
          </div>
        )}
        {devices.map(d => (
          <label key={d.id} className="flex items-center gap-2 px-2 py-1 hover:bg-strudel-surface-light/30 cursor-pointer">
            <input
              type="checkbox"
              checked={d.enabled}
              onChange={(e) => onToggleDevice?.(d.id, e.target.checked)}
              className="accent-strudel-accent shrink-0"
              style={{ width: 12, height: 12 }}
            />
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="truncate text-white text-[10px]">{d.name}</span>
          </label>
        ))}
      </div>

      {/* Last message */}
      {lastMessage && (
        <div className="px-2 py-1 border-b border-strudel-surface-light text-[10px] font-mono text-strudel-accent truncate">
          {lastMessage}
        </div>
      )}

      {/* Note map */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        <div className="text-[9px] font-bold text-muted-foreground px-1 mb-1">NOTE MAPPING</div>
        {Object.entries(noteMap).length === 0 && (
          <div className="px-2 text-[10px] text-muted-foreground">No mappings</div>
        )}
        {Object.entries(noteMap).sort(([a], [b]) => Number(a) - Number(b)).map(([note, pattern]) => {
          const n = Number(note);
          const name = NOTE_NAMES[n] || `MIDI ${n}`;
          return (
            <div key={note} className="flex items-center gap-1 px-1 py-0.5">
              <span className="text-[10px] text-muted-foreground w-10 shrink-0">{name}</span>
              {editNote === n ? (
                <div className="flex flex-1 gap-1">
                  <Input
                    value={editPattern}
                    onChange={e => setEditPattern(e.target.value)}
                    className="h-5 text-[10px] bg-strudel-dark border-strudel-surface-light text-white flex-1"
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    autoFocus
                  />
                  <Button
                    variant="ghost" size="sm"
                    onClick={saveEdit}
                    className="h-5 text-[9px] text-strudel-accent px-1"
                  >
                    OK
                  </Button>
                </div>
              ) : (
                <span
                  className="flex-1 cursor-pointer hover:text-strudel-accent truncate"
                  onClick={() => startEdit(n, pattern)}
                  title="Click to edit"
                >
                  {pattern}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
