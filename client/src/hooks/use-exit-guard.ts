import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Intercepts app exit and, when there are unsaved changes, surfaces a dialog
 * offering Save / Export / Exit & Delete.
 *
 * - Electron: the main process blocks the window `close` and emits
 *   `app:before-close`; we either show the dialog or call `confirmClose()`.
 * - Web: a `beforeunload` handler triggers the native prompt when dirty.
 */
export interface ExitGuardOptions {
  dirty: boolean;
  canExportLive: boolean;
  onSave: () => void | Promise<void>;
  onExportSong: () => void | Promise<void>;
  onExportLive: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

export interface ExitGuard {
  open: boolean;
  canExportLive: boolean;
  cancel: () => void;
  save: () => Promise<void>;
  exportSong: () => Promise<void>;
  exportLive: () => Promise<void>;
  deleteAndExit: () => Promise<void>;
}

export function useExitGuard(options: ExitGuardOptions): ExitGuard {
  const [open, setOpen] = useState(false);

  const dirtyRef = useRef(options.dirty);
  dirtyRef.current = options.dirty;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const requestClose = useCallback(() => {
    window.electronAPI?.confirmClose?.();
  }, []);

  const run = useCallback(
    async (fn: () => void | Promise<void>) => {
      try {
        await fn();
      } finally {
        setOpen(false);
        requestClose();
      }
    },
    [requestClose],
  );

  useEffect(() => {
    const api = window.electronAPI;
    if (api?.onBeforeClose) {
      return api.onBeforeClose(() => {
        if (dirtyRef.current) setOpen(true);
        else requestClose();
      });
    }
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [requestClose]);

  return {
    open,
    canExportLive: options.canExportLive,
    cancel: () => setOpen(false),
    save: () => run(() => optionsRef.current.onSave()),
    exportSong: () => run(() => optionsRef.current.onExportSong()),
    exportLive: () => run(() => optionsRef.current.onExportLive()),
    deleteAndExit: () => run(() => optionsRef.current.onDelete()),
  };
}
