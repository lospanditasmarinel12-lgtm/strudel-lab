/**
 * The slice of app state the guided tour observes to gate its steps.
 *
 * Studio builds this object from existing state and passes it to `useTour`,
 * which compares the current values against a per-step baseline so "toggle X"
 * gates are reliable.
 */
export interface TourSignals {
  showVisual: boolean;
  showTimeline: boolean;
  autoSaveOn: boolean;
  rightPanelTab: string;
  sidebarTab: string;
  playing: boolean;
  liveMode: boolean;
  recording: boolean;
  hasSession: boolean;
  /** Increments on every code change. */
  codeVersion: number;
  /** Increments when a sample or effect is inserted. */
  sampleInserted: number;
  /** Increments on any Song / Live-set export. */
  exported: number;
}

export const INITIAL_SIGNALS: TourSignals = {
  showVisual: true,
  showTimeline: false,
  autoSaveOn: true,
  rightPanelTab: 'samples',
  sidebarTab: 'projects',
  playing: false,
  liveMode: false,
  recording: false,
  hasSession: false,
  codeVersion: 0,
  sampleInserted: 0,
  exported: 0,
};
