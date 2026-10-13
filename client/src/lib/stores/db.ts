import Dexie, { type Table } from 'dexie';
import type { Project, CodeSnapshot, RecordingSession } from '@shared/schema';
import { debugLog } from '@/lib/logger';

export interface SampleCacheEntry {
  bankName: string;
  instruments: string[];
  discoveredAt: number;
}

export interface CustomSample {
  name: string;
  fileName: string;
  audioData: Blob;
  sourceType: 'local' | 'url';
  originalUrl?: string;
  category: string;
  createdAt: number;
}

export class StrudelDB extends Dexie {
  projects!: Table<Project, string>;
  codeSnapshots!: Table<CodeSnapshot, string>;
  sessions!: Table<RecordingSession, string>;
  sampleCache!: Table<SampleCacheEntry, string>;
  customSamples!: Table<CustomSample, string>;

  constructor() {
    super('StrudelLab');
    this.version(2).stores({
      projects: 'id, name, updatedAt',
      codeSnapshots: 'id, sessionId, entityId, timestamp',
      sessions: 'id, projectId, createdAt',
      sampleCache: 'bankName',
      customSamples: 'name',
    }).upgrade(async tx => {
      debugLog('[DB] v2 upgrade — sample tables created');
    });
    this.version(3).stores({
      projects: 'id, name, updatedAt',
      codeSnapshots: 'id, sessionId, entityId, timestamp',
      sessions: 'id, projectId, createdAt',
      sampleCache: 'bankName',
      customSamples: 'name, createdAt',
    }).upgrade(async tx => {
      const existing = await tx.table('customSamples').toArray();
      for (const s of existing) {
        await tx.table('customSamples').put(s);
      }
      debugLog(`[DB] v3 upgrade — added createdAt index (${existing.length} samples migrated)`);
    });
    this.version(4).stores({
      projects: 'id, name, updatedAt',
      codeSnapshots: 'id, sessionId, entityId, timestamp',
      sessions: 'id, projectId, createdAt, [projectId+createdAt]',
      sampleCache: 'bankName',
      customSamples: 'name, createdAt',
    }).upgrade(async () => {
      debugLog('[DB] v4 upgrade — added compound index [projectId+createdAt]');
    });
  }
}

export const db = new StrudelDB();
