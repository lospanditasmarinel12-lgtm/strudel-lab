import { useEffect, useRef, useCallback } from "react";
import type { ParsedTrack } from "@shared/schema";

interface TimelinePanelProps {
  tracks: ParsedTrack[];
  duration: number;
  currentTime: number;
  interactive?: boolean;
  onSeek?: (ms: number) => void;
  onEventDrag?: (eventId: string, newStartMs: number) => void;
  onEventResize?: (eventId: string, newEndMs: number) => void;
  onEventSelect?: (eventId: string) => void;
  selectedEventId?: string;
}

export default function TimelinePanel({
  tracks, duration, currentTime,
  interactive = false,
  onSeek, onEventDrag, onEventResize, onEventSelect,
  selectedEventId,
}: TimelinePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const leftMargin = 80;

  const getXFromMs = useCallback((ms: number, w: number, trackArea: number, displayDuration: number) => {
    return leftMargin + (ms / displayDuration) * trackArea;
  }, []);

  const getMsFromX = useCallback((x: number, w: number, trackArea: number, displayDuration: number) => {
    return Math.max(0, ((x - leftMargin) / trackArea) * displayDuration);
  }, []);

  const findEventAtPosition = useCallback((x: number, y: number, w: number, h: number) => {
    const trackHeight = Math.min(28, (h - 24) / Math.max(tracks.length, 1));
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const ty = 20 + i * trackHeight;
      if (y < ty || y > ty + trackHeight) continue;

      for (const event of track.events) {
        const ex = getXFromMs(event.startMs, w, trackArea, displayDuration);
        const ew = Math.max(((event.endMs - event.startMs) / displayDuration) * trackArea, 3);
        if (x >= ex && x <= ex + ew) {
          const edgeThreshold = 6;
          if (x <= ex + edgeThreshold) return { event, resize: 'start' as const };
          if (x >= ex + ew - edgeThreshold) return { event, resize: 'end' as const };
          return { event, resize: 'move' as const };
        }
      }
    }
    return null;
  }, [tracks, duration, leftMargin, getXFromMs]);

  const isDraggingRef = useRef(false);
  const dragTypeRef = useRef<'seek' | 'move' | 'resize' | null>(null);
  const dragEventIdRef = useRef<string | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartMsRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    if (y < 20) {
      const trackArea = w - leftMargin - 10;
      const displayDuration = Math.max(duration, 10000);
      const ms = getMsFromX(x, w, trackArea, displayDuration);
      dragTypeRef.current = 'seek';
      isDraggingRef.current = true;
      onSeek?.(ms);
      return;
    }

    const hit = findEventAtPosition(x, y, w, h);
    if (hit) {
      isDraggingRef.current = true;
      dragEventIdRef.current = (hit.event as any).id || `${hit.event.startMs}`;
      dragTypeRef.current = hit.resize as 'seek' | 'move' | 'resize';
      dragStartXRef.current = x;
      dragStartMsRef.current = hit.event.startMs;
      if (dragEventIdRef.current) onEventSelect?.(dragEventIdRef.current);
    } else {
      onEventSelect?.('');
    }
  }, [interactive, onSeek, onEventSelect, findEventAtPosition, leftMargin, getMsFromX, duration]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    if (dragTypeRef.current === 'seek') {
      const ms = getMsFromX(x, w, trackArea, displayDuration);
      onSeek?.(ms);
    } else if (dragTypeRef.current === 'move' && dragEventIdRef.current) {
      const dx = x - dragStartXRef.current;
      const dMs = (dx / trackArea) * displayDuration;
      onEventDrag?.(dragEventIdRef.current, Math.max(0, dragStartMsRef.current + dMs));
    } else if (dragTypeRef.current === 'resize' && dragEventIdRef.current) {
      const dx = x - dragStartXRef.current;
      const dMs = (dx / trackArea) * displayDuration;
      onEventResize?.(dragEventIdRef.current, dragStartMsRef.current + dMs);
    }
  }, [interactive, onSeek, onEventDrag, onEventResize, leftMargin, getMsFromX, duration]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragTypeRef.current = null;
    dragEventIdRef.current = null;
  }, []);

  const dpiRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    dpiRef.current = true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (!dpiRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dpiRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const leftMargin = 80;
    const trackHeight = Math.min(28, (h - 24) / Math.max(tracks.length, 1));
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    ctx.fillStyle = '#0A0C0B';
    ctx.fillRect(0, 0, w, h);

    // Time ruler
    ctx.fillStyle = '#93A69E';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let t = 0; t <= displayDuration; t += 2000) {
      const x = leftMargin + (t / displayDuration) * trackArea;
      ctx.fillText(formatTimeRuler(t), x, 12);
      ctx.strokeStyle = '#1E2A26';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Playhead
    if (currentTime > 0) {
      const px = leftMargin + (currentTime / displayDuration) * trackArea;
      ctx.strokeStyle = '#E6EFE9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 18);
      ctx.lineTo(px, h);
      ctx.stroke();
    }

    // Tracks
    tracks.forEach((track, i) => {
      const y = 20 + i * trackHeight;

      // Track label
      ctx.fillStyle = track.color;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(track.name, leftMargin - 6, y + trackHeight / 2 + 4);

      // Track bg
      ctx.fillStyle = i % 2 === 0 ? '#0A0C0B' : '#101713';
      ctx.fillRect(leftMargin, y, trackArea, trackHeight);

      // Track separator
      ctx.strokeStyle = '#1A2622';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y + trackHeight);
      ctx.lineTo(w, y + trackHeight);
      ctx.stroke();

      // Events
      track.events.forEach(event => {
        const ex = leftMargin + (event.startMs / displayDuration) * trackArea;
        const ew = Math.max(
          ((event.endMs - event.startMs) / displayDuration) * trackArea,
          3
        );

        ctx.fillStyle = track.color + '88';
        ctx.fillRect(ex, y + 2, ew, trackHeight - 4);
        ctx.fillStyle = track.color;
        ctx.fillRect(ex, y + 2, Math.min(ew, 3), trackHeight - 4);

        if (selectedEventId && ((event as any).id || `${event.startMs}`) === selectedEventId) {
          ctx.strokeStyle = '#E6EFE9';
          ctx.lineWidth = 2;
          ctx.strokeRect(ex, y + 2, ew, trackHeight - 4);
        }
      });
    });

    if (tracks.length === 0) {
      ctx.fillStyle = '#93A69E';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No tracks — press ● to start recording', w / 2, h / 2);
    }
  }, [tracks, duration, currentTime]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%', cursor: interactive ? 'pointer' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}

function formatTimeRuler(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${sec}s`;
}
