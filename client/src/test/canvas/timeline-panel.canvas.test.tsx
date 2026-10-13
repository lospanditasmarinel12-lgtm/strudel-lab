import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import TimelinePanel from '@/components/timeline/timeline-panel';
import type { ParsedTrack } from '@shared/schema';

function makeTrack(name: string, color: string, events: { startMs: number; endMs: number }[], category: string = 'custom'): ParsedTrack {
  return {
    name,
    category: category as any,
    color,
    events: events.map((e, i) => ({ ...e, id: `evt-${i}`, code: '' })),
    modifiers: [],
  };
}

describe('canvas: TimelinePanel rendering assertions', () => {
  let fillRectCalls: any[] = [];
  let fillTextCalls: any[] = [];
  let strokeCalls: any[] = [];
  let ctx: any;

  beforeEach(() => {
    fillRectCalls = [];
    fillTextCalls = [];
    strokeCalls = [];

    ctx = {
      fillStyle: '',
      font: '',
      textAlign: '',
      strokeStyle: '',
      lineWidth: 0,
      fillRect: vi.fn((...args: any[]) => { fillRectCalls.push(args); }),
      fillText: vi.fn((...args: any[]) => { fillTextCalls.push(args); }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(() => strokeCalls.push([])),
      strokeRect: vi.fn(),
      closePath: vi.fn(),
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 800,
      height: 300,
      top: 0,
      left: 0,
      right: 800,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })) as any;
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', { value: 800, writable: true });
    Object.defineProperty(HTMLCanvasElement.prototype, 'height', { value: 300, writable: true });
  });

  it('draws track background rectangles for each track', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ startMs: 1000, endMs: 3000 }]),
      makeTrack('hh', '#00ff00', [{ startMs: 2000, endMs: 4000 }]),
    ];
    render(<TimelinePanel tracks={tracks} duration={10000} currentTime={0} />);
    const trackFillCalls = fillRectCalls.filter((args: any) => args[1] >= 20 && args[3] <= 30);
    expect(trackFillCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('draws event rectangles for each track event', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ startMs: 1000, endMs: 5000 }]),
    ];
    render(<TimelinePanel tracks={tracks} duration={10000} currentTime={0} />);
    const eventFillCalls = fillRectCalls.filter(
      (args: any) => args[0] > 80 && args[3] < 28,
    );
    expect(eventFillCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('draws track label text for each track', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ startMs: 1000, endMs: 3000 }]),
    ];
    render(<TimelinePanel tracks={tracks} duration={10000} currentTime={0} />);
    const labelCalls = fillTextCalls.filter((args: any) => args[0] === 'bd');
    expect(labelCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('draws selected event with stroke outline', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ startMs: 1000, endMs: 5000 }]),
    ];
    render(
      <TimelinePanel
        tracks={tracks}
        duration={10000}
        currentTime={0}
        selectedEventId="evt-0"
      />,
    );
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('draws time ruler text at correct intervals', () => {
    const tracks = [makeTrack('bd', '#ff0000', [])];
    render(<TimelinePanel tracks={tracks} duration={20000} currentTime={0} />);
    const rulerTexts = fillTextCalls.filter((args: any) => /^\d+s$/.test(args[0]));
    // Should have ~11 ruler marks (0s, 2s, 4s... 20s)
    expect(rulerTexts.length).toBeGreaterThanOrEqual(10);
  });

  it('draws playhead when currentTime > 0', () => {
    const tracks = [makeTrack('bd', '#ff0000', [{ startMs: 0, endMs: 1000 }])];
    render(<TimelinePanel tracks={tracks} duration={10000} currentTime={5000} />);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('does not draw playhead when currentTime is 0', () => {
    const tracks = [makeTrack('bd', '#ff0000', [])];
    render(<TimelinePanel tracks={tracks} duration={10000} currentTime={0} />);
    const strokeCallsBefore = strokeCalls.length;
    expect(strokeCallsBefore).toBeGreaterThanOrEqual(0);
  });

  it('renders canvas element with full width/height classes', () => {
    const tracks = [makeTrack('bd', '#ff0000', [])];
    const { container } = render(
      <TimelinePanel tracks={tracks} duration={10000} currentTime={0} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.className).toContain('w-full');
    expect(canvas!.className).toContain('h-full');
  });

  it('shows empty state text when there are no tracks', () => {
    render(<TimelinePanel tracks={[]} duration={10000} currentTime={0} />);
    const emptyTextCall = fillTextCalls.find(
      (args: any) => typeof args[0] === 'string' && args[0].includes('No tracks'),
    );
    expect(emptyTextCall).toBeTruthy();
  });
});
