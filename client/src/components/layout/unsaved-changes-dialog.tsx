import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Save, Download, FileCode, Trash2 } from 'lucide-react';

export interface UnsavedChangesDialogProps {
  open: boolean;
  canExportLive: boolean;
  onSave: () => void;
  onExportSong: () => void;
  onExportLive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

/**
 * Shown when the app is closing with unsaved changes. Offers to persist the
 * project, export it as a Song / Live set, or discard it by deleting it.
 */
export default function UnsavedChangesDialog({
  open,
  canExportLive,
  onSave,
  onExportSong,
  onExportLive,
  onDelete,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent
        data-testid="unsaved-dialog"
        className="bg-strudel-surface border-strudel-surface-light text-white font-mono"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-strudel-accent">Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            You have changes that haven't been saved or exported. What would you like to do before
            exiting?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            data-testid="unsaved-save"
            onClick={onSave}
            className="w-full justify-start bg-strudel-accent text-black hover:bg-strudel-accent/90"
          >
            <Save size={14} className="mr-2" /> Save &amp; exit
          </Button>
          <Button
            data-testid="unsaved-export-song"
            variant="outline"
            onClick={onExportSong}
            className="w-full justify-start border-strudel-surface-light"
          >
            <FileCode size={14} className="mr-2" /> Export Song (.strudel)
          </Button>
          <Button
            data-testid="unsaved-export-live"
            variant="outline"
            onClick={onExportLive}
            disabled={!canExportLive}
            title={canExportLive ? 'Export the performance timeline' : 'No recording to export'}
            className="w-full justify-start border-strudel-surface-light"
          >
            <Download size={14} className="mr-2" /> Export Live set
          </Button>
          <Button
            data-testid="unsaved-delete"
            variant="outline"
            onClick={onDelete}
            className="w-full justify-start border-strudel-surface-light text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} className="mr-2" /> Exit &amp; delete
          </Button>
          <Button
            data-testid="unsaved-cancel"
            variant="ghost"
            onClick={onCancel}
            className="w-full justify-start text-muted-foreground hover:text-white"
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
