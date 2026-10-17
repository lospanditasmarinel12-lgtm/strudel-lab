import { test, expect, type Page } from '@playwright/test';

/** Clear onboarding state and reload so the tour starts from step 1. */
async function firstLaunch(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 30000 });
  await expect(page.getByTestId('blockly-workspace')).toBeVisible({ timeout: 30000 });
}

test.describe('onboarding: guided tour', () => {
  test('shows on first launch and advances on actions', async ({ page }) => {
    await firstLaunch(page);

    await expect(page.getByTestId('tour-root')).toBeVisible();
    await expect(page.getByText('Welcome to Strudel Lab')).toBeVisible();

    // Manual welcome step.
    await page.getByTestId('tour-next').click();
    await expect(page.getByText('Two ways to edit')).toBeVisible();

    // Action gate: clicking Code advances.
    await page.getByTestId('code-toggle').click();
    await expect(page.getByText('Build a pattern')).toBeVisible({ timeout: 10000 });

    // Skip ends the tour.
    await page.getByTestId('tour-skip').click();
    await expect(page.getByTestId('tour-root')).toHaveCount(0);
  });

  test('skip persists across reload', async ({ page }) => {
    await firstLaunch(page);
    await page.getByTestId('tour-skip').click();
    await expect(page.getByTestId('tour-root')).toHaveCount(0);

    await page.reload();
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 30000 });
    await expect(page.getByTestId('tour-root')).toHaveCount(0);
  });

  test('Help menu replays the tour', async ({ page }) => {
    await firstLaunch(page);
    await page.getByTestId('tour-skip').click();
    await expect(page.getByTestId('tour-root')).toHaveCount(0);

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-replay-tour').click();
    await expect(page.getByTestId('tour-root')).toBeVisible();
  });

  test('Examples dialog loads a starter project', async ({ page }) => {
    await firstLaunch(page);
    await page.getByTestId('tour-skip').click();

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-examples').click();
    await expect(page.getByTestId('examples-dialog')).toBeVisible();

    await page.getByTestId('example-first-beat').click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .toContain('bd');
  });
});
