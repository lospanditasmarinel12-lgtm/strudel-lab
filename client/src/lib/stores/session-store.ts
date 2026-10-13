import { db } from './db';
import { nanoid } from 'nanoid';
import type { RecordingSession, CodeSnapshot, ParsedTrack } from '@shared/schema';

const PAGE_SIZE = 50;

export async function getAllSessions(projectId?: string): Promise<RecordingSession[]> {
  if (projectId) {
    return db.sessions.where({ projectId }).reverse().sortBy('createdAt').then(r => r.reverse().slice(0, PAGE_SIZE));
  }
  return db.sessions.orderBy('createdAt').reverse().limit(PAGE_SIZE).toArray();
}

export async function getMoreSessions(projectId: string | undefined, offset: number): Promise<RecordingSession[]> {
  if (projectId) {
    return db.sessions.where({ projectId }).reverse().sortBy('createdAt').then(r => r.reverse().slice(offset, offset + PAGE_SIZE));
  }
  return db.sessions.orderBy('createdAt').reverse().offset(offset).limit(PAGE_SIZE).toArray();
}

export async function getSession(id: string): Promise<RecordingSession | undefined> {
  return db.sessions.get(id);
}

export async function getSessionSnapshots(sessionId: string): Promise<CodeSnapshot[]> {
  return db.codeSnapshots.where('sessionId').equals(sessionId).sortBy('timestamp');
}

export async function createSession(data: {
  projectId: string;
  name: string;
  bpm: number;
  duration: number;
  audioBlob: Blob;
  snapshots: Omit<CodeSnapshot, 'sessionId'>[];
  tracks: ParsedTrack[];
  finalCode?: string;
}): Promise<RecordingSession> {
  const id = nanoid();
  const session: RecordingSession = {
    id,
    projectId: data.projectId,
    name: data.name,
    bpm: data.bpm,
    duration: data.duration,
    audioBlob: data.audioBlob,
    snapshots: [],
    tracks: data.tracks,
    createdAt: Date.now(),
    finalCode: data.finalCode,
  };
  // Canonical snapshot storage lives in the codeSnapshots table (indexed by
  // sessionId). The session row keeps snapshots: [] to avoid duplicating the
  // full history on every save.
  await db.sessions.put(session);

  const snapshots: CodeSnapshot[] = data.snapshots.map(s => ({
    ...s,
    sessionId: id,
  }));
  await db.codeSnapshots.bulkPut(snapshots);

  return { ...session, snapshots };
}

export async function deleteSession(id: string): Promise<boolean> {
  await db.codeSnapshots.where('sessionId').equals(id).delete();
  await db.sessions.delete(id);
  return true;
}

export async function updateSessionTracks(id: string, tracks: ParsedTrack[]): Promise<void> {
  await db.sessions.update(id, { tracks });
}
