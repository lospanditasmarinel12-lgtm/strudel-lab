/**
 * DEV-only hooks for end-to-end tests.
 *
 * These let Playwright drive the app deterministically (e.g. inject code the
 * same way a user edit would) and inspect recorder state without reaching into
 * IndexedDB. They are stripped from production builds because `installTestHooks`
 * is a no-op unless Vite reports a development build.
 */
export interface StrudelTestHooks {
  /** Replace the editor code; routed through the same path as a user edit. */
  setCode(code: string): void;
  getCode(): string;
  isRecording(): boolean;
  getSnapshotCount(): number;
  getFinalCode(): string;
  /** Clear onboarding flags (tour + checklist) for deterministic e2e. */
  resetTour(): void;
}

declare global {
  interface Window {
    __strudelTest?: StrudelTestHooks;
  }
}

export function installTestHooks(hooks: StrudelTestHooks): void {
  if (import.meta.env.DEV) {
    window.__strudelTest = hooks;
  }
}
