import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openComparisonFixture, withComparisonFixture } from './support/comparison-fixtures';
async function settled(page: Page) { await expect(page.locator('[data-camera-moving]')).toHaveAttribute('data-camera-moving', 'false'); }
async function pair(page: Page) {
  await page.locator('[data-camera-moving][data-view="group"]').getByRole('button', { name: 'Ana QA, Beatriz QA 30 obras comunes', exact: true }).click();
  await settled(page);
}
async function region(page: Page) {
  await page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA; 30 obras', exact: true }).click();
  await settled(page);
}
async function trace(cover: Locator, action: () => Promise<unknown>, duration = 1050) {
  const [frames] = await Promise.all([cover.evaluate(async (node, ms) => {
    const frames: { t: number; x: number; y: number; localY: number; width: number; height: number; connected: boolean; key: string | null }[] = [];
    const start = performance.now();
    do {
      const box = node.getBoundingClientRect();
      const stage = node.closest('[data-comparison-stage]')!.getBoundingClientRect();
      frames.push({ t: performance.now() - start, x: box.x, y: box.y + window.scrollY, localY: box.y - stage.y, width: box.width, height: box.height, connected: node.isConnected, key: node.getAttribute('data-work-key') });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    } while (performance.now() - start < ms);
    return frames;
  }, duration), action()]);
  return frames;
}
function moved(frames: Awaited<ReturnType<typeof trace>>) {
  expect(frames.length).toBeGreaterThan(10);
  expect(frames.every(frame => frame.connected && frame.key === frames[0].key)).toBe(true);
  const first = frames[0]; const last = frames.at(-1)!;
  const difference = (a: typeof first, b: typeof first) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width);
  expect(difference(first, last)).toBeGreaterThan(2);
  expect(frames.some(frame => difference(frame, first) > 2 && difference(frame, last) > 2)).toBe(true);
}
test('real cover travels both ways through map, Venn, region and work, and interruption rebases', async ({ page }, info) => {
  await withComparisonFixture(async fixture => {
    const canvas = await openComparisonFixture(page, fixture); await settled(page);
    const key = `book:${fixture.books[0].id}`;
    const cover = page.locator(`[data-work-key="${key}"]`);
    const node = await cover.elementHandle();
    const mapTrace = await trace(cover, () => canvas.getByRole('button', { name: 'Ana QA, Beatriz QA 30 obras comunes', exact: true }).click());
    moved(mapTrace); await settled(page);
    const regionTrace = await trace(cover, () => region(page)); moved(regionTrace); await settled(page);
    const workTrace = await trace(cover, () => cover.click()); moved(workTrace); await settled(page);
    await expect(page.getByRole('link', { name: 'Ver ficha', exact: true })).toBeVisible();
    await expect(cover.locator('img')).toHaveJSProperty('complete', true);
    expect(await cover.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const detailPosition = await cover.boundingBox();
    await page.waitForTimeout(250);
    expect(await cover.boundingBox()).toEqual(detailPosition);
    const backWork = await trace(cover, () => page.getByRole('button', { name: 'Volver al cruce', exact: true }).click()); moved(backWork); await settled(page);
    const backRegion = await trace(cover, () => page.getByRole('button', { name: 'Volver al Venn', exact: true }).click()); moved(backRegion); await settled(page);
    const backMap = await trace(cover, () => page.getByRole('button', { name: 'Volver al grupo', exact: true }).click()); moved(backMap); await settled(page);
    expect(await node!.evaluate((original, workKey) => original === document.querySelector(`[data-work-key="${workKey}"]`) && original.isConnected, key)).toBe(true);
    await pair(page);
    const interruption = await trace(cover, async () => {
      await page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA; 30 obras', exact: true }).click();
      await page.waitForTimeout(270);
      // Physical forward/return clicks are covered above. Native DOM click here
      // avoids Playwright waiting for animation/scroll stability past halfway.
      await page.getByRole('button', { name: 'Volver al Venn', exact: true }).evaluate(node => (node as HTMLButtonElement).click());
    }, 1300);
    await settled(page); await expect(canvas).toHaveAttribute('data-view', 'venn');
    // Consecutive real boxes through the reversal must not jump to either endpoint.
    const nearTurn = interruption.filter(frame => frame.t > 200 && frame.t < 650);
    expect(nearTurn.length).toBeGreaterThan(5);
    for (let i = 1; i < nearTurn.length; i++) expect(Math.hypot(nearTurn[i].x - nearTurn[i - 1].x, nearTurn[i].localY - nearTurn[i - 1].localY)).toBeLessThan(70);
    expect(interruption.at(-1)!.x).toBeCloseTo(interruption[0].x, 0);
    expect(interruption.at(-1)!.localY).toBeCloseTo(interruption[0].localY, 0);
    const tracePath = info.outputPath('cover-trajectories.json');
    await writeFile(tracePath, JSON.stringify({ mapTrace, regionTrace, workTrace, backWork, backRegion, backMap, interruption }, null, 2));
    await info.attach('cover-trajectories', { path: tracePath, contentType: 'application/json' });
    await page.locator('[data-comparison-stage]').screenshot({ path: info.outputPath('venn-return.png') });
  });
});
test('real wheel burst captures one target, releases after quiet and animation, keeps native limits and modifiers', async ({ page }) => {
  await withComparisonFixture(async fixture => {
    const canvas = await openComparisonFixture(page, fixture); await settled(page); await pair(page);
    const target = page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA; 30 obras', exact: true });
    await target.scrollIntoViewIfNeeded(); const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const scroll = await page.evaluate(() => window.scrollY);
    const wheelEvents = await page.evaluateHandle(() => {
      const cancelled: boolean[] = [];
      const listener = (event: WheelEvent) => cancelled.push(event.defaultPrevented);
      window.addEventListener('wheel', listener);
      return { cancelled, stop: () => window.removeEventListener('wheel', listener) };
    });
    await page.mouse.wheel(0, -80);
    await expect(canvas).toHaveAttribute('data-view', 'region');
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
    await settled(page);
    expect(await wheelEvents.evaluate(probe => probe.cancelled.every(Boolean))).toBe(true);
    expect(await wheelEvents.evaluate(probe => probe.cancelled.length)).toBe(9);
    await wheelEvents.evaluate(probe => probe.stop());
    // A shorter destination may lower document.maxScroll; that clamp is layout,
    // while every captured native wheel event above was actually cancelled.
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(Math.min(scroll, maxScroll), 0);
    await expect(canvas).toHaveAttribute('data-view', 'region');
    await page.waitForTimeout(200);
    const cover = page.locator(`[data-work-key="book:${fixture.books[0].id}"]`);
    await cover.scrollIntoViewIfNeeded(); const coverBox = (await cover.boundingBox())!;
    await page.mouse.move(coverBox.x + coverBox.width / 2, coverBox.y + coverBox.height / 2);
    await page.mouse.wheel(0, -80); await expect(canvas).toHaveAttribute('data-view', 'work'); await settled(page);
    await page.waitForTimeout(200);
    const stage = page.locator('[data-comparison-stage]'); const stageBox = (await stage.boundingBox())!;
    await page.mouse.move(stageBox.x + 5, Math.max(100, stageBox.y + 350));
    const beforeLimit = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 0); // Zero delta keeps its native path.
    await page.mouse.wheel(0, -100); await page.waitForTimeout(200);
    await expect(canvas).toHaveAttribute('data-view', 'work');
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(beforeLimit);
    await page.keyboard.down('Control'); await page.mouse.wheel(0, 120); await page.keyboard.up('Control');
    await expect(canvas).toHaveAttribute('data-view', 'work');
    // Event cancellation is also checked directly for line/page modes and Meta.
    expect(await stage.evaluate(node => node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, deltaMode: 2, metaKey: true, bubbles: true, cancelable: true })))).toBe(true);
    await page.getByRole('button', { name: 'Volver al cruce', exact: true }).click(); await settled(page);
    await page.getByRole('button', { name: 'Volver al Venn', exact: true }).click(); await settled(page);
    await page.getByRole('button', { name: 'Volver al grupo', exact: true }).click(); await settled(page);
    const limitScroll = await page.evaluate(() => window.scrollY); const groupStageBox = (await stage.boundingBox())!;
    await page.mouse.move(groupStageBox.x + 4, groupStageBox.y + 20); await page.mouse.wheel(0, 200); await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(limitScroll);
    // A map pile targets its canonical pair; empty canvas does not invent one.
    const mapCover = page.locator(`[data-work-key="book:${fixture.books[0].id}"]`);
    await mapCover.scrollIntoViewIfNeeded(); const mapBox = (await mapCover.boundingBox())!;
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.mouse.wheel(0, -80); await expect(canvas).toHaveAttribute('data-view', 'venn'); await settled(page);
    await expect(page.getByRole('checkbox', { name: 'Carlos QA', exact: true })).toBeChecked();
  });
});
test('reduced motion applies destination directly and Escape returns with focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withComparisonFixture(async fixture => {
    const canvas = await openComparisonFixture(page, fixture); await settled(page); await pair(page); await region(page);
    const cover = page.locator(`[data-work-key="book:${fixture.books[0].id}"]`);
    await cover.click(); await expect(canvas).toHaveAttribute('data-camera-moving', 'false');
    const box = await cover.boundingBox(); await page.waitForTimeout(150); expect(await cover.boundingBox()).toEqual(box);
    await expect(page.getByRole('button', { name: 'Volver al cruce', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(canvas).toHaveAttribute('data-view', 'region');
    await expect(cover).toBeFocused();
    const world = await page.locator('[data-comparison-world]').getAttribute('style');
    await page.keyboard.press('ArrowRight'); expect(await page.locator('[data-comparison-world]').getAttribute('style')).toBe(world);
    await page.keyboard.press('Escape'); await expect(canvas).toHaveAttribute('data-view', 'venn');
    await page.keyboard.press('Escape'); await expect(canvas).toHaveAttribute('data-view', 'group');
    await expect(page.locator('[data-map-pair]').first()).toBeFocused();
  });
});
test('320px normal page scroll reaches last loaded cover, touch opens actual work and return restores node, batch, scroll and focus', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 }, hasTouch: true }); const page = await context.newPage();
  try {
    await withComparisonFixture(async fixture => {
      await openComparisonFixture(page, fixture); await settled(page); await pair(page); await region(page);
      await page.getByRole('button', { name: 'Cargar más', exact: true }).tap(); await settled(page);
      await expect(page.getByText('30 de 30 obras', { exact: true })).toBeVisible();
      const last = page.locator(`[data-work-key="book:${fixture.books.at(-1)!.id}"]`); const node = await last.elementHandle();
      await last.scrollIntoViewIfNeeded(); const scroll = await page.evaluate(() => window.scrollY);
      expect(scroll).toBeGreaterThan(1500); await expect(last).toBeInViewport();
      const firstBox = await last.boundingBox();
      await last.tap(); await settled(page); await expect(last).toBeInViewport();
      expect((await last.boundingBox())!.width).not.toBe(firstBox!.width);
      await page.screenshot({ path: info.outputPath('mobile-work-destination.png') });
      await last.tap(); // Tapping the current destination must preserve origin scroll.
      await page.getByRole('button', { name: 'Volver al cruce', exact: true }).tap(); await settled(page);
      await expect(last).toBeFocused(); await expect(last).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
      expect(await node!.evaluate(original => original.isConnected)).toBe(true);
      await expect(page.getByText('30 de 30 obras', { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath('mobile-last-cover-return.png') });
    });
  } finally { await context.close(); }
});


