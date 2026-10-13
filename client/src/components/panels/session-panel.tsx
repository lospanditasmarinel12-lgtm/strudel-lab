import { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, RotateCcw, Download, Upload, Music, FileCode } from "lucide-react";
import { getAllSessions, getSessionSnapshots } from "@/lib/stores/session-store";
import { useCodeSessionPlayer } from "@/hooks/use-code-session-player";
import SessionTimelinePanel from "@/components/timeline/session-timeline-panel";
import { resolveSnapshotCodes } from "@/lib/timeline-parser";
import {
  exportSongAsFile,
  exportLiveSessionAsFile,
  importSongFromFile,
  importLiveSessionFromFile,
} from "@/lib/session-exporter";
import type { RecordingSession, CodeSnapshot } from "@shared/schema";

interface SessionPanelProps {
  recording?: boolean;
  recordingTime?: number;
  currentSessionSnapshots?: { timestamp: number; code: string; entityId: string }[];
  currentSessionDuration?: number;
  currentSessionBpm?: number;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default memo(function SessionPanel({
  recording,
  recordingTime,
  currentSessionSnapshots,
  currentSessionDuration,
  currentSessionBpm,
}: SessionPanelProps) {
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [loadedSession, setLoadedSession] = useState<RecordingSession | null>(null);
  const [loadedSnapshots, setLoadedSnapshots] = useState<CodeSnapshot[]>([]);
  const [resolvedSnapshots, setResolvedSnapshots] = useState<CodeSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const {
    state, currentTime, currentCode,
    loadSession, play, pause, stop, seek, setLoop,
  } = useCodeSessionPlayer();

  const [looping, setLooping] = useState(false);

  const refreshSessions = useCallback(async () => {
    try {
      const all = await getAllSessions();
      setSessions(all);
    } catch (e) {
      console.warn('[SessionPanel] Failed to load sessions:', e);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleLoadSession = useCallback(async (session: RecordingSession) => {
    setLoading(true);
    try {
      const snaps = await getSessionSnapshots(session.id);
      const resolved = resolveSnapshotCodes(snaps);
      setLoadedSession(session);
      setLoadedSnapshots(snaps);
      setResolvedSnapshots(resolved);
      loadSession(
        resolved.map(s => ({
          timestamp: s.timestamp,
          code: s.code,
          id: s.id,
          actionType: s.actionType,
        })),
        session.duration || 30000,
        session.bpm || 120,
      );
    } catch (e: any) {
      console.error('[SessionPanel] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [loadSession]);

  const handleSeek = useCallback((ms: number) => {
    seek(ms);
  }, [seek]);

  const handleSnapshotSelect = useCallback((id: string) => {
    setSelectedSnapshotId(id);
  }, []);

  const handleExportSong = useCallback(async () => {
    if (!loadedSession) return;
    await exportSongAsFile(loadedSession, loadedSnapshots);
  }, [loadedSession, loadedSnapshots]);

  const handleExportLive = useCallback(async () => {
    if (!loadedSession) return;
    await exportLiveSessionAsFile(loadedSession, loadedSnapshots);
  }, [loadedSession, loadedSnapshots]);

  const handleImportSong = useCallback(async () => {
    try {
      const imported = await importSongFromFile();
      sessionStorage.setItem('strudel_select_project', imported.id);
      navigate('/');
    } catch (err: any) {
      if (!/cancel/i.test(String(err?.message))) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [navigate]);

  const handleImportLive = useCallback(async () => {
    try {
      const imported = await importLiveSessionFromFile();
      await refreshSessions();
      navigate(`/playback/${imported.id}`);
    } catch (err: any) {
      if (!/cancel/i.test(String(err?.message))) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [refreshSessions, navigate]);

  const duration = loadedSession?.duration || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Live recording indicator */}
      {recording && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-strudel-surface-light bg-red-950/30">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-red-400 font-bold">RECORDING</span>
          <span className="text-[10px] text-red-300 font-mono ml-auto">{formatTime(recordingTime || 0)}</span>
        </div>
      )}
      {/* Session list */}
      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground border-b border-strudel-surface-light">
        ● SAVED SESSIONS
      </div>
      <div className="border-b border-strudel-surface-light" style={{ height: 120 }}>
        <Virtuoso
          style={{ height: '100%' }}
          data={sessions}
          itemContent={(index, session) => (
            <div
              data-testid="session-row"
              data-session-id={session.id}
              className={`flex items-center gap-2 px-2 py-1.5 hover:bg-strudel-surface-light/50 group cursor-pointer text-xs ${
                loadedSession?.id === session.id ? 'bg-strudel-primary/20' : ''
              }`}
              onClick={() => handleLoadSession(session)}
            >
              <Music size={10} className="text-muted-foreground shrink-0" />
              <span className="flex-1 text-white truncate">{session.name}</span>
              <span className="text-[9px] text-muted-foreground">{formatTime(session.duration)}</span>
            </div>
          )}
          components={{
            EmptyPlaceholder: () => (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">
                {loading ? 'Loading...' : 'No saved sessions'}
              </div>
            ),
          }}
        />
      </div>

      {/* Player controls */}
      {loadedSession && (
        <div className="border-b border-strudel-surface-light px-2 py-1.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-strudel-accent truncate flex-1">
              {loadedSession.name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {state === 'playing' ? (
              <Button
                variant="ghost" size="sm"
                onClick={pause}
                className="h-6 w-6 p-0 text-white hover:bg-strudel-surface-light"
              >
                <Pause size={12} />
              </Button>
            ) : (
              <Button
                variant="ghost" size="sm"
                onClick={play}
                className="h-6 w-6 p-0 text-strudel-accent hover:bg-strudel-surface-light"
              >
                <Play size={12} />
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              onClick={stop}
              className="h-6 w-6 p-0 text-white hover:bg-strudel-surface-light"
            >
              <Square size={12} />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setLoop(!looping); setLooping(!looping); }}
              className={`h-6 w-6 p-0 ${looping ? 'text-strudel-accent' : 'text-white'} hover:bg-strudel-surface-light`}
            >
              <RotateCcw size={12} />
            </Button>
            <span className="text-[10px] text-muted-foreground font-mono ml-auto">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 min-h-[80px] border-b border-strudel-surface-light">
        <SessionTimelinePanel
          snapshots={resolvedSnapshots.map(s => ({
            timestamp: s.timestamp,
            code: s.code,
            id: s.id,
            actionType: s.actionType,
          }))}
          duration={duration || 30000}
          currentTime={currentTime}
          currentSnapshotId={selectedSnapshotId || undefined}
          editable={true}
          onSeek={handleSeek}
          onSnapshotSelect={handleSnapshotSelect}
        />
      </div>

      {/* Code preview */}
      <div className="h-[80px] overflow-hidden border-b border-strudel-surface-light">
        <div className="px-2 py-0.5 text-[9px] font-bold text-muted-foreground/60 uppercase">
          Code at {formatTime(currentTime)}
        </div>
        <ScrollArea className="h-full px-2 pb-2">
          <pre className="text-[10px] text-white font-mono whitespace-pre-wrap">
            {currentCode || '// empty'}
          </pre>
        </ScrollArea>
      </div>

      {/* Export/Import */}
      <div className="grid grid-cols-2 gap-1 p-1">
        <Button
          variant="ghost" size="sm"
          onClick={handleExportSong}
          disabled={!loadedSession}
          data-testid="export-song"
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
          title="Export the finished track as one runnable .strudel file"
        >
          <FileCode size={10} /> SONG
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={handleExportLive}
          disabled={!loadedSession}
          data-testid="export-live"
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
          title="Export the live coding performance as a re-enactable session"
        >
          <Download size={10} /> LIVE SET
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={handleImportSong}
          data-testid="import-song"
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
        >
          <Upload size={10} /> SONG
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={handleImportLive}
          data-testid="import-live"
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
        >
          <Upload size={10} /> LIVE SET
        </Button>
      </div>
    </div>
  );
});
