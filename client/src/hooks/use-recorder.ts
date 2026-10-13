import { useState, useCallback, useRef } from 'react';
import { globalRecorder } from '@/lib/recorder';
import { webmToWav } from '@/lib/wav-encoder';
import { buildTracksFromSnapshots } from '@/lib/timeline-parser';
import type { ParsedTrack, CodeSnapshot } from '@shared/schema';

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const currentDuration = useRef(0);
  const timelineEngineRef = useRef<import('@/lib/timeline-engine').TimelineEngine | null>(null);

  const startRecording = useCallback((projectId: string, bpm: number, code: string) => {
    globalRecorder.startRecording(projectId, bpm, code);
    setRecording(true);
    setPaused(false);
  }, []);

  const stopRecording = useCallback(async (): Promise<{
    audioBlob: Blob;
    wavBlob: Blob;
    duration: number;
    finalCode: string;
    snapshots: Omit<CodeSnapshot, 'sessionId'>[];
    tracks: ParsedTrack[];
  } | null> => {
    if (!recording) return null;
    const result = globalRecorder.stopRecording();
    setRecording(false);
    setPaused(false);
    currentDuration.current = result.duration;

    const snapshots = globalRecorder.getSnapshots();

    const tracks = buildTracksFromSnapshots(
      snapshots.map(s => ({
        timestamp: s.timestamp,
        code: s.code,
        entityId: s.entityId,
      }))
    );

    let wavBlob: Blob;
    try {
      wavBlob = await webmToWav(result.audioBlob);
    } catch {
      wavBlob = result.audioBlob;
    }

    return {
      audioBlob: result.audioBlob,
      wavBlob,
      duration: result.duration,
      finalCode: result.finalCode,
      snapshots,
      tracks,
    };
  }, [recording]);

  const togglePause = useCallback(() => {
    if (paused) {
      globalRecorder.resumeRecording();
      setPaused(false);
    } else {
      globalRecorder.pauseRecording();
      setPaused(true);
    }
  }, [paused]);

  const lastRecordTimeRef = useRef(0);
  const recordCodeChange = useCallback((code: string) => {
    if (recording && !paused) {
      const now = Date.now();
      if (now - lastRecordTimeRef.current >= 200) {
        lastRecordTimeRef.current = now;
        globalRecorder.handleCodeChange(code);
      }
    }
  }, [recording, paused]);

  const recordAction = useCallback((code: string, actionType: 'evaluate' | 'play' | 'stop' | 'bpm_change') => {
    if (recording && !paused) {
      globalRecorder.handleAction(code, actionType);
    }
  }, [recording, paused]);

  const setTimelineEngine = useCallback((engine: import('@/lib/timeline-engine').TimelineEngine) => {
    timelineEngineRef.current = engine;
    globalRecorder.attachTimelineEngine(engine);
  }, []);

  return {
    recording,
    paused,
    startRecording,
    stopRecording,
    togglePause,
    recordCodeChange,
    recordAction,
    setTimelineEngine,
  };
}
