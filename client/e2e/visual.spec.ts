import { test, expect } from '@playwright/test';

test.describe('visual mode (structure canvas)', () => {
  test('CANVAS toggle shows the structure canvas and its nodes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 10000 });

    await expect(page.getByTestId('structure-canvas')).toHaveCount(0);

    await page.getByTestId('canvas-toggle').click();
    await expect(page.getByTestId('structure-canvas')).toBeVisible();

    const nodes = page.locator('[data-testid^="canvas-node-"]');
    await expect.poll(async () => nodes.count(), { timeout: 10000 }).toBeGreaterThan(0);
  });

  test('removing a node rewrites the code', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 10000 });

    await page.getByTestId('canvas-toggle').click();
    const nodes = page.locator('[data-testid^="canvas-node-"]');
    await expect(nodes.first()).toBeVisible({ timeout: 10000 });

    const before = await page.evaluate(() => (window as any).__strudelTest.getCode());
    await nodes.first().locator('[data-testid^="canvas-remove-"]').click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .not.toBe(before);
  });
});
