import { db } from './db';
import { nanoid } from 'nanoid';
import type { Project } from '@shared/schema';

const PAGE_SIZE = 50;

export async function getAllProjects(page = 1): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray();
}

export async function getProjectCount(): Promise<number> {
  return db.projects.count();
}

export async function getMoreProjects(page: number): Promise<Project[]> {
  return getAllProjects(page);
}

// Serialize project updates so rapid saves don't race
let saveQueue: Promise<any> = Promise.resolve();

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function createProject(data: { name: string; code?: string; bpm?: number }): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: nanoid(),
    name: data.name,
    code: data.code ?? '',
    bpm: data.bpm ?? 120,
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.put(project);
  return project;
}

export async function updateProject(id: string, data: Partial<Pick<Project, 'name' | 'code' | 'bpm'>>): Promise<Project | undefined> {
  saveQueue = saveQueue.then(async () => {
    const existing = await db.projects.get(id);
    if (!existing) return undefined;
    const updated: Project = { ...existing, ...data, updatedAt: Date.now() };
    await db.projects.put(updated);
    return updated;
  }).catch((e: unknown) => { console.error('[project-store] save failed', e); return undefined; });
  return saveQueue;
}

export async function deleteProject(id: string): Promise<boolean> {
  const projectSessions = await db.sessions.where('projectId').equals(id).toArray();
  for (const session of projectSessions) {
    await db.codeSnapshots.where('sessionId').equals(session.id).delete();
    await db.sessions.delete(session.id);
  }
  await db.projects.delete(id);
  return true;
}
