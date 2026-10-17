import { memo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Play, Square, Circle, Pause, Clock, Maximize2, Minimize2, Layout, PanelRight, PanelLeft, PanelBottom, Blocks, Code2 } from "lucide-react";
import type { Project } from "@shared/schema";

interface TopBarProps {
  selectedProject: Project | null;
  autoSaveOn: boolean;
  onToggleAutoSave: () => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  recording: boolean;
  paused: boolean;
  onTogglePause: () => void;
  initialized: boolean;
  liveMode: boolean;
  onToggleLive: () => void;
  showTimeline: boolean;
  onToggleTimeline: () => void;
  showVisual: boolean;
  onToggleVisual: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  showSidebar: boolean;
  showRightPanel: boolean;
  showStatusBar: boolean;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onToggleStatusBar: () => void;
  /** Optional Help menu (mounted by the studio). */
  helpSlot?: ReactNode;
}

/** A scope-style level meter; animates only while playing. */
function LevelMeter({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-4 px-1" title={playing ? 'Output level' : 'Idle'} aria-hidden="true">
      {[0.5, 0.8, 1, 0.7, 0.45].map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-strudel-accent"
          style={{
            height: playing ? `${Math.round(h * 14)}px` : '3px',
            opacity: playing ? 0.9 : 0.25,
            transition: 'height 180ms ease-out',
            animation: playing ? `strudel-meter 0.9s ease-in-out ${i * 90}ms infinite alternate` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export default memo(function TopBar({
  selectedProject,
  autoSaveOn,
  onToggleAutoSave,
  playing,
  onPlay,
  onStop,
  onToggleRecord,
  recording,
  paused,
  onTogglePause,
  initialized,
  liveMode,
  onToggleLive,
  showTimeline,
  onToggleTimeline,
  showVisual,
  onToggleVisual,
  focusMode,
  onToggleFocus,
  showSidebar,
  showRightPanel,
  showStatusBar,
  onToggleSidebar,
  onToggleRightPanel,
  onToggleStatusBar,
  helpSlot,
}: TopBarProps) {
  return (
    <div className="border-b border-strudel-surface-light bg-strudel-surface">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2">
          {/* Transport — a single instrument cluster */}
          <div className="flex items-center gap-0.5 rounded-md border border-strudel-surface-light bg-strudel-dark px-1 py-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleRecord}
              data-testid="record-button"
              className={`h-7 w-7 ${recording ? 'text-red-500' : 'text-muted-foreground hover:text-white'}`}
              title={recording ? 'Stop recording' : 'Start recording'}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
            >
              <Circle size={14} fill={recording ? 'currentColor' : 'none'} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPlay}
              disabled={!initialized}
              data-testid="play-button"
              className={`h-7 w-7 ${playing ? 'text-strudel-accent' : 'text-muted-foreground hover:text-white'} disabled:opacity-30`}
              title={initialized ? 'Play (Ctrl+Enter)' : 'Initializing audio…'}
              aria-label="Play"
            >
              <Play size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              disabled={!initialized || !playing}
              className="h-7 w-7 text-muted-foreground hover:text-white disabled:opacity-30"
              title="Stop"
              aria-label="Stop"
            >
              <Square size={14} />
            </Button>
            {recording && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onTogglePause}
                className="h-7 w-7 text-yellow-500 hover:text-yellow-400"
                title={paused ? 'Resume' : 'Pause'}
                aria-label={paused ? 'Resume recording' : 'Pause recording'}
              >
                <Pause size={14} />
              </Button>
            )}
            <LevelMeter playing={playing} />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleLive}
            data-testid="live-toggle"
            className={`h-7 px-2 font-display text-xs ${liveMode ? 'bg-strudel-accent text-black' : 'text-muted-foreground hover:text-white'}`}
            title="Live auto-evaluate on code change"
          >
            <span className={`mr-1 text-[10px] ${liveMode ? '' : 'opacity-50'}`}>●</span>
            Live
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTimeline}
            data-testid="timeline-toggle"
            className={`h-7 px-2 font-display text-xs ${showTimeline ? 'bg-strudel-accent text-black' : 'text-muted-foreground hover:text-white'}`}
            title="Toggle timeline"
          >
            <Clock size={14} className="mr-1" />
            Timeline
          </Button>
          <div
            className="flex items-center rounded-md border border-strudel-surface-light overflow-hidden h-7"
            role="group"
            aria-label="Editor mode"
          >
            <button
              type="button"
              data-testid="code-toggle"
              onClick={() => showVisual && onToggleVisual()}
              aria-pressed={!showVisual}
              className={`flex items-center h-full px-2 font-display text-xs ${
                !showVisual ? 'bg-strudel-accent text-black' : 'text-muted-foreground hover:text-white'
              }`}
              title="Text code editor"
            >
              <Code2 size={14} className="mr-1" />
              Code
            </button>
            <button
              type="button"
              data-testid="blocks-toggle"
              onClick={() => !showVisual && onToggleVisual()}
              aria-pressed={showVisual}
              className={`flex items-center h-full px-2 font-display text-xs border-l border-strudel-surface-light ${
                showVisual ? 'bg-strudel-accent text-black' : 'text-muted-foreground hover:text-white'
              }`}
              title="Visual block editor (Blockly)"
            >
              <Blocks size={14} className="mr-1" />
              Blocks
            </button>
          </div>
          <div className="w-px h-5 bg-strudel-surface-light" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 font-display text-xs text-muted-foreground hover:text-white">
                <Layout size={14} className="mr-1" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-strudel-surface border-strudel-surface-light text-white text-xs">
              <DropdownMenuCheckboxItem checked={showSidebar} onCheckedChange={onToggleSidebar}>
                <PanelLeft size={12} className="mr-2" />
                Sidebar
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showRightPanel} onCheckedChange={onToggleRightPanel}>
                <PanelRight size={12} className="mr-2" />
                Right panel
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showTimeline} onCheckedChange={onToggleTimeline}>
                <Clock size={12} className="mr-2" />
                Timeline
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showStatusBar} onCheckedChange={onToggleStatusBar}>
                <PanelBottom size={12} className="mr-2" />
                Status bar
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFocus}
            className="h-7 px-2 font-display text-xs text-muted-foreground hover:text-white"
          >
            {focusMode ? <Minimize2 size={14} className="mr-1" /> : <Maximize2 size={14} className="mr-1" />}
            {focusMode ? 'Exit focus' : 'Focus'}
          </Button>

          {helpSlot}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-display text-[11px] text-muted-foreground">Auto-save</span>
            <Switch
              checked={autoSaveOn}
              onCheckedChange={onToggleAutoSave}
              data-testid="auto-save-switch"
              className="scale-75 data-[state=checked]:bg-strudel-accent"
              aria-label="Toggle auto-save"
            />
          </div>
          <div className="w-px h-5 bg-strudel-surface-light" />
          <span className="font-display text-sm tracking-wide text-foreground">
            {selectedProject ? selectedProject.name : 'No project'}
          </span>
          <span className="font-display text-[11px] text-strudel-accent ml-1">● Live</span>
        </div>
      </div>
    </div>
  );
});
