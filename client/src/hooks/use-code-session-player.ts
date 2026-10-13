import { useState, useEffect, useCallback, useRef } from 'react';
import { CodeSessionPlayer, type CodePlayerState, type CodeSnapshotEntry } from '@/lib/code-session-player';

export function useCodeSessionPlayer() {
  const [state, setState] = useState<CodePlayerState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [currentCode, setCurrentCode] = useState('');
  const playerRef = useRef<CodeSessionPlayer | null>(null);

  const loadSession = useCallback((snapshots: CodeSnapshotEntry[], duration: number, bpm: number) => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.destroy();
    }
    const player = new CodeSessionPlayer(snapshots, duration, bpm);
    player.onTimeUpdate = (time) => setCurrentTime(time);
    player.onCodeUpdate = (code) => setCurrentCode(code);
    player.onStateChange = (s) => setState(s);
    player.onError = (err) => console.warn('[CodePlayer]', err);
    playerRef.current = player;
    if (snapshots.length > 0) {
      setCurrentCode(snapshots[0].code);
    }
  }, []);

  const play = useCallback(() => playerRef.current?.play(), []);
  const pause = useCallback(() => playerRef.current?.pause(), []);
  const stop = useCallback(() => playerRef.current?.stop(), []);
  const seek = useCallback((ms: number) => playerRef.current?.seek(ms), []);
  const setLoop = useCallback((loop: boolean) => {
    if (playerRef.current) playerRef.current.loop = loop;
  }, []);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.destroy();
      }
    };
  }, []);

  return { state, currentTime, currentCode, loadSession, play, pause, stop, seek, setLoop };
}
