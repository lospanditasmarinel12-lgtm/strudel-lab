import { Button } from "@/components/ui/button";
import { Circle, Square, Pause } from "lucide-react";

interface RecorderControlsProps {
  recording: boolean;
  paused: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onTogglePause: () => void;
}

export default function RecorderControls({
  recording,
  paused,
  onStartRecord,
  onStopRecord,
  onTogglePause,
}: RecorderControlsProps) {
  return (
    <div className="flex items-center gap-1">
      {!recording ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onStartRecord}
          className="h-6 w-6 text-red-500 hover:text-red-400"
          title="Start Recording"
        >
          <Circle size={14} fill="currentColor" />
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onTogglePause}
            className="h-6 w-6 text-yellow-500 hover:text-yellow-400"
            title={paused ? 'Resume' : 'Pause'}
          >
            <Pause size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onStopRecord}
            className="h-6 w-6 text-white hover:text-red-400"
            title="Stop Recording"
          >
            <Square size={14} />
          </Button>
        </>
      )}
    </div>
  );
}
