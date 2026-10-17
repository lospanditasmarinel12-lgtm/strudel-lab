import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { HelpCircle, GraduationCap, Sparkles, Keyboard, RotateCcw, BookOpen } from 'lucide-react';
import { EXAMPLES, type Example } from '@/lib/examples';

export interface HelpMenuProps {
  onReplayTour: () => void;
  onLoadExample: (example: Example) => void;
  onResetOnboarding: () => void;
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const rows: Array<[string, string]> = [
    ['Ctrl / ⌘ + Enter', 'Evaluate the pattern'],
    ['Ctrl / ⌘ + F', 'Toggle focus mode'],
    ['Space', 'Play / stop'],
    ['Esc', 'Skip the guided tour'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="shortcuts-dialog" className="bg-strudel-surface border-strudel-surface-light text-white font-mono">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="text-xs">
          {rows.map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between py-1.5 border-b border-strudel-surface-light last:border-0">
              <span className="text-strudel-accent">{keys}</span>
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HelpMenu({ onReplayTour, onLoadExample, onResetOnboarding }: HelpMenuProps) {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid="help-button"
            className="h-7 px-2 font-display text-xs text-muted-foreground hover:text-white"
            title="Help & tutorial"
          >
            <HelpCircle size={14} className="mr-1" />
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-strudel-surface border-strudel-surface-light text-white text-xs">
          <DropdownMenuItem data-testid="help-replay-tour" onSelect={onReplayTour}>
            <GraduationCap size={12} className="mr-2" />
            Replay tour
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="help-examples" onSelect={() => setExamplesOpen(true)}>
            <Sparkles size={12} className="mr-2" />
            Examples…
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="help-shortcuts" onSelect={() => setShortcutsOpen(true)}>
            <Keyboard size={12} className="mr-2" />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="help-reset" onSelect={onResetOnboarding}>
            <RotateCcw size={12} className="mr-2" />
            Reset tutorial
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => window.open('https://strudel.cc/learn/', '_blank', 'noopener')}
          >
            <BookOpen size={12} className="mr-2" />
            Strudel docs
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={examplesOpen} onOpenChange={setExamplesOpen}>
        <DialogContent data-testid="examples-dialog" className="bg-strudel-surface border-strudel-surface-light text-white font-mono">
          <DialogHeader>
            <DialogTitle>Examples</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Load a starter pattern as a new project.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                data-testid={`example-${example.id}`}
                onClick={() => {
                  onLoadExample(example);
                  setExamplesOpen(false);
                }}
                className="text-left p-2 rounded border border-strudel-surface-light hover:bg-strudel-surface-light/50 transition-colors"
              >
                <div className="text-sm text-strudel-accent">{example.name}</div>
                <div className="text-xs text-muted-foreground">{example.description}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
