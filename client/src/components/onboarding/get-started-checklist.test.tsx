import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GetStartedChecklist from './get-started-checklist';
import { INITIAL_SIGNALS, type TourSignals } from '@/lib/tour/signals';
import { loadChecklist, resetAllOnboarding } from '@/lib/tour/storage';

function signals(over: Partial<TourSignals> = {}): TourSignals {
  return { ...INITIAL_SIGNALS, ...over };
}

beforeEach(() => {
  resetAllOnboarding();
});

describe('GetStartedChecklist', () => {
  it('renders the five get-started items', () => {
    render(<GetStartedChecklist signals={signals()} />);
    expect(screen.getByTestId('get-started')).toBeTruthy();
    expect(screen.getByText('Press Play')).toBeTruthy();
    expect(screen.getByText('Export your work')).toBeTruthy();
  });

  it('auto-checks items from signals and persists', () => {
    const { rerender } = render(<GetStartedChecklist signals={signals()} />);
    rerender(<GetStartedChecklist signals={signals({ playing: true, sampleInserted: 1 })} />);
    const state = loadChecklist();
    expect(state.completed).toContain('play');
    expect(state.completed).toContain('sample');
  });

  it('dismisses and hides', async () => {
    const { rerender } = render(<GetStartedChecklist signals={signals()} />);
    await userEvent.click(screen.getByTestId('get-started-dismiss'));
    expect(loadChecklist().dismissed).toBe(true);
    rerender(<GetStartedChecklist signals={signals()} />);
    expect(screen.queryByTestId('get-started')).toBeNull();
  });
});
