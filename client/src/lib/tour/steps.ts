import type { TourSignals } from './signals';

/** Imperative actions a step may use to reveal its target. */
export interface TourActions {
  openRightPanel(tab: string): void;
  setTimeline(on: boolean): void;
  setVisual(on: boolean): void;
}

export interface TourStep {
  id: string;
  /** `data-testid` to spotlight; omitted => centered card. */
  target?: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Runs when the step becomes active (e.g. open a panel). */
  setup?: (actions: TourActions) => void;
  /** Action gate: advance when this flips true relative to the step baseline. */
  advanceWhen?: (signals: TourSignals, baseline: TourSignals) => boolean;
  /** Hardware/peripheral steps the user may skip. */
  optional?: boolean;
}

/**
 * The guided walkthrough. Every step (except the welcome) is gated by a real
 * user action, evaluated against the signals snapshot captured when the step
 * became active.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Strudel Lab',
    body: 'A quick, hands-on tour. You will build a pattern, play it, add samples, record, and export — all on the real interface. Press Next to begin, or Skip anytime.',
  },
  {
    id: 'editor-toggle',
    title: 'Two ways to edit',
    body: 'You can write music with puzzle-piece Blocks or with text Code. Both edit the same pattern. Click Code to try the text view.',
    target: 'code-toggle',
    placement: 'bottom',
    advanceWhen: (s, b) => s.showVisual !== b.showVisual,
  },
  {
    id: 'build-pattern',
    title: 'Build a pattern',
    body: 'Back in Blocks. Drag a sound block from the toolbox, or edit a field — any change to the pattern continues the tour.',
    target: 'blockly-workspace',
    placement: 'bottom',
    setup: (a) => a.setVisual(true),
    advanceWhen: (s, b) => s.codeVersion > b.codeVersion,
  },
  {
    id: 'play',
    title: 'Play it',
    body: 'Press Play (or Ctrl+Enter). If audio is not ready yet, click anywhere first, then press Play.',
    target: 'play-button',
    placement: 'bottom',
    advanceWhen: (s, b) => s.playing && !b.playing,
  },
  {
    id: 'live',
    title: 'Live mode',
    body: 'Live mode re-evaluates automatically a moment after you stop typing — perfect for live coding. Toggle it on.',
    target: 'live-toggle',
    placement: 'bottom',
    advanceWhen: (s, b) => s.liveMode !== b.liveMode,
  },
  {
    id: 'timeline',
    title: 'The timeline',
    body: 'The timeline shows the tracks in your pattern and lets you scrub through a performance. Open it.',
    target: 'timeline-toggle',
    placement: 'bottom',
    advanceWhen: (s, b) => s.showTimeline !== b.showTimeline,
  },
  {
    id: 'samples',
    title: 'Samples panel',
    body: 'The right panel is your sound library, console, MIDI, and sessions. Open Samples.',
    target: 'panel-tab-samples',
    placement: 'left',
    setup: (a) => a.openRightPanel('samples'),
    advanceWhen: (s, b) => s.rightPanelTab === 'samples' && b.rightPanelTab !== 'samples',
  },
  {
    id: 'insert-sound',
    title: 'Insert a sound',
    body: 'Click a sample to drop it into your pattern.',
    target: 'sample-item',
    placement: 'left',
    advanceWhen: (s, b) => s.sampleInserted > b.sampleInserted,
  },
  {
    id: 'add-effect',
    title: 'Add an effect',
    body: 'The Modifiers tab lists effects like lpf, delay and room. Add one, or tweak the pattern — any change continues.',
    target: 'sample-item',
    placement: 'left',
    advanceWhen: (s, b) => s.codeVersion > b.codeVersion,
  },
  {
    id: 'console',
    title: 'The console',
    body: 'Errors and status messages appear here. Open it to see what the engine is doing.',
    target: 'panel-tab-console',
    placement: 'left',
    setup: (a) => a.openRightPanel('console'),
    advanceWhen: (s, b) => s.rightPanelTab === 'console' && b.rightPanelTab !== 'console',
  },
  {
    id: 'record',
    title: 'Record a session',
    body: 'Recording captures your audio and every edit you make. Start recording.',
    target: 'record-button',
    placement: 'bottom',
    advanceWhen: (s, b) => s.recording && !b.recording,
  },
  {
    id: 'edit-while-recording',
    title: 'Edit while recording',
    body: 'Keep editing — each change is snapshotted so the performance can be replayed exactly. Make any edit.',
    target: 'blockly-workspace',
    placement: 'bottom',
    setup: (a) => a.setVisual(true),
    advanceWhen: (s, b) => s.codeVersion > b.codeVersion,
  },
  {
    id: 'stop-save',
    title: 'Stop & save',
    body: 'Stop recording to save the session to this project.',
    target: 'record-button',
    placement: 'bottom',
    advanceWhen: (s, b) => !s.recording && b.recording,
  },
  {
    id: 'session-panel',
    title: 'Sessions & replay',
    body: 'Your recordings live in the Session panel, where you can load and replay them. Open it.',
    target: 'panel-tab-session',
    placement: 'left',
    setup: (a) => a.openRightPanel('session'),
    advanceWhen: (s, b) => s.rightPanelTab === 'session' && b.rightPanelTab !== 'session',
  },
  {
    id: 'export',
    title: 'Export your work',
    body: 'Export a runnable Song (.strudel) or a re-enactable Live Set. Export the Song.',
    target: 'export-song',
    placement: 'left',
    advanceWhen: (s, b) => s.exported > b.exported,
  },
  {
    id: 'autosave',
    title: 'Auto-save',
    body: 'Projects auto-save as you work. Toggle auto-save to see the control, then leave it on.',
    target: 'auto-save-switch',
    placement: 'bottom',
    advanceWhen: (s, b) => s.autoSaveOn !== b.autoSaveOn,
  },
  {
    id: 'media',
    title: 'MIDI & microphone (optional)',
    body: 'The Media tab offers microphone capture; the MIDI tab maps controllers. Open Media, or skip this step.',
    target: 'panel-tab-media',
    placement: 'left',
    optional: true,
    setup: (a) => a.openRightPanel('media'),
    advanceWhen: (s, b) => s.rightPanelTab === 'media' && b.rightPanelTab !== 'media',
  },
];

/** Testids the tour relies on — kept in one place so `steps.test.ts` can verify them. */
export const TOUR_TARGETS = Array.from(
  new Set(TOUR_STEPS.map((s) => s.target).filter((t): t is string => !!t)),
);
