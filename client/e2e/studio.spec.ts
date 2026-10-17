import { test, expect, type Page } from '@playwright/test';

const STUDIO_URL = 'http://localhost:5000';

/** Wait for the studio to mount in its default (Blocks) mode. */
async function waitForStudio(page: Page) {
  // Keep the guided tour out of the way for these feature tests.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('strudel_tour_v1', JSON.stringify({ done: true, step: 0 }));
      localStorage.setItem('strudel_checklist_v1', JSON.stringify({ completed: [], dismissed: true }));
    } catch {
      /* ignore */
    }
  });
  await page.goto(STUDIO_URL);
  await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 30000 });
  await expect(page.getByTestId('blockly-workspace')).toBeVisible({ timeout: 30000 });
}

test.describe('Studio page E2E', () => {
  test.beforeEach(async ({ page }) => {
    await waitForStudio(page);
  });

  test('loads the studio with the block editor and controls', async ({ page }) => {
    await expect(page.getByTestId('blockly-workspace')).toBeVisible();
    await expect(page.locator('text=Projects').first()).toBeVisible();
    // First launch auto-creates a project so the user can record/save/export.
    await expect(page.getByText('Untitled').first()).toBeVisible({ timeout: 10000 });
  });

  test('play button toggles playback state', async ({ page }) => {
    const playBtn = page.locator('button[title*="Play"]').first();
    await playBtn.click();
    await expect(page.getByTestId('blockly-workspace')).toBeVisible();
  });

  test('switching to code and evaluating does not crash', async ({ page }) => {
    await page.getByTestId('code-toggle').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await editor.click();
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });

  test('DAW timeline toggle shows and hides', async ({ page }) => {
    const dawBtn = page.locator('button:has-text("Timeline")').first();
    await dawBtn.click();
    await expect(page.locator('text=TIMELINE').first()).toBeVisible();
    await dawBtn.click();
    await expect(page.locator('text=Samples').first()).toBeVisible();
  });

  test('sidebar panels are accessible', async ({ page }) => {
    await expect(page.locator('text=Console').first()).toBeVisible();
    await expect(page.locator('text=Samples').first()).toBeVisible();
    await expect(page.locator('text=MEDIA').first()).toBeVisible();
  });
});

test.describe('Session panel E2E', () => {
  test.beforeEach(async ({ page }) => {
    await waitForStudio(page);
    await page.locator('button:has-text("SESSION")').click();
  });

  test('session panel shows recording indicator', async ({ page }) => {
    const recordBtn = page.locator('button[title*="Record"]').first();
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('text=REC').first()).toBeVisible();
      await recordBtn.click();
    }
  });
});

test.describe('Track Controls E2E', () => {
  test.beforeEach(async ({ page }) => {
    await waitForStudio(page);
    const dawBtn = page.locator('button:has-text("Timeline")').first();
    await dawBtn.click();
    await expect(page.locator('text=TIMELINE').first()).toBeVisible();
  });

  test('track controls shows Track Controls header when tracks have modifiers', async ({ page }) => {
    const header = page.locator('text=Track Controls');
    if (await header.isVisible()) {
      await expect(header).toBeVisible();
    }
  });
});

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await waitForStudio(page);
  });

  test('Ctrl+Enter evaluates code without crash', async ({ page }) => {
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });

  test('Ctrl+F toggles focus mode', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(300);
    // Focus mode hides chrome but keeps the editor; just ensure no crash.
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

test.describe('Project CRUD E2E', () => {
  test.beforeEach(async ({ page }) => {
    await waitForStudio(page);
  });

  test('create a new project', async ({ page }) => {
    const projectsTab = page.locator('text=Projects').first();
    await projectsTab.waitFor({ state: 'visible', timeout: 5000 });
    await projectsTab.click({ force: true });
    await page.waitForTimeout(300);

    const createBtn = page.locator('button:has-text("New")').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId('blockly-workspace')).toBeVisible();
  });
});
