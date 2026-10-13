import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParsedTrack } from '@shared/schema';

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span>ChevronDown</span>,
  ChevronRight: () => <span>ChevronRight</span>,
  Sliders: () => <span>Sliders</span>,
}));

import TrackControls from './track-controls';

const makeTrack = (name: string, color: string, modifiers: { name: string; value: number; lineIndex: number }[]): ParsedTrack => ({
  name,
  category: 'custom',
  color,
  events: [],
  modifiers,
});

describe('TrackControls', () => {
  it('renders nothing when no tracks have slider modifiers', () => {
    const tracks = [makeTrack('test', '#ff0000', [])];
    const { container } = render(
      <TrackControls tracks={tracks} code="" onCodeChange={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders track header with name and modifier count', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ name: 'gain', value: 0.5, lineIndex: 0 }]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5)" onCodeChange={() => {}} />
    );
    expect(screen.getByText('bd')).toBeTruthy();
    expect(screen.getByText('1 mods')).toBeTruthy();
  });

  it('renders the header label', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ name: 'gain', value: 0.5, lineIndex: 0 }]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5)" onCodeChange={() => {}} />
    );
    expect(screen.getByText('Track Controls')).toBeTruthy();
  });

  it('shows modifier count for each track', () => {
    const tracks = [
      makeTrack('hh', '#ffff00', [
        { name: 'gain', value: 0.8, lineIndex: 0 },
        { name: 'delay', value: 0.3, lineIndex: 0 },
      ]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('hh').gain(0.8).delay(0.3)" onCodeChange={() => {}} />
    );
    expect(screen.getByText('2 mods')).toBeTruthy();
  });

  it('can expand a collapsed track to show sliders', async () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ name: 'gain', value: 0.5, lineIndex: 0 }]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5)" onCodeChange={() => {}} />
    );
    const trackButton = screen.getByText('bd').closest('button')!;
    await userEvent.click(trackButton);
    expect(screen.getByText('gain')).toBeTruthy();
  });

  it('shows the numeric value next to the slider', async () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ name: 'gain', value: 0.5, lineIndex: 0 }]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5)" onCodeChange={() => {}} />
    );
    const trackButton = screen.getByText('bd').closest('button')!;
    await userEvent.click(trackButton);
    expect(screen.getByText('0.50')).toBeTruthy();
  });

  it('calls onCodeChange when slider value changes', async () => {
    const onCodeChange = vi.fn();
    const tracks = [
      makeTrack('bd', '#ff0000', [{ name: 'gain', value: 0.5, lineIndex: 0 }]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5)" onCodeChange={onCodeChange} />
    );
    const trackButton = screen.getByText('bd').closest('button')!;
    await userEvent.click(trackButton);
    const slider = screen.getByRole('slider') || document.querySelector('input[type="range"]');
    if (slider) {
      fireEvent.change(slider, { target: { value: '0.8' } });
      expect(onCodeChange).toHaveBeenCalled();
    }
  });

  it('shows all modifiers in compact mode by default, not unfiltered ones', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [
        { name: 'gain', value: 0.5, lineIndex: 0 },
        { name: 'degradeBy', value: 0.3, lineIndex: 0 },
      ]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5).degradeBy(0.3)" onCodeChange={() => {}} />
    );
    expect(screen.getByText('1 mods')).toBeTruthy();
  });

  it('has a toggle button to switch between compact and all', async () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [
        { name: 'gain', value: 0.5, lineIndex: 0 },
        { name: 'degradeBy', value: 0.3, lineIndex: 0 },
      ]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5).degradeBy(0.3)" onCodeChange={() => {}} />
    );
    const toggle = screen.getByText('Show All');
    await userEvent.click(toggle);
    expect(screen.getByText('2 mods')).toBeTruthy();
  });

  it('renders multiple tracks with correct names', () => {
    const tracks = [
      makeTrack('bd', '#ff0000', [{ name: 'gain', value: 0.5, lineIndex: 0 }]),
      makeTrack('hh', '#ffff00', [{ name: 'delay', value: 0.3, lineIndex: 0 }]),
    ];
    render(
      <TrackControls tracks={tracks} code="s('bd').gain(0.5)\ns('hh').delay(0.3)" onCodeChange={() => {}} />
    );
    expect(screen.getByText('bd')).toBeTruthy();
    expect(screen.getByText('hh')).toBeTruthy();
  });
});
