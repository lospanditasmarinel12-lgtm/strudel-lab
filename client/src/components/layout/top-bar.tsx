import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Play, Square, Circle, Pause, Clock, Maximize2, Minimize2, Layout, PanelRight, PanelLeft, PanelBottom, Blocks } from "lucide-react";
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
  showCanvas: boolean;
  onToggleCanvas: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  showSidebar: boolean;
  showRightPanel: boolean;
  showStatusBar: boolean;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onToggleStatusBar: () => void;
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
  showCanvas,
  onToggleCanvas,
  focusMode,
  onToggleFocus,
  showSidebar,
  showRightPanel,
  showStatusBar,
  onToggleSidebar,
  onToggleRightPanel,
  onToggleStatusBar,
}: TopBarProps) {
  return (
    <div className="border-b border-strudel-surface-light bg-strudel-surface">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPlay}
            disabled={!initialized}
            className={`h-8 w-8 ${playing ? 'text-strudel-accent' : 'text-muted-foreground hover:text-white'} disabled:opacity-30`}
            title={initialized ? 'Play (Ctrl+Enter)' : 'Initializing audio...'}
          >
            <Play size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            disabled={!initialized || !playing}
            className="h-8 w-8 text-muted-foreground hover:text-white disabled:opacity-30"
            title="Stop"
          >
            <Square size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleLive}
            className={`h-7 px-2 text-xs ${liveMode ? 'bg-strudel-accent text-white' : 'text-muted-foreground hover:text-white'}`}
            title="Live auto-evaluate on code change"
          >
            <span className={`mr-1 text-[10px] ${liveMode ? '' : 'opacity-50'}`}>●</span>
            LIVE
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTimeline}
            className={`h-7 px-2 text-xs ${showTimeline ? 'bg-strudel-accent text-white' : 'text-muted-foreground hover:text-white'}`}
          >
            <Clock size={14} className="mr-1" />
            DAW
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleVisual}
            data-testid="blocks-toggle"
            className={`h-7 px-2 text-xs ${showVisual ? 'bg-strudel-accent text-white' : 'text-muted-foreground hover:text-white'}`}
            title="Toggle draggable code blocks"
          >
            <Blocks size={14} className="mr-1" />
            BLOCKS
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCanvas}
            data-testid="canvas-toggle"
            className={`h-7 px-2 text-xs ${showCanvas ? 'bg-strudel-accent text-white' : 'text-muted-foreground hover:text-white'}`}
            title="Toggle structure canvas"
          >
            <Layout size={14} className="mr-1" />
            CANVAS
          </Button>
          <div className="w-px h-5 bg-strudel-surface-light" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleRecord}
            data-testid="record-button"
            className={`h-8 w-8 ${recording ? 'text-red-500' : 'text-muted-foreground hover:text-white'}`}
            title={recording ? 'Stop Recording' : 'Start Recording'}
          >
            <Circle size={16} fill={recording ? 'currentColor' : 'none'} />
          </Button>
          {recording && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePause}
              className="h-8 w-8 text-yellow-500 hover:text-yellow-400"
              title={paused ? 'Resume' : 'Pause'}
            >
              <Pause size={16} />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-white">
                <Layout size={14} className="mr-1" />
                VIEW
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-strudel-surface border-strudel-surface-light text-white text-xs">
              <DropdownMenuCheckboxItem
                checked={showSidebar}
                onCheckedChange={onToggleSidebar}
              >
                <PanelLeft size={12} className="mr-2" />
                Sidebar
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showRightPanel}
                onCheckedChange={onToggleRightPanel}
              >
                <PanelRight size={12} className="mr-2" />
                Right Panel
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showTimeline}
                onCheckedChange={onToggleTimeline}
              >
                <Clock size={12} className="mr-2" />
                Timeline
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showStatusBar}
                onCheckedChange={onToggleStatusBar}
              >
                <PanelBottom size={12} className="mr-2" />
                Status Bar
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFocus}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-white"
          >
            {focusMode ? <Minimize2 size={14} className="mr-1" /> : <Maximize2 size={14} className="mr-1" />}
            {focusMode ? 'EXIT FOCUS' : 'FOCUS'}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">AUTO-SAVE</span>
            <Switch
              checked={autoSaveOn}
              onCheckedChange={onToggleAutoSave}
              className="scale-75 data-[state=checked]:bg-strudel-accent"
            />
          </div>
          <div className="w-px h-5 bg-strudel-surface-light" />
          <span className="font-display text-sm tracking-wide text-foreground">
            {selectedProject ? selectedProject.name : 'No project'}
          </span>
          <span className="text-[10px] text-strudel-accent ml-2">● LIVE</span>
        </div>
      </div>
    </div>
  );
});
