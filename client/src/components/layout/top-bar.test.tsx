import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock all UI dependencies
vi.mock('@/components/ui/button', function() {
  return {
    Button: function Button(props: any) {
      return <button onClick={props.onClick} disabled={props.disabled} title={props.title} className={props.className}>{props.children}</button>;
    },
  };
});

vi.mock('@/components/ui/switch', function() {
  return {
    Switch: function Switch(props: any) {
      return <input type="checkbox" checked={props.checked} onChange={props.onCheckedChange} data-testid="auto-save-switch" />;
    },
  };
});

vi.mock('@/components/ui/dropdown-menu', function() {
  return {
    DropdownMenu: function DropdownMenu(props: any) { return <div>{props.children}</div>; },
    DropdownMenuTrigger: function DropdownMenuTrigger(props: any) { return <div>{props.children}</div>; },
    DropdownMenuContent: function DropdownMenuContent(props: any) { return <div>{props.children}</div>; },
    DropdownMenuCheckboxItem: function DropdownMenuCheckboxItem(props: any) {
      return <label><input type="checkbox" checked={props.checked} onChange={props.onCheckedChange} />{props.children}</label>;
    },
  };
});

vi.mock('lucide-react', function() {
  return {
    Play: function() { return <span>PlayIcon</span>; },
    Square: function() { return <span>SquareIcon</span>; },
    Circle: function() { return <span>CircleIcon</span>; },
    Pause: function() { return <span>PauseIcon</span>; },
    Clock: function() { return <span>ClockIcon</span>; },
    Maximize2: function() { return <span>MaximizeIcon</span>; },
    Minimize2: function() { return <span>MinimizeIcon</span>; },
    Layout: function() { return <span>LayoutIcon</span>; },
    PanelRight: function() { return <span>PanelRightIcon</span>; },
    PanelLeft: function() { return <span>PanelLeftIcon</span>; },
    PanelBottom: function() { return <span>PanelBottomIcon</span>; },
    Blocks: function() { return <span>BlocksIcon</span>; },
    Grid3x3: function() { return <span>GridIcon</span>; },
  };
});

import TopBar from './top-bar';

function defaultProps() {
  return {
    selectedProject: null,
    autoSaveOn: true,
    onToggleAutoSave: vi.fn(),
    playing: false,
    onPlay: vi.fn(),
    onStop: vi.fn(),
    onToggleRecord: vi.fn(),
    recording: false,
    paused: false,
    onTogglePause: vi.fn(),
    initialized: true,
    liveMode: false,
    onToggleLive: vi.fn(),
    showTimeline: false,
    onToggleTimeline: vi.fn(),
    showVisual: false,
    onToggleVisual: vi.fn(),
    showCanvas: false,
    onToggleCanvas: vi.fn(),
    showGrid: false,
    onToggleGrid: vi.fn(),
    focusMode: false,
    onToggleFocus: vi.fn(),
    showSidebar: true,
    showRightPanel: true,
    showStatusBar: true,
    onToggleSidebar: vi.fn(),
    onToggleRightPanel: vi.fn(),
    onToggleStatusBar: vi.fn(),
  };
}

describe('TopBar', function() {
  it('renders Play button', function() {
    render(<TopBar {...defaultProps()} />);
    expect(screen.getByTitle(/Play/)).toBeTruthy();
  });

  it('disables Play when not initialized', function() {
    render(<TopBar {...defaultProps()} initialized={false} />);
    const btn = screen.getByTitle(/Initializing/);
    expect(btn).toBeTruthy();
  });

  it('shows Stop button disabled when not playing', function() {
    render(<TopBar {...defaultProps()} />);
    const stopBtn = screen.getByTitle('Stop');
    expect(stopBtn).toBeTruthy();
  });

  it('shows Record button', function() {
    render(<TopBar {...defaultProps()} />);
    expect(screen.getByTitle('Start recording')).toBeTruthy();
  });

  it('shows Stop Recording when recording', function() {
    render(<TopBar {...defaultProps()} recording={true} />);
    expect(screen.getByTitle('Stop recording')).toBeTruthy();
  });

  it('shows Pause button when recording', function() {
    render(<TopBar {...defaultProps()} recording={true} />);
    expect(screen.getByTitle(/Pause/)).toBeTruthy();
  });

  it('shows LIVE button', function() {
    render(<TopBar {...defaultProps()} />);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('shows DAW button', function() {
    render(<TopBar {...defaultProps()} />);
    expect(screen.getAllByText('Timeline').length).toBeGreaterThan(0);
  });

  it('shows BLOCKS button and calls onToggleVisual', async function() {
    const onToggleVisual = vi.fn();
    const user = userEvent.setup();
    render(<TopBar {...defaultProps()} onToggleVisual={onToggleVisual} />);
    const btn = screen.getByText('Blocks');
    expect(btn).toBeTruthy();
    await user.click(btn);
    expect(onToggleVisual).toHaveBeenCalled();
  });

  it('shows project name when selected', function() {
    const project = { id: 'p1', name: 'My Track', code: '', bpm: 120, createdAt: 0, updatedAt: 0 };
    render(<TopBar {...defaultProps()} selectedProject={project} />);
    expect(screen.getByText('My Track')).toBeTruthy();
  });

  it('shows No project when none selected', function() {
    render(<TopBar {...defaultProps()} />);
    expect(screen.getByText('No project')).toBeTruthy();
  });

  it('calls onPlay when Play clicked', async function() {
    const onPlay = vi.fn();
    const user = userEvent.setup();
    render(<TopBar {...defaultProps()} onPlay={onPlay} />);
    await user.click(screen.getByTitle(/Play/));
    expect(onPlay).toHaveBeenCalled();
  });

  it('calls onStop when Stop clicked', async function() {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<TopBar {...defaultProps()} playing={true} onStop={onStop} />);
    await user.click(screen.getByTitle('Stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('calls onToggleRecord when Record clicked', async function() {
    const onToggleRecord = vi.fn();
    const user = userEvent.setup();
    render(<TopBar {...defaultProps()} onToggleRecord={onToggleRecord} />);
    await user.click(screen.getByTitle('Start recording'));
    expect(onToggleRecord).toHaveBeenCalled();
  });

  it('shows FOCUS button by default and EXIT FOCUS in focus mode', function() {
    const { rerender } = render(<TopBar {...defaultProps()} />);
    expect(screen.getByText('Focus')).toBeTruthy();

    rerender(<TopBar {...defaultProps()} focusMode={true} />);
    expect(screen.getByText('Exit focus')).toBeTruthy();
  });
});
