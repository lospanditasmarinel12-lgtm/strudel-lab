import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllSessions, deleteSession } from "@/lib/stores/session-store";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import { Play, Trash2, Disc3, Circle } from "lucide-react";
import type { RecordingSession } from "@shared/schema";

interface RecordingsPanelProps {
  projectId?: string;
  recording: boolean;
}

export default function RecordingsPanel({ projectId, recording }: RecordingsPanelProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<RecordingSession[]>([]);

  useEffect(() => {
    getAllSessions(projectId).then(setSessions);
  }, [projectId, recording]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const handlePlay = (id: string) => {
    navigate(`/playback/${id}`);
  };

  return (
    <Virtuoso
      className="h-full"
      style={{ height: '100%' }}
      data={sessions}
      itemContent={(index, session) => (
        <div
          className="flex items-center gap-2 px-2 py-2 rounded group text-xs text-muted-foreground hover:text-white hover:bg-strudel-surface-light/50"
        >
          <Disc3 size={12} className="shrink-0" />
          <span className="truncate flex-1">{session.name}</span>
          <span className="text-[9px] text-muted-foreground/50 shrink-0">
            {formatDuration(session.duration)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-strudel-accent"
            onClick={() => handlePlay(session.id)}
          >
            <Play size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
            onClick={e => handleDelete(session.id, e)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      )}
      components={{
        EmptyPlaceholder: () => (
          <div className="p-3 text-xs text-muted-foreground text-center">
            No recordings yet.<br />
            Press record to capture a session.
          </div>
        ),
      }}
    />
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
