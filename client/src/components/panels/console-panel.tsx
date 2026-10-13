import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConsoleMessage {
  text: string;
  level: "info" | "warn" | "error" | "eval";
  timestamp: number;
}

interface ConsolePanelProps {
  messages: ConsoleMessage[];
}

export default function ConsolePanel({ messages }: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 border-b border-strudel-surface-light text-[10px] font-bold text-muted-foreground">
        OUTPUT
      </div>
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-1 font-mono text-[11px]">
          {messages.length === 0 && (
            <div className="p-2 text-muted-foreground text-center italic">
              Ready. Press Ctrl+Enter to evaluate.
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className="py-0.5 px-1 flex gap-2">
              <span className={`shrink-0 ${
                msg.level === 'error' ? 'text-red-400' :
                msg.level === 'warn' ? 'text-yellow-400' :
                msg.level === 'eval' ? 'text-blue-400' :
                'text-green-400'
              }`}>
                [{msg.level === 'error' ? 'ERR' : msg.level === 'warn' ? 'WRN' : msg.level === 'eval' ? '>' : 'OK'}]
              </span>
              <span className={`${
                msg.level === 'error' ? 'text-red-300' :
                msg.level === 'warn' ? 'text-yellow-300' :
                'text-gray-300'
              } break-all`}>
                {msg.text}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
