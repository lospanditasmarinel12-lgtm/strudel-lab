import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/mic-capture-engine', function() {
  return {
    globalMicCapture: {
      stop: vi.fn(),
      start: vi.fn(function() { return Promise.resolve(); }),
      freezeAsSample: vi.fn(function() { return Promise.resolve(); }),
      getDevices: vi.fn(function() { return Promise.resolve([]); }),
    },
  };
});

// Mock UI components to avoid complexity
vi.mock('@/components/ui/button', function() {
  return {
    Button: function Button(props: any) {
      return <button data-testid="mock-button" onClick={props.onClick} disabled={props.disabled} className={props.className}>{props.children}</button>;
    },
  };
});

vi.mock('@/components/ui/slider', function() {
  return {
    Slider: function Slider() { return <div data-testid="mock-slider" />; },
  };
});

vi.mock('lucide-react', function() {
  return {
    Mic: function Mic() { return <span>MicIcon</span>; },
    MicOff: function MicOff() { return <span>MicOffIcon</span>; },
    Snowflake: function Snowflake() { return <span>SnowflakeIcon</span>; },
  };
});

import MicPanel from './mic-panel';
import { globalMicCapture } from '@/lib/mic-capture-engine';

describe('MicPanel', function() {
  beforeEach(function() {
    vi.clearAllMocks();
  });

  it('renders START MIC button', function() {
    render(<MicPanel />);
    expect(screen.getByText('START MIC')).toBeTruthy();
  });

  it('calls globalMicCapture.start when START MIC is clicked', async function() {
    const user = userEvent.setup();
    render(<MicPanel />);
    await user.click(screen.getByText('START MIC'));
    expect(globalMicCapture.start).toHaveBeenCalled();
  });

  it('shows STOP MIC and freeze controls after starting', async function() {
    const user = userEvent.setup();
    render(<MicPanel />);
    await user.click(screen.getByText('START MIC'));
    expect(screen.getByText('STOP MIC')).toBeTruthy();
    expect(screen.getByText('FREEZE AS SAMPLE')).toBeTruthy();
  });

  it('calls globalMicCapture.stop when STOP MIC is clicked', async function() {
    const user = userEvent.setup();
    render(<MicPanel />);
    await user.click(screen.getByText('START MIC'));
    await user.click(screen.getByText('STOP MIC'));
    expect(globalMicCapture.stop).toHaveBeenCalled();
  });

  it('calls globalMicCapture.stop on unmount', function() {
    const { unmount } = render(<MicPanel />);
    unmount();
    expect(globalMicCapture.stop).toHaveBeenCalled();
  });

  it('shows error when start fails', async function() {
    (globalMicCapture.start as any).mockRejectedValueOnce(new Error('permission denied'));
    const user = userEvent.setup();
    render(<MicPanel />);
    await user.click(screen.getByText('START MIC'));
    expect(await screen.findByText('permission denied')).toBeTruthy();
  });
});
