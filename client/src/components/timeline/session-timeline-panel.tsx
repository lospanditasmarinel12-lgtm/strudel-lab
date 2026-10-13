import { useEffect, useRef, useCallback } from "react";

interface SessionTimelineSnapshot {
  timestamp: number;
  code: string;
  id: string;
  actionType: string;
}

interface SessionTimelinePanelProps {
  snapshots: SessionTimelineSnapshot[];
  duration: number;
  currentTime: number;
  currentSnapshotId?: string;
  editable?: boolean;
  onSeek?: (ms: number) => void;
  onSnapshotSelect?: (id: string) => void;
  onSnapshotEdit?: (id: string, newCode: string) => void;
  onSnapshotDelete?: (id: string) => void;
  onSnapshotAdd?: (timestamp: number) => void;
}

const MARKER_COLORS: Record<string, string> = {
  edit: '#3b82f6',
  evaluate: '#22c55e',
  play: '#06b6d4',
  stop: '#ef4444',
  bpm_change: '#eab308',
};

const DIAMOND_HW = 6;
const DIAMOND_HH = 8;

export default function SessionTimelinePanel({
  snapshots, duration, currentTime,
  currentSnapshotId,
  editable = false,
  onSeek, onSnapshotSelect,
}: SessionTimelinePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftMargin = 60;

  const getXFromMs = useCallback((ms: number, w: number, trackArea: number, displayDuration: number) => {
    return leftMargin + (ms / displayDuration) * trackArea;
  }, []);

  const getMsFromX = useCallback((x: number, w: number, trackArea: number, displayDuration: number) => {
    return Math.max(0, ((x - leftMargin) / trackArea) * displayDuration);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    if (y < 20 && onSeek) {
      const ms = getMsFromX(x, w, trackArea, displayDuration);
      onSeek(ms);
      return;
    }

    if (y >= 20) {
      for (const snap of snapshots) {
        const sx = getXFromMs(snap.timestamp, w, trackArea, displayDuration);
        const sy = 24;
        const dx = x - sx;
        const dy = y - sy;
        if (Math.abs(dx) <= DIAMOND_HW && Math.abs(dy) <= DIAMOND_HH) {
          onSnapshotSelect?.(snap.id);
          return;
        }
      }
    }
  }, [snapshots, duration, onSeek, onSnapshotSelect, leftMargin, getXFromMs, getMsFromX]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    // Time ruler
    ctx.fillStyle = '#6B7280';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let t = 0; t <= displayDuration; t += 2000) {
      const x = leftMargin + (t / displayDuration) * trackArea;
      ctx.fillText(formatTimeRuler(t), x, 12);
      ctx.strokeStyle = '#1E1B4B';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Playhead
    if (currentTime > 0) {
      const px = leftMargin + (currentTime / displayDuration) * trackArea;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 18);
      ctx.lineTo(px, h);
      ctx.stroke();
    }

    // Snapshot markers
    for (const snap of snapshots) {
      const sx = leftMargin + (snap.timestamp / displayDuration) * trackArea;
      const sy = 24;
      const color = MARKER_COLORS[snap.actionType] || '#6B7280';
      const isSelected = snap.id === currentSnapshotId;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - DIAMOND_HH);
      ctx.lineTo(sx + DIAMOND_HW, sy);
      ctx.lineTo(sx, sy + DIAMOND_HH);
      ctx.lineTo(sx - DIAMOND_HW, sy);
      ctx.closePath();
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Small code preview snippet below the diamond
      if (isSelected || editable) {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const snippet = snap.code.replace(/^s\("?|"?\).*$|".*$/g, '').substring(0, 20);
        ctx.fillText(snippet, sx, sy + DIAMOND_HH + 10);
      }
    }

    if (snapshots.length === 0) {
      ctx.fillStyle = '#6B7280';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No snapshots — record a session first', w / 2, h / 2);
    }
  }, [snapshots, duration, currentTime, currentSnapshotId]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', minHeight: '80px', cursor: 'pointer' }}
      onMouseDown={handleMouseDown}
    />
  );
}

function formatTimeRuler(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${sec}s`;
}
