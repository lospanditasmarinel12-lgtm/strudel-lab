import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAllProjects, createProject, updateProject } from "@/lib/stores/project-store";
import { createSession } from "@/lib/stores/session-store";
import { useStrudel } from "@/hooks/use-strudel";
import { useRecorder } from "@/hooks/use-recorder";
import { useAutoSave } from "@/hooks/use-auto-save";
import { globalRecorder } from "@/lib/recorder";
import { installTestHooks } from "@/lib/test-hooks";
import { detectInstruments, extractModifiers } from "@/lib/timeline-parser";
import { ensureBankLoaded } from "@/lib/sample-registry";
import { checkBalancedSyntax } from "@/lib/strudel-syntax";
import { getFps } from "@/lib/strudel-engine";
import MonacoEditor, { type MonacoEditorRef } from "@/components/editor/monaco-editor";
import Sidebar from "@/components/sidebar/sidebar";
import SamplesPanel from "@/components/panels/samples-panel";
import ConsolePanel from "@/components/panels/console-panel";
import MicPanel from "@/components/panels/mic-panel";
import SessionPanel from "@/components/panels/session-panel";
import MidiPanel from "@/components/panels/midi-panel";
import { useMidi } from "@/hooks/use-midi";
import TopBar from "@/components/layout/top-bar";
import TimelinePanel from "@/components/timeline/timeline-panel";
import TrackControls from "@/components/timeline/track-controls";
import BlockLayer from "@/components/blocks/block-layer";
import BlockPalette from "@/components/blocks/block-palette";
import StructureCanvas from "@/components/visual/structure-canvas";
import { parse as parseStructure, serialize as serializeStructure } from "@/lib/visual/codec";
import type { StructureModel } from "@/lib/visual/visual-model";
import ErrorBoundary from "@/components/error-boundary";
import type { MonacoEditorInstance } from "@/components/editor/monaco-editor";


import { TRACK_CATEGORIES, type Project, type ParsedTrack } from "@shared/schema";

type ConsoleMessage = {
  text: string;
  level: "info" | "warn" | "error" | "eval";
  timestamp: number;
};

