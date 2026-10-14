import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StructureCanvas from './structure-canvas';
import { parse, serialize } from '@/lib/visual/codec';

const CODE = '$: s("bd ~ bd ~")\n\n$: s("~ sd ~ sd")';

describe('StructureCanvas', () => {
  it('renders a node per block', () => {
    const model = parse(CODE);
    render(<StructureCanvas model={model} onChange={() => {}} />);
    expect(screen.getByTestId('structure-canvas')).toBeTruthy();
    expect(screen.getByTestId(`canvas-node-${model.nodes[0].id}`)).toBeTruthy();
    expect(screen.getByTestId(`canvas-node-${model.nodes[1].id}`)).toBeTruthy();
  });

  it('removes a node on delete', () => {
    const model = parse(CODE);
    const onChange = vi.fn();
    render(<StructureCanvas model={model} onChange={onChange} />);
    fireEvent.click(screen.getByTestId(`canvas-remove-${model.nodes[0].id}`));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(serialize(next)).toBe('$: s("~ sd ~ sd")');
  });

  it('reorders nodes', () => {
    const model = parse(CODE);
    const onChange = vi.fn();
    render(<StructureCanvas model={model} onChange={onChange} />);
    fireEvent.click(screen.getByTestId(`canvas-down-${model.nodes[0].id}`));
    const next = onChange.mock.calls[0][0];
    expect(serialize(next)).toBe('$: s("~ sd ~ sd")\n\n$: s("bd ~ bd ~")');
  });

  it('toggles mute', () => {
    const model = parse(CODE);
    const onChange = vi.fn();
    render(<StructureCanvas model={model} onChange={onChange} />);
    fireEvent.click(screen.getByTestId(`canvas-mute-${model.nodes[0].id}`));
    const next = onChange.mock.calls[0][0];
    expect(serialize(next).startsWith('// [muted]')).toBe(true);
  });

  it('wraps all nodes in a stack', () => {
    const model = parse(CODE);
    const onChange = vi.fn();
    render(<StructureCanvas model={model} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('canvas-wrap-stack'));
    const next = onChange.mock.calls[0][0];
    expect(serialize(next).startsWith('stack(')).toBe(true);
  });

  it('wraps all nodes in a cat', () => {
    const model = parse(CODE);
    const onChange = vi.fn();
    render(<StructureCanvas model={model} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('canvas-wrap-cat'));
    const next = onChange.mock.calls[0][0];
    expect(serialize(next).startsWith('cat(')).toBe(true);
  });

  it('renders nested container children', () => {
    const model = parse('stack(s("bd"), s("hh"))');
    render(<StructureCanvas model={model} onChange={() => {}} />);
    const container = model.nodes[0];
    expect(container.kind).toBe('container');
    expect(screen.getByTestId(`canvas-child-${container.id}-0`)).toBeTruthy();
    expect(screen.getByTestId(`canvas-child-${container.id}-1`)).toBeTruthy();
  });
});
