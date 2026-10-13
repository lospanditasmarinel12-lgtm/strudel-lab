import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

/**
 * Simulates a person live-coding for E2E_SIM_SECONDS (default 20s), stops the
 * recording, exports both artifacts and replays the exported live set.
 *
 * Run the full "couple of minutes" version with:
 *   E2E_SIM_SECONDS=120 npx playwright test client/e2e/record-export.spec.ts
 */
const SIM_SECONDS = Number(process.env.E2E_SIM_SECONDS ?? 20);
const INACTIVITY_WAIT = 3500; // recorder snapshots after 3s of edit inactivity

const CODE_VARIANTS = [
  'note("c3 e3 g3 b3").s("sawtooth").lpf(800).gain(0.3)',
  'note("c3 e3 g3 b3 c4").s("sawtooth").lpf(1200).gain(0.35)',
  'note("c3 e3 g3 b3 c4").s("sawtooth").lpf(1200).room(0.4).gain(0.35)\ns("sine").n("0 3 5").gain(0.2)',
  'note("c3 e3 g3 b3 c4 d4").s("sawtooth").lpf(1500).room(0.5).gain(0.4)\ns("sine").n("0 3 5 7").gain(0.25)',
  'note("c2 e2 g2 b2 c3 d3").s("triangle").lpf(900).room(0.5).gain(0.4)\ns("sine").n("0 3 5 7").gain(0.25)',
];

async function setCode(page: Page, code: string) {
  await page.evaluate((value) => (window as any).__strudelTest?.setCode(value), code);
}

async function openLatestSession(page: Page) {
  await page.getByTestId('panel-tab-session').click();
  const row = page.getByTestId('session-row').first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.click();
  await expect(page.getByTestId('export-song')).toBeEnabled({ timeout: 10000 });
}

test.describe('record → export → replay', () => {
  test('simulates live coding, exports song + live set, and replays', async ({ page }, testInfo) => {
    test.setTimeout(SIM_SECONDS * 1000 + 90_000);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 20000 });
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 10000 });

    // 1. Create a project so the recording can be saved.
    await page.getByTestId('new-project').click();
    await page.getByTestId('project-name-input').fill('E2E Set');
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('new-project')).toBeVisible();

    // 2. Start recording.
    const recordBtn = page.getByTestId('record-button');
    await expect(recordBtn).toHaveAttribute('title', 'Start Recording');
    await recordBtn.click();
    await expect(recordBtn).toHaveAttribute('title', 'Stop Recording');
    expect(await page.evaluate(() => (window as any).__strudelTest?.isRecording())).toBe(true);

    // 3. Simulate a person coding: change code, pause long enough for the
    //    recorder's inactivity snapshot, and best-effort trigger a play action.
    const playBtn = page.locator('button[title*="Play"]').first();
    const deadline = Date.now() + SIM_SECONDS * 1000;
    let i = 0;
    while (Date.now() < deadline) {
      await setCode(page, CODE_VARIANTS[i % CODE_VARIANTS.length]);
      if (await playBtn.isEnabled()) {
        await playBtn.click().catch(() => {});
      }
      await page.waitForTimeout(INACTIVITY_WAIT);
      i++;
    }

    // 4. Record a bpm_change action.
    const bpm = page.getByTestId('bpm-input');
    await bpm.fill('135');
    await bpm.blur();
    await page.waitForTimeout(500);

    const snapshotCount = await page.evaluate(() => (window as any).__strudelTest?.getSnapshotCount() ?? 0);
    expect(snapshotCount).toBeGreaterThan(3);

    // 5. Stop recording and wait for the session to be persisted.
    await recordBtn.click();
    await expect(recordBtn).toHaveAttribute('title', 'Start Recording', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 6. Reload so the freshly saved session is read from IndexedDB, then load it.
    await page.reload();
    await page.waitForSelector('.monaco-editor', { timeout: 20000 });
    await openLatestSession(page);

    // 7. Export the finished Song.
    const [songDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-song').click(),
    ]);
    expect(songDownload.suggestedFilename()).toMatch(/\.strudel$/);
    const songPath = testInfo.outputPath('e2e-set.strudel');
    await songDownload.saveAs(songPath);
    const songText = await fs.readFile(songPath, 'utf8');
    expect(songText).toContain('// @kind song');
    expect(songText).toContain('// @code');
    expect(songText).toContain('sawtooth');

    // 8. Export the live set (re-enactable performance timeline).
    const [liveDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-live').click(),
    ]);
    expect(liveDownload.suggestedFilename()).toMatch(/\.strudel\.live\.json$/);
    const livePath = testInfo.outputPath('e2e-set.strudel.live.json');
    await liveDownload.saveAs(livePath);
    const live = JSON.parse(await fs.readFile(livePath, 'utf8'));
    expect(live.kind).toBe('live-session');
    expect(Array.isArray(live.snapshots)).toBe(true);
    expect(live.snapshots.length).toBeGreaterThan(3);
    expect(live.snapshots.some((s: any) => !!s.baseSnapshotId)).toBe(true);
    expect(typeof live.finalCode).toBe('string');
    expect(live.finalCode.length).toBeGreaterThan(0);
    expect(Array.isArray(live.samples)).toBe(true);

    // 9. Replay round-trip: import the exported live set and verify playback.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('import-live').click(),
    ]);
    await chooser.setFiles(livePath);
    await page.waitForURL(/\/playback\//, { timeout: 20000 });
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.getByTestId('playback-transport')).toBeVisible();
    await expect(page.locator('text=Session not found')).toHaveCount(0);

    // Press play and ensure the re-enactment runs without crashing.
    const transport = page.getByTestId('playback-transport');
    await transport.locator('button').nth(1).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
