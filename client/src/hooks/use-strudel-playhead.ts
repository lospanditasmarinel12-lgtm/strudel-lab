import { useEffect, useState } from 'react';
import { getTime } from '@strudel/web';
import { isPlaying } from '@/lib/strudel-engine';

/**
 * Returns the currently-playing step index within a cycle, driven by the real
 * Strudel clock (`getTime()` returns cycles). `null` when not playing.
 */
export function useStrudelPlayhead(stepsPerCycle: number): number | null {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (stepsPerCycle <= 0) {
      setStep(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      if (isPlaying()) {
        try {
          const t = getTime();
          const frac = t - Math.floor(t);
          setStep(Math.min(stepsPerCycle - 1, Math.floor(frac * stepsPerCycle)));
        } catch {
          /* ignore clock errors */
        }
      } else {
        setStep(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stepsPerCycle]);

  return step;
}
