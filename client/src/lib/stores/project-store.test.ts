import { describe, it, expect, beforeEach } from 'vitest';

// fake-indexeddb is set up in test/setup.ts — it patches globalThis.indexedDB
// before any module imports. The app's Dexie singleton (db) uses it automatically.

import { db } from './db';

beforeEach(async function() {
  // Clear all data instead of closing the db
  await db.projects.clear();
  await db.codeSnapshots.clear();
  await db.sessions.clear();
  await db.sampleCache.clear();
  await db.customSamples.clear();
});

describe('project-store', function() {
  let mod: typeof import('./project-store');

  beforeEach(async function() {
    mod = await import('./project-store');
  });

  describe('createProject', function() {
    it('creates a project with default values', async function() {
      const project = await mod.createProject({ name: 'My Track' });
      expect(project.id).toBeTruthy();
      expect(project.name).toBe('My Track');
      expect(project.code).toBe('');
      expect(project.bpm).toBe(120);
      expect(project.createdAt).toBeGreaterThan(0);
      expect(project.updatedAt).toBeGreaterThan(0);
    });

    it('creates a project with custom code and bpm', async function() {
      const project = await mod.createProject({ name: 'Test', code: 's("bd")', bpm: 140 });
      expect(project.code).toBe('s("bd")');
      expect(project.bpm).toBe(140);
    });
  });

  describe('getProject', function() {
    it('returns undefined for non-existent project', async function() {
      const result = await mod.getProject('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns a created project', async function() {
      const created = await mod.createProject({ name: 'My Track' });
      const fetched = await mod.getProject(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe('My Track');
    });
  });

  describe('getAllProjects', function() {
    it('returns empty array when no projects', async function() {
      const projects = await mod.getAllProjects();
      expect(projects).toEqual([]);
    });

    it('returns projects sorted by updatedAt desc', async function() {
      const p1 = await mod.createProject({ name: 'First' });
      await new Promise(function(r) { setTimeout(r, 20); });
      const p2 = await mod.createProject({ name: 'Second' });
      const all = await mod.getAllProjects();
      expect(all.length).toBe(2);
      expect(all[0].name).toBe('Second');
      expect(all[1].name).toBe('First');
    });
  });

  describe('updateProject', function() {
    it('updates project name', async function() {
      const created = await mod.createProject({ name: 'Original' });
      const updated = await mod.updateProject(created.id, { name: 'Renamed' });
      expect(updated!.name).toBe('Renamed');
      const fetched = await mod.getProject(created.id);
      expect(fetched!.name).toBe('Renamed');
    });

    it('returns undefined for non-existent project', async function() {
      const result = await mod.updateProject('nonexistent', { name: 'Nope' });
      expect(result).toBeUndefined();
    });
  });

  describe('save queue (update coalescing)', function() {
    it('serializes rapid updates without data loss', async function() {
      const created = await mod.createProject({ name: 'Rapid' });
      // Fire multiple updates concurrently — they should serialize
      const p1 = mod.updateProject(created.id, { name: 'First' });
      const p2 = mod.updateProject(created.id, { name: 'Second' });
      const p3 = mod.updateProject(created.id, { name: 'Third' });
      const results = await Promise.all([p1, p2, p3]);
      // At least one result should be 'Third'
      expect(results.some(function(r) { return r && r.name === 'Third'; })).toBe(true);
      // Final state should be 'Third'
      const fetched = await mod.getProject(created.id);
      expect(fetched!.name).toBe('Third');
    });
  });

  describe('getMoreProjects (pagination)', function() {
    it('returns empty array when no projects', async function() {
      const page = await mod.getMoreProjects(0);
      expect(page).toEqual([]);
    });

    it('returns projects on page 0 after creating one', async function() {
      await mod.createProject({ name: 'Page Item' });
      const page = await mod.getMoreProjects(0);
      expect(page.length).toBe(1);
      expect(page[0].name).toBe('Page Item');
    });
  });

  describe('deleteProject', function() {
    it('deletes a project', async function() {
      const created = await mod.createProject({ name: 'Delete Me' });
      await mod.deleteProject(created.id);
      const fetched = await mod.getProject(created.id);
      expect(fetched).toBeUndefined();
    });

    it('returns true even for non-existent project', async function() {
      const result = await mod.deleteProject('nonexistent');
      expect(result).toBe(true);
    });
  });

  describe('deleteProject cascade', function() {
    it('removes the project, its sessions and their snapshots', async function() {
      const sessionMod = await import('./session-store');
      const project = await mod.createProject({ name: 'Cascade' });
      const session = await sessionMod.createSession({
        projectId: project.id,
        name: 'child session',
        bpm: 120,
        duration: 1000,
        audioBlob: new Blob([]),
        snapshots: [
          { id: 'cs1', entityId: 'e0', timestamp: 0, code: 's("bd")', actionType: 'edit' },
          { id: 'cs2', entityId: 'e0', timestamp: 10, code: 's("hh")', actionType: 'edit' },
        ],
        tracks: [],
      });

      await mod.deleteProject(project.id);

      expect(await mod.getProject(project.id)).toBeUndefined();
      expect(await sessionMod.getSession(session.id)).toBeUndefined();
      expect(await sessionMod.getSessionSnapshots(session.id)).toEqual([]);
      expect(await db.codeSnapshots.count()).toBe(0);
    });
  });
});
