import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SubPatternEditor from './sub-pattern-editor';
import type { GridPatternNode } from '@/lib/visual/visual-model';

function pattern(): GridPatternNode {
  return {
    kind: 'grid',
    id: 'p',
    rowKind: 'drum',
    steps: [
      { t: 'token', value: 'bd' },
      { t: 'rest' },
      { t: 'group', op: 'seq', children: [{ t: 'token', value: 'sd' }, { t: 'token', value: 'cp' }] },
    ],
    effects: [],
  };
}

describe('SubPatternEditor', () => {
  it('toggles a simple token cell to a rest', () => {
    const onChange = vi.fn();
    render(<SubPatternEditor pattern={pattern()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('sub-cell-0'));
    const next = onChange.mock.calls[0][0] as GridPatternNode;
    expect(next.steps[0]).toEqual({ t: 'rest' });
  });

  it('toggles a rest cell back on', () => {
    const onChange = vi.fn();
    render(<SubPatternEditor pattern={pattern()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('sub-cell-1'));
    const next = onChange.mock.calls[0][0] as GridPatternNode;
    expect(next.steps[1].t).toBe('token');
  });

  it('edits a complex cell via the mini-notation input', () => {
    const onChange = vi.fn();
    render(<SubPatternEditor pattern={pattern()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('sub-cell-2'));
    const input = screen.getByTestId('sub-input-2');
    fireEvent.change(input, { target: { value: 'sd' } });
    fireEvent.blur(input);
    const next = onChange.mock.calls[0][0] as GridPatternNode;
    expect(next.steps[2]).toEqual({ t: 'token', value: 'sd' });
  });

  it('splices multiple cells when the input expands', () => {
    const onChange = vi.fn();
    render(<SubPatternEditor pattern={pattern()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('sub-cell-2'));
    const input = screen.getByTestId('sub-input-2');
    fireEvent.change(input, { target: { value: 'sd cp' } });
    fireEvent.blur(input);
    const next = onChange.mock.calls[0][0] as GridPatternNode;
    expect(next.steps).toHaveLength(4);
    expect(next.steps[2]).toEqual({ t: 'token', value: 'sd' });
    expect(next.steps[3]).toEqual({ t: 'token', value: 'cp' });
  });
});
