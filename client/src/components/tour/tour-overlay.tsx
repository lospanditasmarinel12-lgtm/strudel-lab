import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { TourStep } from '@/lib/tour/steps';

export interface TourOverlayProps {
  step: TourStep | null;
  stepIndex: number;
  total: number;
  canAdvance: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const POPOVER_WIDTH = 320;
const GAP = 12;

function popoverStyle(rect: DOMRect | null, placement: TourStep['placement']): CSSProperties {
  if (!rect) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  }
  const pad = 6;
  const left = rect.left - pad;
  const top = rect.top - pad;
  const width = rect.width + pad * 2;
  const height = rect.height + pad * 2;
  switch (placement) {
    case 'left':
      return { left, top: top + height / 2, transform: `translate(calc(-100% - ${GAP}px), -50%)` };
    case 'right':
      return { left: left + width, top: top + height / 2, transform: `translate(${GAP}px, -50%)` };
    case 'top':
      return { left: left + width / 2, top, transform: `translate(-50%, calc(-100% - ${GAP}px))` };
    default:
      return { left: left + width / 2, top: top + height, transform: `translate(-50%, ${GAP}px)` };
  }
}

/**
 * Full-screen coach-mark overlay. The dim layer uses a large box-shadow cutout
 * and is `pointer-events: none`, so the highlighted control stays fully usable.
 */
export default function TourOverlay({
  step,
  stepIndex,
  total,
  canAdvance,
  onNext,
  onBack,
  onSkip,
}: TourOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog when the step changes (without stealing it from
  // the highlighted control, which stays clickable).
  useEffect(() => {
    popoverRef.current?.focus();
  }, [step?.id]);

  useLayoutEffect(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const target = step.target;
    const measure = () => {
      const el = document.querySelector(`[data-testid="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step?.target, stepIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      else if (e.key === 'ArrowRight' && canAdvance) onNext();
      else if (e.key === 'ArrowLeft' && stepIndex > 0) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canAdvance, onNext, onBack, onSkip, stepIndex]);

  if (!step) return null;

  const pad = 6;
  const spotlight = rect
    ? {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const style = popoverStyle(rect, step.placement);
  const gated = !!step.advanceWhen && !canAdvance;

  return createPortal(
    <div
      data-testid="tour-root"
      className="fixed inset-0 z-[100] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      {spotlight ? (
        <div
          className="fixed rounded-md transition-[left,top,width,height] duration-200 motion-reduce:transition-none"
          style={{ ...spotlight, boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)' }}
          aria-hidden="true"
        />
      ) : (
        <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      )}

      <div
        ref={popoverRef}
        tabIndex={-1}
        data-testid="tour-popover"
        className="fixed pointer-events-auto bg-strudel-surface border border-strudel-surface-light rounded-lg shadow-xl p-4 font-mono text-white outline-none"
        style={{ ...style, width: POPOVER_WIDTH, maxWidth: 'calc(100vw - 24px)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wide text-strudel-accent">
            {step.optional ? 'Optional' : `Step ${stepIndex + 1} of ${total}`}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {stepIndex + 1}/{total}
          </span>
        </div>

        <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed" aria-live="polite">
          {step.body}
        </p>

        {gated && (
          <p className="text-[11px] text-strudel-accent mt-2" data-testid="tour-hint">
            Perform the highlighted action to continue.
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            data-testid="tour-skip"
            onClick={onSkip}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-white"
          >
            Skip tour
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            data-testid="tour-back"
            onClick={onBack}
            disabled={stepIndex === 0}
            className="h-7 px-2 text-xs border-strudel-surface-light"
          >
            Back
          </Button>
          <Button
            size="sm"
            data-testid="tour-next"
            onClick={onNext}
            disabled={gated}
            className="h-7 px-3 text-xs bg-strudel-accent text-black hover:bg-strudel-accent/90"
          >
            {stepIndex + 1 === total ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
