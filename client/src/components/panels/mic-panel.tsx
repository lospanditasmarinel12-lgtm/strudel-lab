import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Mic, MicOff, Snowflake } from 'lucide-react';
import { globalMicCapture } from '@/lib/mic-capture-engine';

interface MicPanelProps {
  onMicSampleCreated?: (name: string) => void;
}

export default function MicPanel({ onMicSampleCreated }: MicPanelProps) {
  const [micActive, setMicActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [inputGain, setInputGain] = useState(100);
  const [bufferSize, setBufferSize] = useState(2);
  const [freezeName, setFreezeName] = useState('mic_capture');
  const [freezing, setFreezing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    globalMicCapture.getDevices().then(setDevices);
    return () => {
      globalMicCapture.stop();
    };
  }, []);

  const handleToggleMic = useCallback(async () => {
    if (micActive) {
      globalMicCapture.stop();
      setMicActive(false);
      return;
    }

    setError('');
    try {
      await globalMicCapture.start({
        bufferDuration: bufferSize,
        chunkDuration: 0.5,
      });
      setMicActive(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [micActive, bufferSize]);

  const handleFreeze = useCallback(async () => {
    if (!micActive) return;
    setFreezing(true);
    setError('');
    try {
      const name = freezeName.trim() || 'mic_capture';
      await globalMicCapture.freezeAsSample(name, 2);
      onMicSampleCreated?.(name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFreezing(false);
    }
  }, [micActive, freezeName, onMicSampleCreated]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <h3 className="text-sm font-bold text-strudel-accent">MICROPHONE INPUT</h3>

      <Button
        onClick={handleToggleMic}
        className={`w-full h-8 text-xs ${micActive ? 'bg-red-500 hover:bg-red-600' : 'bg-strudel-primary hover:bg-strudel-secondary'}`}
      >
        {micActive ? <MicOff size={14} className="mr-1" /> : <Mic size={14} className="mr-1" />}
        {micActive ? 'STOP MIC' : 'START MIC'}
      </Button>

      {micActive && (
        <>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Buffer Size: {bufferSize}s</label>
            <Slider
              value={[bufferSize]}
              min={0.5}
              max={10}
              step={0.5}
              onValueChange={([v]) => setBufferSize(v)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Freeze Sample Name</label>
            <input
              value={freezeName}
              onChange={e => setFreezeName(e.target.value)}
              className="w-full bg-strudel-dark border border-strudel-surface-light text-white rounded px-2 py-1 text-xs"
              placeholder="mic_capture"
            />
          </div>

          <Button
            onClick={handleFreeze}
            disabled={freezing}
            className="w-full h-7 text-xs bg-yellow-600 hover:bg-yellow-700"
          >
            <Snowflake size={12} className="mr-1" />
            {freezing ? 'FREEZING...' : 'FREEZE AS SAMPLE'}
          </Button>
        </>
      )}

      {error && <p className="text-red-400 text-[10px]">{error}</p>}
    </div>
  );
}
