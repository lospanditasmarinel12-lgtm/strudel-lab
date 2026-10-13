import { useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, FileText } from "lucide-react";
import { deleteProject } from "@/lib/stores/project-store";
import type { Project } from "@shared/schema";

interface ProjectsPanelProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string) => void;
}

export default function ProjectsPanel({
  projects,
  selectedProject,
  onSelectProject,
  onCreateProject,
}: ProjectsPanelProps) {
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateProject(newName.trim());
    setNewName("");
    setOpen(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteProject(id);
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-strudel-surface-light">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              data-testid="new-project"
              className="w-full text-xs text-muted-foreground hover:text-white hover:bg-strudel-surface-light justify-start gap-2"
            >
              <Plus size={14} />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-strudel-surface border-strudel-surface-light">
            <DialogHeader>
              <DialogTitle className="text-white">New Project</DialogTitle>
            </DialogHeader>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Project name..."
              data-testid="project-name-input"
              className="bg-strudel-dark border-strudel-surface-light text-white"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} data-testid="create-project" className="bg-strudel-primary hover:bg-strudel-secondary text-xs">
              Create
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <Virtuoso
        className="flex-1"
        style={{ height: '100%' }}
        data={projects}
        itemContent={(index, project) => (
          <div
            onClick={() => onSelectProject(project)}
            className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer group text-xs ${
              selectedProject?.id === project.id
                ? 'bg-strudel-surface-light text-white'
                : 'text-muted-foreground hover:text-white hover:bg-strudel-surface-light/50'
            }`}
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate flex-1">{project.name}</span>
            <span className="text-[9px] text-muted-foreground/50">
              {project.bpm}bpm
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
              onClick={e => handleDelete(project.id, e)}
            >
              <Trash2 size={12} />
            </Button>
          </div>
        )}
        components={{
          EmptyPlaceholder: () => (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No projects yet
            </div>
          ),
        }}
      />
    </div>
  );
}
