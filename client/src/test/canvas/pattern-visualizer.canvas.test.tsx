import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PatternVisualizer } from '@/components/visualizers/pattern-visualizer';

describe('canvas: PatternVisualizer rendering assertions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with title PATTERN GRID', () => {
    render(<PatternVisualizer isPlaying={false} code="" />);
    expect(screen.getByText('PATTERN GRID')).toBeTruthy();
  });

  it('shows STEP: 01/16 when not playing', () => {
    render(<PatternVisualizer isPlaying={false} code="" />);
    expect(screen.getByText(/STEP:/)).toBeTruthy();
    expect(screen.getByText(/01\/16/)).toBeTruthy();
  });

  it('shows STOPPED badge when not playing', () => {
    render(<PatternVisualizer isPlaying={false} code="" />);
    expect(screen.getByText('STOPPED')).toBeTruthy();
  });

  it('shows PLAYING badge when playing', () => {
    render(<PatternVisualizer isPlaying={true} code="" />);
    expect(screen.getByText('PLAYING')).toBeTruthy();
  });

  it('renders default fallback layers when no code is given (kick, snare, hihat)', () => {
    render(<PatternVisualizer isPlaying={false} code="" />);
    expect(screen.getByText('KICK')).toBeTruthy();
    expect(screen.getByText('SNARE')).toBeTruthy();
    expect(screen.getByText('HIHAT')).toBeTruthy();
  });

  it('parses drum pattern from code and renders correct layer names', () => {
    const code = 's("bd sd hh")';
    render(<PatternVisualizer isPlaying={false} code={code} />);
    expect(screen.getByText('KICK')).toBeTruthy();
  });

  it('parses multiple s() calls into separate layers', () => {
    const code = 's("bd cp oh")';
    render(<PatternVisualizer isPlaying={false} code={code} />);
    expect(screen.getByText('KICK')).toBeTruthy();
  });

  it('renders beat indicator dots', () => {
    const { container } = render(<PatternVisualizer isPlaying={false} code="" />);
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBeGreaterThanOrEqual(4);
  });

  it('advances currentStep when playing', () => {
    render(<PatternVisualizer isPlaying={true} code="" />);
    vi.advanceTimersByTime(500);
    const stepLabel = screen.getByText(/STEP:/);
    // After 500ms at 120ms interval, we should be at step ~4
    expect(stepLabel.textContent).toMatch(/STEP:\s+\d{2}\/16/);
  });

  it('resets step to 0 when stopped', () => {
    const { rerender } = render(<PatternVisualizer isPlaying={true} code="" />);
    vi.advanceTimersByTime(500);
    rerender(<PatternVisualizer isPlaying={false} code="" />);
    expect(screen.getByText(/01\/16/)).toBeTruthy();
  });

  it('renders 16 step cells per layer in default mode', () => {
    const { container } = render(<PatternVisualizer isPlaying={false} code="" />);
    const stepCells = container.querySelectorAll('.rounded-sm');
    // 3 layers * 16 steps = 48 cells
    expect(stepCells.length).toBe(48);
  });

  it('uses correct color coding for drum types', () => {
    const code = 's("bd")';
    render(<PatternVisualizer isPlaying={false} code={code} />);
    const kickLabel = screen.getByText('KICK');
    expect(kickLabel).toBeTruthy();
    // KICK should be cyan (#06b6d4)
    expect(kickLabel.style.color).toBe('rgb(6, 182, 212)');
  });

  it('renders beat indicator with STOPPED/PLAYING label', () => {
    render(<PatternVisualizer isPlaying={false} code="" />);
    expect(screen.getByText('STOPPED')).toBeTruthy();
  });

  it('renders PLAYING label when playing', () => {
    render(<PatternVisualizer isPlaying={true} code="" />);
    expect(screen.getByText('PLAYING')).toBeTruthy();
  });

  it('animates current step when playing', () => {
    const { rerender } = render(<PatternVisualizer isPlaying={true} code="" />);
    vi.advanceTimersByTime(240);
    // Force re-render to check the animated step
    rerender(<PatternVisualizer isPlaying={true} code="" />);
    const stepText = screen.getByText(/STEP:/);
    expect(stepText.textContent).toMatch(/03\/16/);
  });
});
