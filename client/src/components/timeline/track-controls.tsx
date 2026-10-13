import { useCallback, useState } from 'react';
import type { ParsedTrack } from '@shared/schema';
import { isSliderModifier, getModifierDef, getModifierCategory } from '@/lib/modifier-registry';
import { ChevronDown, ChevronRight, Sliders } from 'lucide-react';

interface TrackControlsProps {
  tracks: ParsedTrack[];
  code: string;
  onCodeChange: (code: string) => void;
}

const COMMON_MODS = new Set(['gain', 'lpf', 'hpf', 'delay', 'room', 'fast']);

export default function TrackControls({ tracks, code, onCodeChange }: TrackControlsProps) {
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(new Set());
  const [compactMode, setCompactMode] = useState(true);

  const toggleTrack = useCallback((name: string) => {
    setExpandedTracks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleModifierChange = useCallback((lineIndex: number, modName: string, newValue: number) => {
    const lines = code.split('\n');
    const line = lines[lineIndex];
    if (!line) return;
    const regex = new RegExp(`\\.${modName}\\(([0-9]*\\.?[0-9]+)\\)`);
    const newLine = line.replace(regex, `.${modName}(${newValue})`);
    if (newLine === line) return;
    lines[lineIndex] = newLine;
    onCodeChange(lines.join('\n'));
  }, [code, onCodeChange]);

  const filteredTracks = tracks.filter(t => t.modifiers.some(m => isSliderModifier(m.name)));
  if (filteredTracks.length === 0) return null;

  return (
    <div className="bg-strudel-dark border-t border-strudel-surface-light">
      <div className="flex items-center justify-between px-2 py-1 border-b border-strudel-surface-light">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-3 h-3 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground font-bold uppercase">Track Controls</span>
          <span className="text-[8px] text-muted-foreground">({filteredTracks.length} tracks)</span>
        </div>
        <button
          onClick={() => setCompactMode(c => !c)}
          className="text-[8px] text-muted-foreground hover:text-white transition-colors uppercase"
        >
          {compactMode ? 'Show All' : 'Compact'}
        </button>
      </div>
      {filteredTracks.map(track => {
        const isExpanded = expandedTracks.has(track.name);
        const mods = track.modifiers.filter(m => isSliderModifier(m.name));
        const visibleMods = compactMode ? mods.filter(m => COMMON_MODS.has(m.name)) : mods;
        if (compactMode && visibleMods.length === 0) return null;

        return (
          <div key={track.name} className="border-b border-strudel-surface-light last:border-b-0">
            <button
              onClick={() => toggleTrack(track.name)}
              className="flex items-center gap-2 w-full px-2 py-1 hover:bg-strudel-surface-light/50 transition-colors text-left"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: track.color }}
              />
              <span className="text-[10px] text-white font-mono truncate flex-1">{track.name}</span>
              <span className="text-[8px] text-muted-foreground">{visibleMods.length} mods</span>
              {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </button>
            {isExpanded && (
              <div className="px-2 pb-1.5">
                {visibleMods.map((mod, i) => {
                  const def = getModifierDef(mod.name);
                  const min = def?.defaultMin ?? 0;
                  const max = def?.defaultMax ?? 1;
                  const step = def?.defaultStep ?? 0.01;
                  const cat = getModifierCategory(mod.name);
                  return (
                    <div key={`${mod.name}-${i}`} className="flex items-center gap-2 py-[2px] group">
                      <span className="text-[8px] text-muted-foreground w-6 shrink-0 font-mono">{cat === 'audio' ? '🎛' : cat === 'pattern' ? '🔁' : '⚙'}</span>
                      <span className="text-[9px] text-muted-foreground w-8 shrink-0 font-mono">{mod.name}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={mod.value}
                        onChange={(e) => handleModifierChange(mod.lineIndex, mod.name, parseFloat(e.target.value))}
                        className="flex-1 h-1 accent-strudel-accent cursor-pointer min-w-0"
                        style={{ height: 3 }}
                      />
                      <span className="text-[9px] text-muted-foreground font-mono w-12 text-right tabular-nums">{mod.value.toFixed(step < 0.1 ? 2 : 1)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
