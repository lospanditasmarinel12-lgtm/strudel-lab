import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initStrudelEngine,
  evaluateStrudelCode,
  stopStrudel,
  setMasterVolume,
  isPlaying,
  getLatency,
} from '@/lib/strudel-engine';

export function useStrudel() {
  const [initialized, setInitialized] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [latency, setLatency] = useState(0);
  const [masterVolume, setMasterVolumeLocal] = useState(0.7);
  const [initError, setInitError] = useState<string | null>(null);
  const initAttempted = useRef(false);

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    // console.log('[Strudel] starting init...');
    initStrudelEngine()
      .then(() => {
        // console.log('[Strudel] init complete');
        setInitialized(true);
      })
      .catch((err: any) => {
        // console.log('[Strudel] init FAILED:', err.message || err);
        setInitError(err.message || String(err));
      });
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const interval = setInterval(() => {
      setLatency(getLatency());
      setPlaying(isPlaying());
    }, 1000);
    return () => clearInterval(interval);
  }, [initialized]);

  const evaluate = useCallback(async (code: string, onProgress?: (msg: string) => void) => {
    await evaluateStrudelCode(code, onProgress);
    setPlaying(true);
  }, []);

  const stop = useCallback(() => {
    stopStrudel();
    setPlaying(false);
  }, []);

  const setVolume = useCallback((vol: number) => {
    setMasterVolume(vol);
    setMasterVolumeLocal(vol);
  }, []);

  return {
    initialized,
    playing,
    latency,
    masterVolume,
    initError,
    evaluate,
    stop,
    setVolume,
  };
}
