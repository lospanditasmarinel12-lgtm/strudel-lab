import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { getAllProjects, createProject, updateProject, deleteProject } from "@/lib/stores/project-store";
import { createSession, getAllSessions, getSessionSnapshots } from "@/lib/stores/session-store";
import { exportProjectAsSong, exportLiveSessionAsFile } from "@/lib/session-exporter";
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
import ErrorBoundary from "@/components/error-boundary";
import UnsavedChangesDialog from "@/components/layout/unsaved-changes-dialog";
import TourOverlay from "@/components/tour/tour-overlay";
import GetStartedChecklist from "@/components/onboarding/get-started-checklist";
import HelpMenu from "@/components/help/help-menu";
import { useExitGuard } from "@/hooks/use-exit-guard";
import { useTour } from "@/hooks/use-tour";
import { onTourEvent } from "@/lib/tour/events";
import { resetAllOnboarding } from "@/lib/tour/storage";
import type { TourSignals } from "@/lib/tour/signals";
import type { Example } from "@/lib/examples";
import type { MonacoEditorInstance } from "@/components/editor/monaco-editor";
import type { BlocklyApi } from "@/components/visual/blockly-workspace";


import { TRACK_CATEGORIES, type Project, type ParsedTrack } from "@shared/schema";

const BlocklyWorkspace = lazy(() => import("@/components/visual/blockly-workspace"));

const DEFAULT_CODE = '// Welcome to Strudel Lab\n// Press Play or Ctrl+Enter to hear sound\n\nnote("c3 e3 g3 b3 c4").s("sawtooth").lpf(800).room(0.5)\n.gain(.3)';

type ConsoleMessage = {
  text: string;
  level: "info" | "warn" | "error" | "eval";
  timestamp: number;
};

