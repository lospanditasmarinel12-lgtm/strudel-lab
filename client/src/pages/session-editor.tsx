import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, getSessionSnapshots, updateSessionTracks } from '@/lib/stores/session-store';
import { TimelineEngine, type TimelineEvent } from '@/lib/timeline-engine';
import TimelinePanel from '@/components/timeline/timeline-panel';
import MonacoEditor from '@/components/editor/monaco-editor';
import { Button } from '@/components/ui/button';
import { Play, Save, ArrowLeft, Trash2 } from 'lucide-react';
import type { RecordingSession, CodeSnapshot } from '@shared/schema';

export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [snapshots, setSnapshots] = useState<CodeSnapshot[]>([]);
  const [currentCode, setCurrentCode] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const engineRef = useRef<TimelineEngine | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
      const sess = await getSession(id);
      if (!sess) return;
      setSession(sess);
      const snaps = await getSessionSnapshots(id);
      setSnapshots(snaps);

      const { resolveSnapshotCodes, buildTracksFromSnapshots } = await import('@/lib/timeline-parser');
      const resolved = resolveSnapshotCodes(snaps);

      const engine = new TimelineEngine({ bpm: sess.bpm, timeSignature: [4, 4] });
      engine.mode = 'editing';
      engine.duration = sess.duration;
      engine.snapshots = resolved.map(s => ({
        timestamp: s.timestamp,
        code: s.code,
        entityId: s.entityId,
      }));

      const parsedTracks = buildTracksFromSnapshots(
        snaps.map(s => ({ timestamp: s.timestamp, code: s.code, entityId: s.entityId, id: s.id, baseSnapshotId: s.baseSnapshotId }))
      );
      for (const pt of parsedTracks) {
        engine.addTrack({
          id: pt.name,
          name: pt.name,
          category: pt.category,
          color: pt.color,
          events: pt.events.map(e => ({
            id: `${pt.name}-${e.startMs}`,
            trackId: pt.name,
            startMs: e.startMs,
            endMs: e.endMs,
            code: e.code,
            entityName: pt.name,
          })),
        });
      }
      engineRef.current = engine;
    } catch (err) { console.error(err); }
    })();
  }, [id]);

  const handleEventDrag = useCallback((eventId: string, newStartMs: number) => {
    engineRef.current?.moveEvent(eventId, newStartMs);
    setSession(s => s ? { ...s } : null);
  }, []);

  const handleEventResize = useCallback((eventId: string, newEndMs: number) => {
    engineRef.current?.resizeEvent(eventId, newEndMs);
    setSession(s => s ? { ...s } : null);
  }, []);

  const handleEventDelete = useCallback((eventId: string) => {
    engineRef.current?.removeEvent(eventId);
    setSelectedEventId(null);
    setSession(s => s ? { ...s } : null);
  }, []);

  const handleEventSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    for (const track of engineRef.current?.tracks || []) {
      const ev = track.events.find(e => e.id === eventId);
      if (ev) {
        setCurrentCode(ev.code);
        return;
      }
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!session || !engineRef.current) return;
    const tracks = engineRef.current.tracks.map(t => ({
      name: t.name,
      category: t.category as any,
      color: t.color,
      events: t.events.map(e => ({
        startMs: e.startMs,
        endMs: e.endMs,
        code: e.code,
      })),
      modifiers: [],
    }));
    await updateSessionTracks(session.id, tracks);
    navigate(`/playback/${session.id}`);
  }, [session, navigate]);

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-strudel-dark">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Session not found</h1>
          <a href="/" className="text-strudel-primary hover:underline">Back to Studio</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-strudel-dark text-white font-mono overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-strudel-surface-light bg-strudel-surface">
        <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-sm font-bold text-strudel-accent flex-1">
          EDIT: {session.name}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          className="text-xs h-7 px-3 bg-strudel-primary hover:bg-strudel-secondary"
        >
          <Save size={14} className="mr-1" />
          SAVE
        </Button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <TimelinePanel
            tracks={engineRef.current?.tracks.map(t => ({
              name: t.name,
              category: t.category as 'drums' | 'bass' | 'melodic' | 'ambient' | 'fx',
              color: t.color,
              events: t.events.map(e => ({
                startMs: e.startMs,
                endMs: e.endMs,
                code: e.code,
                eventId: e.id,
              })),
              modifiers: [],
            })) || []}
            duration={session.duration}
            currentTime={0}
            interactive={true}
            onEventDrag={handleEventDrag}
            onEventResize={handleEventResize}
            onEventSelect={handleEventSelect}
            selectedEventId={selectedEventId || undefined}
          />
        </div>
        <div className="h-1/2 border-t border-strudel-surface-light overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 border-b border-strudel-surface-light bg-strudel-surface">
            <span className="text-xs text-strudel-accent font-bold">EVENT CODE</span>
            {selectedEventId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEventDelete(selectedEventId)}
                className="text-xs h-6 px-2 text-red-400 hover:text-red-300"
              >
                <Trash2 size={12} className="mr-1" />
                DELETE
              </Button>
            )}
          </div>
          <MonacoEditor
            code={currentCode}
            onChange={(newCode) => setCurrentCode(newCode)}
          />
        </div>
      </div>
    </div>
  );
}