export default function Studio() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [code, setCode] = useState("// Welcome to Strudel Lab\n// Press Play or Ctrl+Enter to hear sound\n\nnote(\"c3 e3 g3 b3 c4\").s(\"sawtooth\").lpf(800).room(0.5)\n.gain(.3)");
  const [rightPanelTab, setRightPanelTab] = useState("samples");
  const [sidebarTab, setSidebarTab] = useState("projects");
  const consoleMessagesRef = useRef<ConsoleMessage[]>([]);
  const [consoleUpdated, setConsoleUpdated] = useState(0);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showVisual, setShowVisual] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [customSampleRefreshKey, setCustomSampleRefreshKey] = useState(0);
  const lastEvaluatedCodeRef = useRef('');

  const { initialized, playing, latency, initError, evaluate, stop } = useStrudel();
  const {
    recording, paused,
    startRecording, stopRecording, togglePause,
    recordCodeChange, recordAction,
  } = useRecorder();
  const { autoSaveOn, setAutoSaveOn } = useAutoSave(selectedProject, code, true);
  const {
    devices: midiDevices,
    connected: midiConnected,
    deviceCount: midiDeviceCount,
    lastMessage: midiLastMessage,
    noteMap: midiNoteMap,
    updateNoteMap: midiUpdateNoteMap,
    toggleDevice: midiToggleDevice,
  } = useMidi();
  const editorRef = useRef<MonacoEditorRef>(null);
  const [editor, setEditor] = useState<MonacoEditorInstance | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const currentTracks = useMemo(() => deriveTracks(code), [code]);
  const canvasModel = useMemo(() => parseStructure(code), [code]);
  const rafRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const playbackRafRef = useRef<number>(0);
  const playbackStartRef = useRef<number>(0);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const codeRef = useRef(code);
  codeRef.current = code;
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFps(getFps()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getAllProjects().then(projects => {
      setProjects(projects);
      const wantedId = sessionStorage.getItem('strudel_select_project');
      const wanted = wantedId ? projects.find(p => p.id === wantedId) : undefined;
      if (wanted) {
        sessionStorage.removeItem('strudel_select_project');
        setSelectedProject(wanted);
        setCode(wanted.code);
      } else if (projects.length > 0) {
        setSelectedProject(projects[0]);
        setCode(projects[0].code);
      } else {
        const unsaved = localStorage.getItem('strudel_unsaved_code');
        if (unsaved) setCode(unsaved);
      }
    }).catch(() => {
      console.error('Failed to load projects from database');
    });
  }, []);



  useEffect(() => {
    if (!recording) return;
    let running = true;

    function tick() {
      if (!running) return;
      const elapsed = performance.now() - recordingStartRef.current;
      setRecordingTime(elapsed);
      setRecordingDuration(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [recording]);

  useEffect(() => {
    if (!playing) return;
    playbackStartRef.current = performance.now() - playbackTime;
    let running = true;
    function tick() {
      if (!running) return;
      if (!recordingRef.current) {
        setPlaybackTime(performance.now() - playbackStartRef.current);
      }
      playbackRafRef.current = requestAnimationFrame(tick);
    }
    playbackRafRef.current = requestAnimationFrame(tick);
    return () => { running = false; if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current); };
  }, [playing]);

  const addConsoleMessage = useCallback((text: string, level: ConsoleMessage['level'] = 'info') => {
    const messages = consoleMessagesRef.current;
    messages.push({ text, level, timestamp: Date.now() });
    if (messages.length > 200) messages.splice(0, messages.length - 200);
    setConsoleUpdated(c => c + 1);
  }, []);

  useEffect(() => {
    if (!liveMode) return;
    const timer = setTimeout(async () => {
      const trimmed = code.trim();
      if (!trimmed || code === lastEvaluatedCodeRef.current) return;
      const syntax = checkBalancedSyntax(code);
      if (!syntax.ok) return;
      try {
        recordAction(code, 'evaluate');
        await evaluate(code, (msg) => addConsoleMessage(msg, 'info'));
        lastEvaluatedCodeRef.current = code;
      } catch (e) {
        addConsoleMessage(`live eval: ${e instanceof Error ? e.message : String(e)}`, 'warn');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [code, liveMode, evaluate, recordAction, addConsoleMessage]);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    recordCodeChange(newCode);
  }, [recordCodeChange]);

  useEffect(() => {
    installTestHooks({
      setCode: (next: string) => handleCodeChange(next),
      getCode: () => codeRef.current,
      isRecording: () => globalRecorder.recording,
      getSnapshotCount: () => globalRecorder.getSnapshots().length,
      getFinalCode: () => globalRecorder.getFinalCode(),
    });
  }, [handleCodeChange]);

  const handleEvaluate = useCallback(async () => {
    if (!code.trim()) return;
    if (!initialized) { addConsoleMessage('Audio not initialized yet. Click anywhere first.', 'warn'); return; }
    addConsoleMessage(`> evaluating...`, 'eval');
    try {
      recordAction(code, 'evaluate');
      await evaluate(code, (msg) => addConsoleMessage(msg, 'info'));
      addConsoleMessage(`evaluated successfully`, 'info');
    } catch (e: any) {
      addConsoleMessage(`error: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, [code, evaluate, recordAction, addConsoleMessage, initialized]);

  const handlePlay = useCallback(async () => {
    if (!initialized) { addConsoleMessage('Audio not initialized yet. Click anywhere first.', 'warn'); return; }
    setShowTimeline(true);
    recordAction(code, 'play');
    await evaluate(code, (msg) => addConsoleMessage(msg, 'info'));
  }, [code, evaluate, recordAction, initialized, addConsoleMessage]);

  const handleStop = useCallback(() => {
    recordAction(code, 'stop');
    stop();
    addConsoleMessage('playback stopped', 'warn');
  }, [code, stop, recordAction, addConsoleMessage]);

  const handleCreateProject = useCallback(async (name: string) => {
    const project = await createProject({ name, code });
    setProjects(prev => [project, ...prev]);
    setSelectedProject(project);
    setCode(project.code);
    setSidebarTab("projects");
    addConsoleMessage(`project "${name}" created`, 'info');
  }, [addConsoleMessage, code]);

  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setCode(project.code);
    setSidebarTab("projects");
  }, []);

  const handleRecordingStart = useCallback(() => {
    const projectId = selectedProject?.id || 'unsaved';
    const bpm = selectedProject?.bpm || 120;
    startRecording(projectId, bpm, code);
    setShowTimeline(true);
    setRightPanelTab('session');
    recordingStartRef.current = performance.now();
    setRecordingDuration(0);
    setRecordingTime(0);
    addConsoleMessage('recording started...', 'info');
  }, [selectedProject, code, startRecording, addConsoleMessage]);

  const handleRecordingStop = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const result = await stopRecording();
    if (!result) return;

    if (selectedProject) {
      try {
        await createSession({
          projectId: selectedProject.id,
          name: `${selectedProject.name} - ${new Date().toLocaleTimeString()}`,
          bpm: selectedProject.bpm || 120,
          duration: result.duration,
          audioBlob: result.wavBlob,
          snapshots: result.snapshots,
          tracks: result.tracks,
          finalCode: result.finalCode,
        });
        addConsoleMessage(`recording saved (${formatDuration(result.duration)})`, 'info');
      } catch (e: any) {
        addConsoleMessage(`save failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    } else {
      addConsoleMessage(`recording finished (${formatDuration(result.duration)}) — create a project to save it`, 'info');
    }
    setRightPanelTab('session');
  }, [stopRecording, selectedProject, addConsoleMessage]);

  const handleBpmChange = useCallback(async (bpm: number) => {
    if (!selectedProject || !Number.isFinite(bpm)) return;
    const clamped = Math.max(20, Math.min(300, Math.round(bpm)));
    const updated = { ...selectedProject, bpm: clamped };
    setSelectedProject(updated);
    setProjects(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    recordAction(code, 'bpm_change');
    await updateProject(updated.id, { bpm: clamped });
  }, [selectedProject, code, recordAction]);

  const handleInsertSample = useCallback((name: string, n?: number) => {
    const code = n !== undefined ? `s("${name}").n(${n})` : `s("${name}")`;
    editorRef.current?.insertAtCursor(code);
    addConsoleMessage(`inserted ${name}${n !== undefined ? ` n:${n}` : ''}`, 'info');
    import('@/lib/sample-registry').then(m => m.ensureBankLoaded(name)).catch(() => {});
  }, [addConsoleMessage]);

  const handleInsertCode = useCallback((code: string) => {
    editorRef.current?.insertAtCursor(code);
    addConsoleMessage(`inserted ${code}`, 'info');
  }, [addConsoleMessage]);

  const handlePlaySample = useCallback(async (name: string) => {
    try {
      await ensureBankLoaded(name);
      const { superdoughTrigger, getAudioContext } = await import('@strudel/web');
      const ctx = getAudioContext();
      superdoughTrigger(ctx.currentTime, { s: name, gain: 0.8, n: 0, duration: 1 }, 0, 1);
    } catch {
      addConsoleMessage(`could not preview "${name}"`, 'warn');
    }
  }, [addConsoleMessage]);

  const handleToggleTimeline = useCallback(() => {
    setShowTimeline(s => !s);
  }, []);

  const handleToggleVisual = useCallback(() => {
    setShowVisual(s => !s);
  }, []);

  const handleToggleCanvas = useCallback(() => {
    setShowCanvas(s => !s);
  }, []);

  const handleCanvasChange = useCallback((model: StructureModel) => {
    handleCodeChange(serializeStructure(model));
  }, [handleCodeChange]);

  const handleToggleFocus = useCallback(() => {
    setFocusMode(f => !f);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDropFile = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aiff)$/i.test(f.name)
    );
    if (files.length === 0) {
      addConsoleMessage('Drop audio files only (.wav, .mp3, .ogg, .flac)', 'warn');
      return;
    }
    const { globalMediaImporter } = await import('@/lib/media-importer');
    for (const file of files) {
      try {
        const result = await globalMediaImporter.importLocalFile(file);
        await globalMediaImporter.registerWithStrudel(result);
        addConsoleMessage(`Imported "${result.name}" (${result.duration.toFixed(1)}s, ${result.channels}ch)`, 'info');
      } catch (err: any) {
        addConsoleMessage(`Failed to import "${file.name}": ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    }
  }, [addConsoleMessage]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleEvaluate();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        handleToggleFocus();
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        if (playing) handleStop(); else handlePlay();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleEvaluate, handlePlay, handleStop, handleToggleFocus, playing]);

  return (
    <div
      className="h-screen flex flex-col bg-strudel-dark text-white font-mono overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDropFile}
    >
      {!focusMode && (
        <TopBar
          selectedProject={selectedProject}
          autoSaveOn={autoSaveOn}
          onToggleAutoSave={() => setAutoSaveOn(!autoSaveOn)}
          playing={playing}
          onPlay={handlePlay}
          onStop={handleStop}
          liveMode={liveMode}
          onToggleLive={() => setLiveMode(!liveMode)}
          onToggleRecord={recording ? handleRecordingStop : handleRecordingStart}
          recording={recording}
          paused={paused}
          onTogglePause={togglePause}
          initialized={initialized}
          showTimeline={showTimeline}
          onToggleTimeline={handleToggleTimeline}
          showVisual={showVisual}
          onToggleVisual={handleToggleVisual}
          showCanvas={showCanvas}
          onToggleCanvas={handleToggleCanvas}
          focusMode={focusMode}
          onToggleFocus={handleToggleFocus}
          showSidebar={showSidebar}
          showRightPanel={showRightPanel}
          showStatusBar={showStatusBar}
          onToggleSidebar={() => setShowSidebar(s => !s)}
          onToggleRightPanel={() => setShowRightPanel(s => !s)}
          onToggleStatusBar={() => setShowStatusBar(s => !s)}
        />
      )}

      {showCanvas && !focusMode && (
        <ErrorBoundary name="StructureCanvas">
          <StructureCanvas model={canvasModel} onChange={handleCanvasChange} />
        </ErrorBoundary>
      )}

      <div className="flex-1 flex overflow-hidden">
        {showSidebar && (
          <ErrorBoundary name="Sidebar">
            <Sidebar
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              recording={recording}
            />
          </ErrorBoundary>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <ErrorBoundary name="Editor">
            <div className="flex-1 overflow-hidden relative">
              <MonacoEditor
                ref={editorRef}
                code={code}
                onChange={handleCodeChange}
                onEvaluate={handleEvaluate}
                isPlaying={playing}
                onEditorReady={setEditor}
              />
              <BlockLayer editor={editor} code={code} enabled={showVisual} />
              <BlockPalette enabled={showVisual} />
            </div>
          </ErrorBoundary>

          {showTimeline && (
            <ErrorBoundary name="Timeline">
              <div className="border-t border-strudel-surface-light bg-strudel-surface h-48">
                <div className="flex items-center px-3 py-1 border-b border-strudel-surface-light">
                  <span className="font-display text-xs text-strudel-accent font-semibold tracking-wide">TIMELINE</span>
                </div>
                <TrackControls
                  tracks={currentTracks}
                  code={code}
                  onCodeChange={handleCodeChange}
                />
                <TimelinePanel
                  tracks={currentTracks}
                  duration={recordingDuration || 20000}
                  currentTime={Math.max(playbackTime, recordingTime)}
                  interactive={true}
                  onSeek={(ms) => setPlaybackTime(ms)}
                />
              </div>
            </ErrorBoundary>
          )}
        </div>

        {showRightPanel && (
          <div className="w-80 border-l border-strudel-surface-light bg-strudel-surface flex flex-col">
            <div className="flex w-full border-b border-strudel-surface-light bg-strudel-surface h-9">
              {(["samples", "media", "console", "midi", "session"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightPanelTab(tab)}
                  data-testid={`panel-tab-${tab}`}
                  className={`flex-1 h-full text-xs rounded-none ${rightPanelTab === tab ? "bg-strudel-surface-light" : ""}`}
                >
                  {tab === "samples"
                    ? "SAMPLES"
                    : tab === "media"
                      ? "MEDIA"
                      : tab === "console"
                        ? "CONSOLE"
                        : tab === "midi"
                          ? "MIDI"
                          : "SESSION"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {rightPanelTab === "samples" && (
                <SamplesPanel
                  onInsertSample={handleInsertSample}
                  onPlaySample={handlePlaySample}
                  refreshKey={customSampleRefreshKey}
                  onInsertCode={handleInsertCode}
                />
              )}
              {rightPanelTab === "media" && (
                <ErrorBoundary name="MicPanel">
                  <MicPanel onMicSampleCreated={(name) => {
                    addConsoleMessage(`Sample "${name}" created from mic`, 'info');
                    setCustomSampleRefreshKey(k => k + 1);
                    setRightPanelTab('samples');
                  }} />
                </ErrorBoundary>
              )}
              {rightPanelTab === "console" && (
                <ConsolePanel key={consoleUpdated} messages={consoleMessagesRef.current} />
              )}
              {rightPanelTab === "midi" && (
                <MidiPanel
                  devices={midiDevices}
                  connected={midiConnected}
                  deviceCount={midiDeviceCount}
                  lastMessage={midiLastMessage}
                  noteMap={midiNoteMap}
                  onUpdateNoteMap={midiUpdateNoteMap}
                  onToggleDevice={midiToggleDevice}
                />
              )}
              {rightPanelTab === "session" && (
                <ErrorBoundary name="SessionPanel">
                  <SessionPanel recording={recording} recordingTime={recordingTime} />
                </ErrorBoundary>
              )}
            </div>
          </div>
        )}
      </div>

      {showStatusBar && (
        <div className="h-7 border-t border-strudel-surface-light bg-strudel-dark flex items-center px-3 gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            BPM:
            <input
              type="number"
              min={20}
              max={300}
              value={selectedProject?.bpm || 120}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              data-testid="bpm-input"
              className="w-12 bg-transparent border border-strudel-surface-light rounded px-1 text-[10px] text-white"
            />
          </span>
          <span>Latency: {latency}ms</span>
          <span>FPS: {fps}</span>
          <span className={midiConnected ? 'text-green-500' : 'text-muted-foreground'}>
            {midiConnected ? `● MIDI ${midiDeviceCount}/${midiDevices.length}` : '○ MIDI'}
          </span>
          <span className="ml-auto">
            {initError ? <span className="text-red-500">● INIT ERROR: {initError}</span> :
             initialized ? '● AUDIO READY' : '◌ INITIALIZING...'}
          </span>
          {recording && (
            <span className="text-red-500 animate-pulse">● REC {formatDuration(recordingTime)}</span>
          )}
        </div>
      )}
      {focusMode && (
        <button
          onClick={handleToggleFocus}
          className="fixed top-2 right-2 z-50 bg-strudel-primary text-white text-xs px-3 py-1 rounded hover:bg-strudel-secondary"
        >
          EXIT FOCUS (Ctrl+F)
        </button>
      )}
    </div>
  );
}

function getTrackColor(category: string): string {
  const cat = TRACK_CATEGORIES[category as keyof typeof TRACK_CATEGORIES];
  return cat?.color ?? TRACK_CATEGORIES.custom.color;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function deriveTracks(code: string): ParsedTrack[] {
  const instruments = detectInstruments(code);
  const seen = new Set<string>();
  return instruments.filter(inst => {
    if (seen.has(inst.name)) return false;
    seen.add(inst.name);
    return true;
  }).map(inst => ({
    name: inst.name,
    category: inst.category,
    color: getTrackColor(inst.category),
    events: [],
    modifiers: extractModifiers(inst.code, inst.lineIndex),
  }));
}