export default function Studio() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [cleanCode, setCleanCode] = useState(DEFAULT_CODE);
  const [codeVersion, setCodeVersion] = useState(0);
  const [sampleInserted, setSampleInserted] = useState(0);
  const [exportedCount, setExportedCount] = useState(0);
  const [rightPanelTab, setRightPanelTab] = useState("samples");
  const [sidebarTab, setSidebarTab] = useState("projects");
  const consoleMessagesRef = useRef<ConsoleMessage[]>([]);
  const [consoleUpdated, setConsoleUpdated] = useState(0);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showVisual, setShowVisual] = useState(true);
  const [evalFlash, setEvalFlash] = useState(0);
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
  const { autoSaveOn, setAutoSaveOn } = useAutoSave(selectedProject, code, true, setCleanCode);
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
  const blocklyRef = useRef<BlocklyApi>(null);
  const [, setEditor] = useState<MonacoEditorInstance | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const currentTracks = useMemo(() => deriveTracks(code), [code]);
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

  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    (async () => {
      try {
        const projects = await getAllProjects();
        setProjects(projects);
        const wantedId = sessionStorage.getItem('strudel_select_project');
        const wanted = wantedId ? projects.find(p => p.id === wantedId) : undefined;
        if (wanted) {
          sessionStorage.removeItem('strudel_select_project');
          setSelectedProject(wanted);
          setCode(wanted.code);
          setCleanCode(wanted.code);
        } else if (projects.length > 0) {
          setSelectedProject(projects[0]);
          setCode(projects[0].code);
          setCleanCode(projects[0].code);
        } else {
          // First launch: start with a project so the user can record/save/export.
          const unsaved = localStorage.getItem('strudel_unsaved_code') || DEFAULT_CODE;
          const project = await createProject({ name: 'Untitled', code: unsaved });
          setProjects([project]);
          setSelectedProject(project);
          setCode(project.code);
          setCleanCode(project.code);
        }
      } catch {
        console.error('Failed to load projects from database');
      }
    })();
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
    setCodeVersion(v => v + 1);
    recordCodeChange(newCode);
  }, [recordCodeChange]);

  // Block edits reuse `handleCodeChange`; while playing (or Live) they also
  // re-evaluate on a short debounce so the sound follows the blocks.
  const blockEvalTimerRef = useRef<number | null>(null);
  const blockEvalGuardRef = useRef({ playing: false, live: false });
  blockEvalGuardRef.current = { playing, live: liveMode };

  const handleBlockCodeChange = useCallback(
    (next: string) => {
      handleCodeChange(next);
      const { playing: isPlayingNow, live } = blockEvalGuardRef.current;
      if (!isPlayingNow && !live) return;
      if (blockEvalTimerRef.current !== null) window.clearTimeout(blockEvalTimerRef.current);
      blockEvalTimerRef.current = window.setTimeout(async () => {
        const current = codeRef.current;
        if (!current.trim()) return;
        try {
          recordAction(current, 'evaluate');
          await evaluate(current, (msg) => addConsoleMessage(msg, 'info'));
          addConsoleMessage('blocks evaluated', 'info');
        } catch (e) {
          addConsoleMessage(`block eval: ${e instanceof Error ? e.message : String(e)}`, 'warn');
        }
      }, 250);
    },
    [handleCodeChange, evaluate, recordAction, addConsoleMessage],
  );

  useEffect(() => {
    installTestHooks({
      setCode: (next: string) => handleCodeChange(next),
      getCode: () => codeRef.current,
      isRecording: () => globalRecorder.recording,
      getSnapshotCount: () => globalRecorder.getSnapshots().length,
      getFinalCode: () => globalRecorder.getFinalCode(),
      resetTour: () => resetAllOnboarding(),
    });
  }, [handleCodeChange]);

  const handleEvaluate = useCallback(async () => {
    if (!code.trim()) return;
    if (!initialized) { addConsoleMessage('Audio not initialized yet. Click anywhere first.', 'warn'); return; }
    addConsoleMessage(`> evaluating...`, 'eval');
    setEvalFlash(f => f + 1);
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
    setCleanCode(project.code);
    setSidebarTab("projects");
    addConsoleMessage(`project "${name}" created`, 'info');
  }, [addConsoleMessage, code]);

  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setCode(project.code);
    setCleanCode(project.code);
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

  // --- exit guard ---------------------------------------------------------
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!selectedProject) { setHasSession(false); return; }
    getAllSessions(selectedProject.id)
      .then(list => { if (!cancelled) setHasSession(list.length > 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedProject, recording]);

  const handleExitSave = useCallback(async () => {
    if (selectedProject) await updateProject(selectedProject.id, { code });
    setCleanCode(code);
    addConsoleMessage('project saved', 'info');
  }, [selectedProject, code, addConsoleMessage]);

  const handleExitExportSong = useCallback(async () => {
    if (!selectedProject) return;
    await exportProjectAsSong({
      name: selectedProject.name,
      code,
      bpm: selectedProject.bpm,
      createdAt: selectedProject.createdAt,
    });
    setCleanCode(code);
    setExportedCount(v => v + 1);
    addConsoleMessage('song exported', 'info');
  }, [selectedProject, code, addConsoleMessage]);

  const handleExitExportLive = useCallback(async () => {
    if (!selectedProject) return;
    const sessions = await getAllSessions(selectedProject.id);
    const latest = sessions[0];
    if (!latest) return;
    const snapshots = await getSessionSnapshots(latest.id);
    await exportLiveSessionAsFile(latest, snapshots);
    setCleanCode(code);
    setExportedCount(v => v + 1);
    addConsoleMessage('live set exported', 'info');
  }, [selectedProject, code, addConsoleMessage]);

  const handleExitDelete = useCallback(async () => {
    if (selectedProject) await deleteProject(selectedProject.id);
    addConsoleMessage('project deleted', 'warn');
  }, [selectedProject, addConsoleMessage]);

  const exitGuard = useExitGuard({
    dirty: code !== cleanCode,
    canExportLive: hasSession,
    onSave: handleExitSave,
    onExportSong: handleExitExportSong,
    onExportLive: handleExitExportLive,
    onDelete: handleExitDelete,
  });

  // --- guided tour --------------------------------------------------------
  const tourSignals = useMemo<TourSignals>(() => ({
    showVisual,
    showTimeline,
    autoSaveOn,
    rightPanelTab,
    sidebarTab,
    playing,
    liveMode,
    recording,
    hasSession,
    codeVersion,
    sampleInserted,
    exported: exportedCount,
  }), [showVisual, showTimeline, autoSaveOn, rightPanelTab, sidebarTab, playing, liveMode, recording, hasSession, codeVersion, sampleInserted, exportedCount]);

  const tourActions = useMemo(() => ({
    openRightPanel: (tab: string) => setRightPanelTab(tab),
    setTimeline: (on: boolean) => setShowTimeline(on),
    setVisual: (on: boolean) => setShowVisual(on),
  }), []);

  const tour = useTour(tourSignals, tourActions);

  useEffect(() => onTourEvent((event) => {
    if (event === 'exported') setExportedCount(c => c + 1);
    else if (event === 'sample-inserted') setSampleInserted(c => c + 1);
  }), []);

  const handleLoadExample = useCallback(async (example: Example) => {
    const project = await createProject({ name: example.name, code: example.code });
    setProjects(prev => [project, ...prev]);
    setSelectedProject(project);
    setCode(project.code);
    setCleanCode(project.code);
    setSidebarTab('projects');
    addConsoleMessage(`loaded example "${example.name}"`, 'info');
  }, [addConsoleMessage]);

  const handleInsertSample = useCallback((name: string, n?: number) => {
    if (showVisual && blocklyRef.current) {
      blocklyRef.current.addSampleBlock(name, n);
    } else {
      const code = n !== undefined ? `s("${name}").n(${n})` : `s("${name}")`;
      editorRef.current?.insertAtCursor(code);
    }
    setSampleInserted(v => v + 1);
    addConsoleMessage(`inserted ${name}${n !== undefined ? ` n:${n}` : ''}`, 'info');
    import('@/lib/sample-registry').then(m => m.ensureBankLoaded(name)).catch(() => {});
  }, [addConsoleMessage, showVisual]);

  const handleInsertCode = useCallback((code: string) => {
    if (showVisual && blocklyRef.current?.addEffectToSelection(code)) {
      addConsoleMessage(`inserted ${code}`, 'info');
      return;
    }
    editorRef.current?.insertAtCursor(code);
    setSampleInserted(v => v + 1);
    addConsoleMessage(`inserted ${code}`, 'info');
  }, [addConsoleMessage, showVisual]);

  const handlePlaySample = useCallback(async (name: string) => {
    if (showVisual) blocklyRef.current?.highlightSample(name);
    try {
      await ensureBankLoaded(name);
      const { superdoughTrigger, getAudioContext } = await import('@strudel/web');
      const ctx = getAudioContext();
      superdoughTrigger(ctx.currentTime, { s: name, gain: 0.8, n: 0, duration: 1 }, 0, 1);
    } catch {
      addConsoleMessage(`could not preview "${name}"`, 'warn');
    }
  }, [addConsoleMessage, showVisual]);

  const handleToggleTimeline = useCallback(() => {
    setShowTimeline(s => !s);
  }, []);

  const handleToggleVisual = useCallback(() => {
    setShowVisual(s => !s);
  }, []);

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
      className="reveal h-screen flex flex-col bg-strudel-dark text-white font-mono overflow-hidden"
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
          focusMode={focusMode}
          onToggleFocus={handleToggleFocus}
          showSidebar={showSidebar}
          showRightPanel={showRightPanel}
          showStatusBar={showStatusBar}
          onToggleSidebar={() => setShowSidebar(s => !s)}
          onToggleRightPanel={() => setShowRightPanel(s => !s)}
          onToggleStatusBar={() => setShowStatusBar(s => !s)}
          helpSlot={
            <HelpMenu
              onReplayTour={tour.replay}
              onLoadExample={handleLoadExample}
              onResetOnboarding={() => { resetAllOnboarding(); tour.replay(); }}
            />
          }
        />
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
              {showVisual ? (
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      Loading block editor…
                    </div>
                  }
                >
                  <BlocklyWorkspace
                    ref={blocklyRef}
                    code={code}
                    onChange={handleBlockCodeChange}
                    onError={(msg) => addConsoleMessage(`visual editor: ${msg}`, 'error')}
                  />
                </Suspense>
              ) : (
                <MonacoEditor
                  ref={editorRef}
                  code={code}
                  onChange={handleCodeChange}
                  onEvaluate={handleEvaluate}
                  isPlaying={playing}
                  onEditorReady={setEditor}
                />
              )}
              {evalFlash > 0 && (
                <div key={evalFlash} className="eval-flash absolute inset-0 pointer-events-none z-10 rounded-sm" aria-hidden="true" />
              )}
            </div>
          </ErrorBoundary>

          {showTimeline && (
            <ErrorBoundary name="Timeline">
              <div className="border-t border-strudel-surface-light bg-strudel-surface h-48">
                <div className="flex items-center px-3 py-1 border-b border-strudel-surface-light">
                  <span className="font-display text-xs text-strudel-accent font-semibold tracking-wide">Timeline</span>
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
                  className={`flex-1 h-full font-display text-xs rounded-none transition-colors ${
                    rightPanelTab === tab ? "bg-strudel-surface-light text-strudel-accent" : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {tab === "samples"
                    ? "Samples"
                    : tab === "media"
                      ? "Media"
                      : tab === "console"
                        ? "Console"
                        : tab === "midi"
                          ? "MIDI"
                          : "Session"}
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
            {initError ? <span className="text-red-500">● Init error: {initError}</span> :
             initialized ? <span className="text-strudel-accent">● Audio ready</span> : '◌ Initializing…'}
          </span>
          {recording && (
            <span className="text-red-500 animate-pulse">● Rec {formatDuration(recordingTime)}</span>
          )}
        </div>
      )}
      {focusMode && (
        <button
          onClick={handleToggleFocus}
          className="fixed top-2 right-2 z-50 bg-strudel-primary text-black text-xs px-3 py-1 rounded hover:bg-strudel-secondary"
        >
          EXIT FOCUS (Ctrl+F)
        </button>
      )}

      <UnsavedChangesDialog
        open={exitGuard.open}
        canExportLive={exitGuard.canExportLive}
        onSave={exitGuard.save}
        onExportSong={exitGuard.exportSong}
        onExportLive={exitGuard.exportLive}
        onDelete={exitGuard.deleteAndExit}
        onCancel={exitGuard.cancel}
      />

      {tour.status === 'active' && (
        <TourOverlay
          step={tour.step}
          stepIndex={tour.stepIndex}
          total={tour.total}
          canAdvance={tour.canAdvance}
          onNext={tour.next}
          onBack={tour.back}
          onSkip={tour.skip}
        />
      )}
      {tour.status !== 'active' && <GetStartedChecklist signals={tourSignals} />}
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
