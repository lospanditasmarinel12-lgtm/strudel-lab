import { memo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectsPanel from "./projects-panel";
import RecordingsPanel from "./recordings-panel";
import { FolderOpen, Disc3, Music } from "lucide-react";
import type { Project } from "@shared/schema";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string) => void;
  recording: boolean;
}

export default memo(function Sidebar({
  activeTab,
  onTabChange,
  projects,
  selectedProject,
  onSelectProject,
  onCreateProject,
  recording,
}: SidebarProps) {
  return (
    <div className="w-64 border-r border-strudel-surface-light bg-strudel-surface flex flex-col">
      <div className="px-3 py-3 border-b border-strudel-surface-light">
        <div className="flex items-center gap-2">
          <Music size={18} className="text-strudel-primary" />
          <span className="text-sm font-bold tracking-wider text-strudel-primary">
            STRUDEL LIVE
          </span>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="flex flex-col flex-1"
      >
        <TabsList className="w-full rounded-none border-b border-strudel-surface-light bg-strudel-surface p-0 h-8">
          <TabsTrigger
            value="projects"
            className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-[10px] gap-1"
          >
            <FolderOpen size={12} />
            PROJECTS
          </TabsTrigger>
          <TabsTrigger
            value="recordings"
            className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-[10px] gap-1"
          >
            <Disc3 size={12} />
            RECS
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-hidden">
          {activeTab === "projects" && (
            <ProjectsPanel
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={onSelectProject}
              onCreateProject={onCreateProject}
            />
          )}
          {activeTab === "recordings" && (
            <RecordingsPanel
              projectId={selectedProject?.id}
              recording={recording}
            />
          )}
        </div>
      </Tabs>
    </div>
  );
});
