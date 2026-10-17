import * as Blockly from 'blockly/core';

let theme: Blockly.Theme | null = null;

/** Phosphor/Oscilloscope theme (base Zelos = Scratch-like blocks). */
export function getStrudelTheme(): Blockly.Theme {
  if (theme) return theme;
  theme = Blockly.Theme.defineTheme('strudel', {
    name: 'strudel',
    base: Blockly.Themes.Zelos,
    componentStyles: {
      workspaceBackgroundColour: '#0A0C0B',
      toolboxBackgroundColour: '#121816',
      toolboxForegroundColour: '#E6EFE9',
      flyoutBackgroundColour: '#121816',
      flyoutForegroundColour: '#E6EFE9',
      flyoutOpacity: 0.96,
      scrollbarColour: '#1E2A26',
      scrollbarOpacity: 0.6,
      insertionMarkerColour: '#FFB000',
      insertionMarkerOpacity: 0.4,
      cursorColour: '#FFB000',
      markerColour: '#4BE38A',
    },
    fontStyle: { family: 'JetBrains Mono, monospace', weight: 'normal', size: 11 },
  });
  return theme;
}
