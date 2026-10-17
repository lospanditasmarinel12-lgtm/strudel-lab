import { test, expect } from '@playwright/test';

test.describe('visual block editor (Blockly)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('strudel_tour_v1', JSON.stringify({ done: true, step: 0 }));
        localStorage.setItem('strudel_checklist_v1', JSON.stringify({ completed: [], dismissed: true }));
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__strudelTest, null, { timeout: 30000 });
    await expect(page.getByTestId('blockly-workspace')).toBeVisible({ timeout: 30000 });
  });

  test('Blocks is the default editor; CODE | BLOCKS toggles editors', async ({ page }) => {
    await expect(page.getByTestId('blockly-workspace')).toBeVisible();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('code-toggle').click();
    await expect(page.getByTestId('blockly-workspace')).toHaveCount(0);
    await expect(page.locator('.monaco-editor').first()).toBeVisible();

    // Re-mounting the workspace a second time still works.
    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });
  });

  test('renders blocks for the current code', async ({ page }) => {
    await page.evaluate(() => (window as any).__strudelTest.setCode('$: s("bd ~ sd ~")\n'));
    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => page.locator('.blocklyDraggable').count(), { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('editing a block writes back to the code', async ({ page }) => {
    await page.evaluate(() => (window as any).__strudelTest.setCode('s("bd").gain(0.5)\n'));
    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });

    const changed = await page.evaluate(() => {
      const ws = (window as any).__strudelBlockly?.workspace;
      if (!ws) return false;
      const gain = ws.getAllBlocks(false).find((b: any) => b.type === 'strudel_m_gain');
      if (!gain) return false;
      gain.setFieldValue(0.9, 'ARG_0');
      return true;
    });
    expect(changed).toBe(true);

    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .toContain('gain(0.9)');
  });

  test('hides the toolbox flyout scrollbar when the menu closes', async ({ page }) => {
    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });

    const visibleScrollbars = () =>
      page
        .locator('.blocklyFlyoutScrollbar')
        .evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);

    const category = page.locator('.blocklyToolboxCategory').first();
    await category.click();
    await expect.poll(visibleScrollbars, { timeout: 5000 }).toBeGreaterThan(0);

    await page.mouse.click(760, 420);
    await expect.poll(visibleScrollbars, { timeout: 5000 }).toBe(0);
  });

  test('the right panel can add a sample block and an effect to the canvas', async ({ page }) => {
    await page.evaluate(() => (window as any).__strudelTest.setCode('s("bd")\n'));
    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });

    await page.evaluate(() => (window as any).__strudelBlocklyApi.addSampleBlock('cp'));
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .toContain('s("cp")');

    const added = await page.evaluate(() => {
      const ws = (window as any).__strudelBlockly.workspace;
      const Blockly = (window as any).__strudelBlockly.Blockly;
      const sound = ws.getAllBlocks(false).find((b: any) => b.type === 'strudel_f_s');
      if (!sound) return false;
      Blockly.common.setSelected(sound);
      return (window as any).__strudelBlocklyApi.addEffectToSelection('gain(0.5)');
    });
    expect(added).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .toContain('.gain(0.5)');
  });

  test('dragging a sample onto the canvas adds a sound block', async ({ page }) => {
    await page.evaluate(() => (window as any).__strudelTest.setCode('\n'));
    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="blockly-workspace"]') as HTMLElement;
      const rect = el.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.setData('application/x-strudel-sample', 'sd');
      el.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: rect.left + 60,
          clientY: rect.top + 60,
        }),
      );
    });
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getCode()), { timeout: 5000 })
      .toContain('s("sd")');
  });

  test('block edits during recording are captured as snapshots', async ({ page }) => {
    await page.evaluate(() => (window as any).__strudelTest.setCode('s("bd").gain(0.5)\n'));

    await page.getByTestId('record-button').click();
    await expect(page.getByTestId('record-button')).toHaveAttribute('title', 'Stop recording');
    const before = await page.evaluate(() => (window as any).__strudelTest.getSnapshotCount());

    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });

    const changed = await page.evaluate(() => {
      const ws = (window as any).__strudelBlockly?.workspace;
      const gain = ws?.getAllBlocks(false).find((b: any) => b.type === 'strudel_m_gain');
      if (!gain) return false;
      gain.setFieldValue(0.9, 'ARG_0');
      return true;
    });
    expect(changed).toBe(true);

    // The recorder snapshots after ~3s of edit inactivity.
    await expect
      .poll(async () => page.evaluate(() => (window as any).__strudelTest.getSnapshotCount()), { timeout: 8000 })
      .toBeGreaterThan(before);

    await page.getByTestId('code-toggle').click();
    await page.getByTestId('record-button').click();
    await expect(page.getByTestId('record-button')).toHaveAttribute('title', 'Start recording', { timeout: 15000 });
  });

  test('toggling without edits leaves the code byte-identical', async ({ page }) => {
    await page.evaluate(() => (window as any).__strudelTest.setCode('note("c3 e3 g3").s("piano").gain(0.5)\n'));
    const before = await page.evaluate(() => (window as any).__strudelTest.getCode());

    await page.getByTestId('blocks-toggle').click();
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('code-toggle').click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible();

    const after = await page.evaluate(() => (window as any).__strudelTest.getCode());
    expect(after).toBe(before);
  });
});
