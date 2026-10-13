import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProject } from "@/lib/stores/project-store";
import { getSession, getSessionSnapshots } from "@/lib/stores/session-store";
import { resolveSnapshotCodes, type ResolvableSnapshot } from "@/lib/timeline-parser";
import { TimelineEngine } from "@/lib/timeline-engine";
import { useCodeSessionPlayer } from "@/hooks/use-code-session-player";
import MonacoEditor from "@/components/editor/monaco-editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward, ArrowLeft, Download, Upload, Music, FileCode } from "lucide-react";
import {
  isCodeSession,
  exportSongAsFile,
  exportLiveSessionAsFile,
  importSongFromFile,
  importLiveSessionFromFile,
} from "@/lib/session-exporter";
import type { Project, RecordingSession, CodeSnapshot } from "@shared/schema";

type PlayMode = "code" | "audio";

export default function Playback() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [rawSnapshots, setRawSnapshots] = useState<CodeSnapshot[]>([]);
  const [resolvedSnapshots, setResolvedSnapshots] = useState<(ResolvableSnapshot & { code: string })[]>([]);
  const [mode, setMode] = useState<PlayMode>("code");
  const [currentCode, setCurrentCode] = useState("// loading...");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [looping, setLooping] = useState(false);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const engineRef = useRef<TimelineEngine | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const {
    state: codeState,
    currentTime: codeTime,
    currentCode: codePlayerCode,
    loadSession,
    play: codePlay,
    pause: codePause,
    stop: codeStop,
    seek: codeSeek,
    setLoop: setCodeLoop,
  } = useCodeSessionPlayer();

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const sess = await getSession(id);
        if (!sess) return;
        setSession(sess);

        const snaps = await getSessionSnapshots(id);
        setRawSnapshots(snaps);
        const resolved = resolveSnapshotCodes(snaps);
        setResolvedSnapshots(resolved);

        if (resolved.length > 0) {
          setCurrentCode(resolved[0].code);
        }

        setMode(resolved.length > 0 ? "code" : "audio");

        if (sess.projectId) {
          const proj = await getProject(sess.projectId);
          if (proj) setProject(proj);
        }

        const engine = new TimelineEngine({ bpm: sess.bpm, timeSignature: [4, 4] });
        engine.snapshots = resolved.map(s => ({ timestamp: s.timestamp, code: s.code, entityId: s.entityId }));
        engine.duration = sess.duration;
        engine.mode = "playing";
        engineRef.current = engine;
      } catch (err) {
        console.error(err);
      }
    })();
  }, [id]);

  // (Re)load the re-enactment player whenever we have resolved snapshots.
  useEffect(() => {
    if (!session || resolvedSnapshots.length === 0) return;
    const duration = session.duration || (resolvedSnapshots[resolvedSnapshots.length - 1].timestamp + 1000);
    loadSession(
      resolvedSnapshots.map(s => ({
        timestamp: s.timestamp,
        code: s.code,
        id: s.id,
        actionType: s.actionType,
      })),
      duration,
      session.bpm,
    );
  }, [session, resolvedSnapshots, loadSession]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const updateTimeline = useCallback(() => {
    if (!audioRef.current || !resolvedSnapshots.length) return;

    const audioEl = audioRef.current;
    const time = Math.round(audioEl.currentTime * 1000);
    setCurrentTime(time);

    const engine = engineRef.current;
    if (engine) {
      engine.currentTime = time;
      setCurrentCode(engine.getCodeAt(time));
    }

    if (!audioEl.paused) {
      animFrameRef.current = requestAnimationFrame(updateTimeline);
    }
  }, [resolvedSnapshots]);

  const codeMode = mode === "code";
  const isPlaying = codeMode ? codeState === "playing" : playing;
  const displayTime = codeMode ? codeTime : currentTime;
  const displayCode = codeMode ? codePlayerCode || currentCode : currentCode;
  const duration = session?.duration || (resolvedSnapshots.length ? resolvedSnapshots[resolvedSnapshots.length - 1].timestamp + 1000 : 0);

  const handlePlay = () => {
    if (codeMode) {
      codePlay();
      return;
    }
    if (!audioRef.current || !session) return;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const audioUrl = URL.createObjectURL(session.audioBlob);
    blobUrlRef.current = audioUrl;
    audioRef.current.src = audioUrl;
    audioRef.current.playbackRate = playbackSpeed;
    audioRef.current.play();
    setPlaying(true);
    updateTimeline();
  };

  const handlePause = () => {
    if (codeMode) {
      codePause();
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  const handleStop = () => {
    if (codeMode) {
      codeStop();
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
    setCurrentTime(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  const handleSeek = (ms: number) => {
    const clamped = Math.max(0, Math.min(duration, ms));
    if (codeMode) {
      codeSeek(clamped);
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = clamped / 1000;
      setCurrentTime(clamped);
      const engine = engineRef.current;
      if (engine) {
        engine.currentTime = clamped;
        setCurrentCode(engine.getCodeAt(clamped));
      }
    }
  };

  const handleToggleLoop = () => {
    const next = !looping;
    setLooping(next);
    if (codeMode) {
      setCodeLoop(next);
    } else if (audioRef.current) {
      audioRef.current.loop = next;
    }
    if (engineRef.current) {
      engineRef.current.loopRegion = next ? { start: 0, end: duration } : null;
    }
  };

  const handleExportSong = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await exportSongAsFile(session, rawSnapshots);
    } finally {
      setBusy(false);
    }
  };

  const handleExportLive = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await exportLiveSessionAsFile(session, rawSnapshots);
    } finally {
      setBusy(false);
    }
  };

  const handleImportSong = async () => {
    try {
      const imported = await importSongFromFile();
      sessionStorage.setItem("strudel_select_project", imported.id);
      navigate("/");
    } catch (err: any) {
      if (!/cancel/i.test(String(err?.message))) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleImportLive = async () => {
    try {
      const imported = await importLiveSessionFromFile();
      navigate(`/playback/${imported.id}`);
    } catch (err: any) {
      if (!/cancel/i.test(String(err?.message))) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-strudel-dark">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Session not found</h1>
          <p className="text-sm text-muted-foreground mb-4">Open a shared song or live set file to play it.</p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Button onClick={handleImportLive} className="text-xs">
              <Upload size={14} className="mr-1" /> IMPORT LIVE SET
            </Button>
            <Button onClick={handleImportSong} variant="outline" className="text-xs">
              <FileCode size={14} className="mr-1" /> IMPORT SONG
            </Button>
          </div>
          <a href="/" className="text-strudel-primary hover:underline">Back to Studio</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-strudel-dark text-white font-mono">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-strudel-surface-light bg-strudel-surface">
        <a href="/" className="text-muted-foreground hover:text-white">
          <ArrowLeft size={20} />
        </a>
        <h2 className="text-sm font-bold text-strudel-accent">{session.name}</h2>
        {project && <span className="text-xs text-muted-foreground">{project.name}</span>}
        <span className="text-xs text-muted-foreground ml-auto">{session.bpm} BPM</span>
        {!isCodeSession(session) && (
          <div className="flex items-center gap-1 border-l border-strudel-surface-light pl-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode("code")}
              className={`text-xs h-6 px-2 ${codeMode ? "bg-strudel-primary text-white" : "text-muted-foreground hover:text-white"}`}
            >
              <FileCode size={12} className="mr-1" /> CODE
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode("audio")}
              className={`text-xs h-6 px-2 ${!codeMode ? "bg-strudel-primary text-white" : "text-muted-foreground hover:text-white"}`}
            >
              <Music size={12} className="mr-1" /> AUDIO
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <MonacoEditor code={displayCode} onChange={() => {}} readOnly={true} />
      </div>

      <div className="border-t border-strudel-surface-light bg-strudel-surface px-4 py-3" data-testid="playback-transport">
        <div className="flex items-center gap-4 mb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSeek(displayTime - 5000)}
            className="text-white hover:bg-strudel-surface-light h-8 w-8"
          >
            <SkipBack size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={isPlaying ? handlePause : handlePlay}
            className="text-strudel-accent hover:bg-strudel-surface-light h-10 w-10"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStop}
            className="text-white hover:bg-strudel-surface-light h-8 w-8"
          >
            <span className="block w-3 h-3 bg-current" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSeek(displayTime + 5000)}
            className="text-white hover:bg-strudel-surface-light h-8 w-8"
          >
            <SkipForward size={16} />
          </Button>

          <span className="text-xs text-muted-foreground font-mono">
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1 mx-4">
            <Slider
              value={[displayTime]}
              min={0}
              max={duration || 1}
              step={100}
              onValueChange={([v]) => handleSeek(v)}
              className="cursor-pointer"
            />
          </div>

          {!codeMode && (
            <div className="flex items-center gap-2">
              {[0.5, 1, 2].map(speed => (
                <Button
                  key={speed}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPlaybackSpeed(speed);
                    if (audioRef.current) audioRef.current.playbackRate = speed;
                  }}
                  className={`text-xs h-7 px-2 ${
                    playbackSpeed === speed
                      ? "bg-strudel-primary text-white"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleLoop}
            className={`text-xs h-7 px-2 ${looping ? "bg-strudel-accent text-white" : "text-muted-foreground hover:text-white"}`}
          >
            {looping ? "LOOP ON" : "LOOP OFF"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportSong}
            disabled={busy}
            data-testid="export-song"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-white"
          >
            <FileCode size={12} className="mr-1" /> EXPORT SONG
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportLive}
            disabled={busy}
            data-testid="export-live"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-white"
          >
            <Download size={12} className="mr-1" /> EXPORT LIVE SET
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImportLive}
            data-testid="import-live"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-white"
          >
            <Upload size={12} className="mr-1" /> IMPORT
          </Button>
        </div>
      </div>

      {!codeMode && (
        <audio
          ref={audioRef}
          loop={looping}
          onEnded={() => {
            if (!looping) {
              setPlaying(false);
              if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(Math.round(audioRef.current.currentTime * 1000));
          }}
          className="hidden"
        />
      )}
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
