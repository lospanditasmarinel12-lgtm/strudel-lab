import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TourOverlay from './tour-overlay';
import type { TourStep } from '@/lib/tour/steps';

function addTarget(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-testid', id);
  document.body.appendChild(el);
  return el;
}

const baseStep: TourStep = {
  id: 's',
  title: 'Hello',
  body: 'World',
  target: 'target',
  placement: 'bottom',
  advanceWhen: () => false,
};

function props(over: Partial<React.ComponentProps<typeof TourOverlay>> = {}) {
  return {
    step: baseStep,
    stepIndex: 0,
    total: 3,
    canAdvance: false,
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    ...over,
  };
}

describe('TourOverlay', () => {
  let target: HTMLElement | null = null;

  beforeEach(() => {
    target = addTarget('target');
  });

  afterEach(() => {
    target?.remove();
    target = null;
  });

  it('renders the step title and body', () => {
    render(<TourOverlay {...props()} />);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('World')).toBeTruthy();
    expect(screen.getByTestId('tour-root')).toBeTruthy();
  });

  it('disables Next while the step is gated', () => {
    render(<TourOverlay {...props({ canAdvance: false })} />);
    expect(screen.getByTestId('tour-next')).toBeDisabled();
    expect(screen.getByTestId('tour-hint')).toBeTruthy();
  });

  it('enables and fires Next when the action is done', async () => {
    const onNext = vi.fn();
    render(<TourOverlay {...props({ canAdvance: true, onNext })} />);
    const next = screen.getByTestId('tour-next');
    expect(next).not.toBeDisabled();
    await userEvent.click(next);
    expect(onNext).toHaveBeenCalled();
  });

  it('fires Skip', async () => {
    const onSkip = vi.fn();
    render(<TourOverlay {...props({ onSkip })} />);
    await userEvent.click(screen.getByTestId('tour-skip'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('renders a centered card when the target is missing', () => {
    const step: TourStep = { id: 'x', title: 'Centered', body: 'No target' };
    render(<TourOverlay {...props({ step })} />);
    expect(screen.getByText('Centered')).toBeTruthy();
  });
});
