import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', function() {
  return {
    useNavigate: function() { return vi.fn(); },
  };
});

vi.mock('@/components/ui/scroll-area', function() {
  return {
    ScrollArea: function ScrollArea(props: any) { return <div>{props.children}</div>; },
  };
});

vi.mock('@/components/ui/button', function() {
  return {
    Button: function Button(props: any) {
      return <button onClick={props.onClick} disabled={props.disabled}>{props.children}</button>;
    },
  };
});

vi.mock('lucide-react', function() {
  return {
    Play: function() { return <span>PlayIcon</span>; },
    Pause: function() { return <span>PauseIcon</span>; },
    Square: function() { return <span>SquareIcon</span>; },
    RotateCcw: function() { return <span>RotateIcon</span>; },
    Download: function() { return <span>DownloadIcon</span>; },
    Upload: function() { return <span>UploadIcon</span>; },
    Music: function() { return <span>MusicIcon</span>; },
    FileCode: function() { return <span>FileCodeIcon</span>; },
  };
});

vi.mock('@/lib/stores/session-store', function() {
  return {
    getAllSessions: vi.fn(function() { return Promise.resolve([]); }),
    getSessionSnapshots: vi.fn(function() { return Promise.resolve([]); }),
    deleteSession: vi.fn(function() { return Promise.resolve(); }),
  };
});

vi.mock('@/hooks/use-code-session-player', function() {
  return {
    useCodeSessionPlayer: vi.fn(function() { return { isPlaying: false, play: vi.fn(), pause: vi.fn(), stop: vi.fn() }; }),
  };
});

vi.mock('@/components/timeline/session-timeline-panel', function() {
  return { default: function() { return null; } };
});

vi.mock('@/lib/session-exporter', function() {
  return {
    exportSongAsFile: vi.fn(function() { return Promise.resolve(); }),
    exportLiveSessionAsFile: vi.fn(function() { return Promise.resolve(); }),
    isCodeSession: vi.fn(function() { return true; }),
    importSongFromFile: vi.fn(function() { return Promise.resolve({ id: 'p1' }); }),
    importLiveSessionFromFile: vi.fn(function() { return Promise.resolve({ id: 's1' }); }),
  };
});

import SessionPanel from './session-panel';

describe('SessionPanel', function() {
  it('shows recording indicator when recording prop is true', function() {
    render(<SessionPanel recording={true} recordingTime={5000} />);
    expect(screen.getByText(/0:05/)).toBeTruthy();
  });

  it('shows formatted recording time', function() {
    render(<SessionPanel recording={true} recordingTime={65000} />);
    expect(screen.getByText(/1:05/)).toBeTruthy();
  });

  it('does not show recording indicator when not recording', function() {
    const { container } = render(<SessionPanel recording={false} />);
    expect(container.textContent).not.toContain(/\d+:\d+/);
  });
});
