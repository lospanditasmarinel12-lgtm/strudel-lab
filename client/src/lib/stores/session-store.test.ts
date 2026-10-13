import { describe, it, expect, beforeEach } from 'vitest';

import { db } from './db';

beforeEach(async function() {
  await db.projects.clear();
  await db.codeSnapshots.clear();
  await db.sessions.clear();
  await db.sampleCache.clear();
  await db.customSamples.clear();
});

describe('session-store', function() {
  let mod: typeof import('./session-store');

  beforeEach(async function() {
    mod = await import('./session-store');
  });

  function makeSnapshot(overrides?: any) {
    return {
      id: 'snap-' + Math.random().toString(36).slice(2, 8),
      entityId: 'e1',
      timestamp: 0,
      code: 's("bd")',
      actionType: 'edit' as const,
      ...overrides,
    };
  }

  describe('createSession', function() {
    it('creates a session and persists snapshots', async function() {
      const session = await mod.createSession({
        projectId: 'p1',
        name: 'Test Session',
        bpm: 120,
        duration: 5000,
        audioBlob: new Blob([]),
        snapshots: [makeSnapshot({ timestamp: 0, code: 's("bd")' })],
        tracks: [],
      });

      expect(session.id).toBeTruthy();
      expect(session.name).toBe('Test Session');
      expect(session.snapshots.length).toBe(1);

      const storedSnaps = await mod.getSessionSnapshots(session.id);
      expect(storedSnaps.length).toBe(1);
      expect(storedSnaps[0].code).toBe('s("bd")');
    });

    it('creates a session with multiple snapshots', async function() {
      const session = await mod.createSession({
        projectId: 'p1',
        name: 'Multi Snap',
        bpm: 120,
        duration: 10000,
        audioBlob: new Blob([]),
        snapshots: [
          makeSnapshot({ timestamp: 0, code: 'a' }),
          makeSnapshot({ timestamp: 1000, code: 'b' }),
          makeSnapshot({ timestamp: 2000, code: 'c' }),
        ],
        tracks: [],
      });

      const storedSnaps = await mod.getSessionSnapshots(session.id);
      expect(storedSnaps.length).toBe(3);
    });
  });

  describe('getSession', function() {
    it('returns undefined for non-existent session', async function() {
      const result = await mod.getSession('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns session with snapshots', async function() {
      const created = await mod.createSession({
        projectId: 'p1',
        name: 'My Session',
        bpm: 120,
        duration: 3000,
        audioBlob: new Blob([]),
        snapshots: [makeSnapshot({ timestamp: 0, code: 's("bd")' })],
        tracks: [],
      });

      const fetched = await mod.getSession(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe('My Session');
    });
  });

  describe('getMoreSessions (pagination)', function() {
    it('returns empty array when no sessions', async function() {
      const sessions = await mod.getMoreSessions(undefined, 0);
      expect(sessions).toEqual([]);
    });

    it('returns sessions from offset', async function() {
      // Using 2 sessions, verify offset works
      await mod.createSession({
        projectId: 'p1', name: 'First', bpm: 120, duration: 1000,
        audioBlob: new Blob([]), snapshots: [], tracks: [],
      });
      await new Promise(function(r) { setTimeout(r, 20); });
      await mod.createSession({
        projectId: 'p1', name: 'Second', bpm: 120, duration: 1000,
        audioBlob: new Blob([]), snapshots: [], tracks: [],
      });

      const page = await mod.getMoreSessions(undefined, 0);
      expect(page.length).toBe(2);

      const page1 = await mod.getMoreSessions(undefined, 1);
      expect(page1.length).toBe(1);
    });
  });

  describe('getAllSessions', function() {
    it('returns empty array when no sessions', async function() {
      const sessions = await mod.getAllSessions();
      expect(sessions).toEqual([]);
    });

    it('returns sessions sorted by createdAt desc', async function() {
      const s1 = await mod.createSession({
        projectId: 'p1', name: 'First', bpm: 120, duration: 1000,
        audioBlob: new Blob([]), snapshots: [], tracks: [],
      });
      await new Promise(function(r) { setTimeout(r, 20); });
      const s2 = await mod.createSession({
        projectId: 'p1', name: 'Second', bpm: 120, duration: 1000,
        audioBlob: new Blob([]), snapshots: [], tracks: [],
      });

      const all = await mod.getAllSessions();
      expect(all.length).toBe(2);
      expect(all[0].name).toBe('Second');
    });
  });

  describe('deleteSession', function() {
    it('deletes session and its snapshots', async function() {
      const session = await mod.createSession({
        projectId: 'p1', name: 'Delete Me', bpm: 120, duration: 1000,
        audioBlob: new Blob([]),
        snapshots: [makeSnapshot({ timestamp: 0, code: 'x' })],
        tracks: [],
      });

      await mod.deleteSession(session.id);
      const fetched = await mod.getSession(session.id);
      expect(fetched).toBeUndefined();

      const snaps = await mod.getSessionSnapshots(session.id);
      expect(snaps.length).toBe(0);
    });
  });

  describe('updateSessionTracks', function() {
    it('updates tracks on a session', async function() {
      const session = await mod.createSession({
        projectId: 'p1', name: 'Track Test', bpm: 120, duration: 1000,
        audioBlob: new Blob([]), snapshots: [], tracks: [],
      });

      await mod.updateSessionTracks(session.id, [
        { name: 'bd', category: 'drums', color: '#ff0000', events: [] },
      ]);

      const fetched = await mod.getSession(session.id);
      expect(fetched!.tracks.length).toBe(1);
      expect(fetched!.tracks[0].name).toBe('bd');
    });
  });
});
