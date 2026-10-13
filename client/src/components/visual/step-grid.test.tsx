import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepGrid from './step-grid';
import { emptySteps, type VisualModel } from '@/lib/visual/visual-model';

function makeModel(): VisualModel {
  const steps = emptySteps(4);
  steps[0].on = true;
  return {
    stepsPerCycle: 4,
    rows: [
      { id: 'r1', kind: 'drum', name: 'bd', source: 'bd', color: '#fff', steps, effects: [] },
      { id: 'r2', kind: 'raw', name: 'raw block', color: '#000', code: 'stack(s("bd"), s("hh"))' },
    ],
  };
}

function renderGrid(overrides: Partial<React.ComponentProps<typeof StepGrid>> = {}) {
  const props = {
    model: makeModel(),
    selectedRowId: null,
    onSelectRow: vi.fn(),
    onToggleStep: vi.fn(),
    onToggleMute: vi.fn(),
    onRemoveRow: vi.fn(),
    ...overrides,
  };
  return { ...render(<StepGrid {...props} />), props };
}

describe('StepGrid', () => {
  it('renders one cell per step for grid rows', () => {
    renderGrid();
    expect(screen.getAllByTestId(/^step-cell-/)).toHaveLength(4);
  });

  it('renders raw rows without step cells', () => {
    renderGrid();
    expect(screen.queryByTestId('step-cell-r2-0')).toBeNull();
    expect(screen.getByText(/stack\(s\("bd"\)/)).toBeTruthy();
  });

  it('toggles a step on mousedown', () => {
    const onToggleStep = vi.fn();
    renderGrid({ onToggleStep });
    fireEvent.mouseDown(screen.getByTestId('step-cell-r1-0'));
    // step 0 is on, so it toggles off
    expect(onToggleStep).toHaveBeenCalledWith('r1', 0, false);
  });

  it('toggles an off step on', () => {
    const onToggleStep = vi.fn();
    renderGrid({ onToggleStep });
    fireEvent.mouseDown(screen.getByTestId('step-cell-r1-1'));
    expect(onToggleStep).toHaveBeenCalledWith('r1', 1, true);
  });

  it('mutes a row', () => {
    const onToggleMute = vi.fn();
    renderGrid({ onToggleMute });
    fireEvent.click(screen.getByTestId('row-mute-r1'));
    expect(onToggleMute).toHaveBeenCalledWith('r1');
  });

  it('removes a row', () => {
    const onRemoveRow = vi.fn();
    renderGrid({ onRemoveRow });
    fireEvent.click(screen.getByTestId('row-remove-r2'));
    expect(onRemoveRow).toHaveBeenCalledWith('r2');
  });

  it('selects a row when its header is pressed', () => {
    const onSelectRow = vi.fn();
    renderGrid({ onSelectRow });
    fireEvent.mouseDown(screen.getByTestId('visual-row-r1'));
    expect(onSelectRow).toHaveBeenCalledWith('r1');
  });
});
