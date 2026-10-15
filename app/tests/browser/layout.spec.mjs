import { test, expect } from '@playwright/test';

async function checkShell(page) {
  const size = page.viewportSize();
  for (const selector of ['.bar', '.site-credit']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('settings and build controls remain reachable, with no unused drawer column', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/models/chick/?debug');
  await page.waitForFunction(() => window.app?.model?.result?.parts?.length > 0);
  await page.locator('#tools button[data-group="size"]').click();
  await expect(page.locator('#drawer')).toBeVisible();
  await checkShell(page);
  // A real pointer click catches a name card or other overlay intercepting the control.
  await page.locator('#mode-build').click();
  await expect(page.locator('#mode-build')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#step-next').click();
  await expect(page.locator('#step-num')).toHaveText('2');
  const areas = await page.evaluate(() => {
    const root = document.querySelector('#result').getBoundingClientRect();
    const stage = document.querySelector('#result .stage').getBoundingClientRect();
    const canvas = document.querySelector('#view').getBoundingClientRect();
    return { rootWidth: root.width, stageWidth: stage.width, canvasWidth: canvas.width, canvasHeight: canvas.height };
  });
  expect(areas.stageWidth).toBeGreaterThan(areas.rootWidth * 0.95);
  expect(areas.canvasWidth).toBeGreaterThan(120);
  expect(areas.canvasHeight).toBeGreaterThan(80);
  await checkShell(page);
  expect(errors).toEqual([]);
});

test('sample mosaic loads without external photo requests or horizontal overflow', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') external.push(url.origin);
  });
  await page.goto('/mosaic/labrador/?debug');
  await page.waitForFunction(() => !!window.app?.mosaic);
  await checkShell(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
