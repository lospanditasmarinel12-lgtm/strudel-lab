import { test, expect } from '@playwright/test';

test.describe('block layer', () => {
  test('renders bars, inserts a lego, and removes a block', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 10000 });

    await page.getByTestId('blocks-toggle').click();
    await expect(page.getByTestId('block-palette')).toBeVisible();

    const bars = page.locator('[data-testid^="block-bar-"]');
    await expect(bars.first()).toBeVisible({ timeout: 10000 });
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);

    const before = await page.evaluate(() => (window as any).__strudelTest.getCode());

    // Click a pattern lego (no movement) -> inserted at the cursor.
    await page.getByTestId('lego-pattern-kick').click();
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .not.toBe(before);

    const afterInsert = await page.evaluate(() => (window as any).__strudelTest.getCode());
    expect(afterInsert).toContain('bd ~ bd ~');
    await expect.poll(async () => bars.count(), { timeout: 5000 }).toBeGreaterThan(barCount);

    // Collapse the palette so it can't overlap the bar, then remove the first block.
    await page.getByTestId('block-palette').locator('button').first().click();
    const firstBar = bars.first();
    await firstBar.locator('[data-testid^="block-remove-"]').click();
    await expect.poll(async () => bars.count(), { timeout: 5000 }).toBe(barCount);
  });

  test('drags an effect lego onto a block to append it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 10000 });

    await page.getByTestId('blocks-toggle').click();
    const bar = page.locator('[data-testid^="block-bar-"]').first();
    await expect(bar).toBeVisible({ timeout: 10000 });

    const before = await page.evaluate(() => (window as any).__strudelTest.getCode());
    expect(before).not.toContain('.delay(');

    const source = page.getByTestId('lego-effect-delay');
    const target = bar.locator('[data-testid^="block-drag-"]');
    const sb = await source.boundingBox();
    const tb = await target.boundingBox();
    if (!sb || !tb) throw new Error('missing bounding boxes');

    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .toContain('.delay(');
  });
});
