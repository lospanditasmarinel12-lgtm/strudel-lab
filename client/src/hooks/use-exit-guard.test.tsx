import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExitGuard, type ExitGuardOptions } from './use-exit-guard';

function makeOptions(over: Partial<ExitGuardOptions> = {}): ExitGuardOptions {
  return {
    dirty: false,
    canExportLive: true,
    onSave: vi.fn(),
    onExportSong: vi.fn(),
    onExportLive: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
  vi.restoreAllMocks();
});

describe('useExitGuard (web)', () => {
  it('registers a beforeunload handler that prompts when dirty', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useExitGuard(makeOptions({ dirty: true })));

    const call = add.mock.calls.find((c) => c[0] === 'beforeunload');
    expect(call).toBeTruthy();
    const handler = call![1] as (e: BeforeUnloadEvent) => void;
    const event = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('does not prompt when clean', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useExitGuard(makeOptions({ dirty: false })));
    const call = add.mock.calls.find((c) => c[0] === 'beforeunload');
    const handler = call![1] as (e: BeforeUnloadEvent) => void;
    const event = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('useExitGuard (electron)', () => {
  it('opens the dialog on before-close when dirty, and closes after an action', async () => {
    let onBeforeClose: (() => void) | null = null;
    const confirmClose = vi.fn();
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      onBeforeClose: (cb: () => void) => {
        onBeforeClose = cb;
        return () => {};
      },
      confirmClose,
    };

    const options = makeOptions({ dirty: true });
    const { result } = renderHook(() => useExitGuard(options));
    expect(onBeforeClose).toBeTruthy();

    act(() => onBeforeClose!());
    expect(result.current.open).toBe(true);

    await act(async () => {
      await result.current.save();
    });
    expect(options.onSave).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
    expect(confirmClose).toHaveBeenCalled();
  });

  it('closes immediately when clean', () => {
    let onBeforeClose: (() => void) | null = null;
    const confirmClose = vi.fn();
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      onBeforeClose: (cb: () => void) => {
        onBeforeClose = cb;
        return () => {};
      },
      confirmClose,
    };

    const { result } = renderHook(() => useExitGuard(makeOptions({ dirty: false })));
    act(() => onBeforeClose!());
    expect(result.current.open).toBe(false);
    expect(confirmClose).toHaveBeenCalledTimes(1);
  });

  it('exports song and live set through their callbacks', async () => {
    let onBeforeClose: (() => void) | null = null;
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      onBeforeClose: (cb: () => void) => {
        onBeforeClose = cb;
        return () => {};
      },
      confirmClose: vi.fn(),
    };
    const options = makeOptions({ dirty: true });
    const { result } = renderHook(() => useExitGuard(options));
    act(() => onBeforeClose!());

    await act(async () => {
      await result.current.exportSong();
    });
    expect(options.onExportSong).toHaveBeenCalled();

    act(() => onBeforeClose!());
    await act(async () => {
      await result.current.exportLive();
    });
    expect(options.onExportLive).toHaveBeenCalled();

    act(() => onBeforeClose!());
    await act(async () => {
      await result.current.deleteAndExit();
    });
    expect(options.onDelete).toHaveBeenCalled();
  });
});
