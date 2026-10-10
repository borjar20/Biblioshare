import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openComparisonFixture, withComparisonFixture } from './support/comparison-fixtures';
async function settled(page: Page) { await expect(page.locator('[data-camera-moving]')).toHaveAttribute('data-camera-moving', 'false'); }
async function visibleWorkEntry(page: Page, title: string) {
  const back = page.getByRole('button', { name: 'Volver al cruce', exact: true });
  const heading = page.getByRole('heading', { name: title, exact: true });
  // Wait for the genuine authorized detail response, not its loading state.
  await expect(page.getByRole('link', { name: 'Ver ficha', exact: true })).toBeVisible();
  await expect(back).toBeFocused();
  const shellBottom = await page.locator('header').first().evaluate(node => node.getBoundingClientRect().bottom);
  const viewport = page.viewportSize()!;
  const rectangles = { shellBottom, back: (await back.boundingBox())!, heading: (await heading.boundingBox())! };
  for (const box of [rectangles.back, rectangles.heading]) {
    expect(box.y).toBeGreaterThanOrEqual(shellBottom);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
  return rectangles;
}
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
test('real wheel bursts keep every level, native canvas scrolling and modifiers uncancelled', async ({ page }, info) => {
  await withComparisonFixture(async fixture => {
    const canvas = await openComparisonFixture(page, fixture); await settled(page); await pair(page);
    // Opening the A/B pair sets the actual comparison selection to those two,
    // even though the saved group also contains Carlos. Wheel must preserve it.
    for (const name of ['Ana QA', 'Beatriz QA']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Carlos QA', exact: true })).not.toBeChecked();
    const selections: { phase: string; people: { name: string; checked: boolean }[] }[] = [];
    const captureSelection = async (phase: string) => {
      await expect(page.getByRole('checkbox')).toHaveCount(fixture.actors.length);
      const people = await Promise.all(fixture.actors.map(async actor => ({ name: actor.name, checked: await page.getByRole('checkbox', { name: actor.name, exact: true }).isChecked() })));
      selections.push({ phase, people }); return people;
    };
    const selectedPair = await captureSelection('venn-before-wheel');
    const preserveSelection = async (phase: string) => expect(await captureSelection(phase)).toEqual(selectedPair);
    const target = page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA; 30 obras', exact: true });
    const wheelEvents = await page.evaluateHandle(() => {
      const cancelled: boolean[] = [];
      const listener = (event: WheelEvent) => cancelled.push(event.defaultPrevented);
      window.addEventListener('wheel', listener, { passive: true });
      return { cancelled, stop: () => window.removeEventListener('wheel', listener) };
    });
    let wheelFailure: unknown;
    try {
      await target.hover();
      const world = page.locator('[data-comparison-world]');
      const camera = await world.getAttribute('style');
      await page.mouse.wheel(0, -80);
      await expect.poll(() => wheelEvents.evaluate(probe => probe.cancelled.length)).toBe(1);
      await expect(canvas).toHaveAttribute('data-view', 'venn');
      await preserveSelection('venn-after-first-wheel');
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel(0, -100);
        await expect.poll(() => wheelEvents.evaluate(probe => probe.cancelled.length)).toBe(i + 2);
        await expect(canvas).toHaveAttribute('data-view', 'venn');
        await preserveSelection(`venn-after-burst-${i + 2}`);
      }
      expect(await world.getAttribute('style')).toBe(camera);
      await target.click(); await settled(page);
      await preserveSelection('region-before-wheel');
      const cover = page.locator(`[data-work-key="book:${fixture.books[0].id}"]`);
      await cover.hover(); await page.mouse.wheel(0, -80);
      await expect.poll(() => wheelEvents.evaluate(probe => probe.cancelled.length)).toBe(10);
      await expect(canvas).toHaveAttribute('data-view', 'region');
      await preserveSelection('region-after-wheel');
      await cover.click(); await settled(page);
      await expect(page.getByRole('link', { name: 'Ver ficha', exact: true })).toBeVisible();
      await preserveSelection('work-before-wheel');
      await cover.hover(); await page.mouse.wheel(0, 0); await page.mouse.wheel(0, -100);
      await expect.poll(() => wheelEvents.evaluate(probe => probe.cancelled.length)).toBeGreaterThanOrEqual(11);
      await expect(canvas).toHaveAttribute('data-view', 'work');
      await preserveSelection('work-after-wheel');
      const beforeModifier = await wheelEvents.evaluate(probe => probe.cancelled.length);
      await page.keyboard.down('Control');
      try { await page.mouse.wheel(0, 120); }
      finally { await page.keyboard.up('Control'); }
      await expect.poll(() => wheelEvents.evaluate(probe => probe.cancelled.length)).toBeGreaterThan(beforeModifier);
      await expect(canvas).toHaveAttribute('data-view', 'work');
      await preserveSelection('work-after-control-wheel');
      // Dispatch verifies cancellation for all delta modes without claiming
      // synthetic events cause native scrolling or browser zoom.
      for (const deltaMode of [0, 1, 2]) expect(await canvas.evaluate((node, mode) => node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, deltaMode: mode, metaKey: true, bubbles: true, cancelable: true })), deltaMode)).toBe(true);
      await preserveSelection('work-after-delta-modes');
      await page.getByRole('button', { name: 'Volver al cruce', exact: true }).click(); await settled(page);
      await page.getByRole('button', { name: 'Volver al Venn', exact: true }).click(); await settled(page);
      await page.getByRole('button', { name: 'Volver al grupo', exact: true }).click(); await settled(page);
      await preserveSelection('group-before-wheel');
      // Map covers intentionally overlap. Hover the frontmost active cover,
      // rather than asking actionability to expose a cover behind the pile.
      const mapCover = canvas.locator('button[data-work-key][data-inactive="false"][data-background="false"]').last();
      await mapCover.hover();
      const beforeMap = await canvas.evaluate(node => node.scrollTop);
      const beforeEvents = await wheelEvents.evaluate(probe => probe.cancelled.length);
      await page.mouse.wheel(0, 200);
      await expect.poll(() => wheelEvents.evaluate(probe => probe.cancelled.length)).toBeGreaterThan(beforeEvents);
      await expect.poll(() => canvas.evaluate(node => node.scrollTop)).toBeGreaterThan(beforeMap);
      await expect(canvas).toHaveAttribute('data-view', 'group');
      await preserveSelection('group-after-wheel');
      const cancelled = await wheelEvents.evaluate(probe => probe.cancelled);
      expect(cancelled.every(value => !value)).toBe(true);
      const path = info.outputPath('native-wheel-events.json');
      await writeFile(path, JSON.stringify({ cancelled, beforeMap, afterMap: await canvas.evaluate(node => node.scrollTop), selections }, null, 2));
      await info.attach('native-wheel-events', { path, contentType: 'application/json' });
    } catch (error) { wheelFailure = error; throw error; }
    finally {
      try { if (!page.isClosed()) await wheelEvents.evaluate(probe => probe.stop()); }
      catch (cleanupError) {
        // Closing the browser already discards the listener. Preserve the
        // assertion/timeout that caused teardown instead of replacing it.
        if (!page.isClosed()) {
          if (wheelFailure !== undefined) throw new AggregateError([wheelFailure, cleanupError], 'Wheel verification and listener cleanup failed');
          throw cleanupError;
        }
      }
    }
  });
});
test('reduced motion applies destination directly and Escape returns with focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withComparisonFixture(async fixture => {
    const canvas = await openComparisonFixture(page, fixture); await settled(page); await pair(page); await region(page);
    const cover = page.locator(`[data-work-key="book:${fixture.books[0].id}"]`);
    await cover.click(); await expect(canvas).toHaveAttribute('data-camera-moving', 'false');
    const box = await cover.boundingBox(); await page.waitForTimeout(150); expect(await cover.boundingBox()).toEqual(box);
    await visibleWorkEntry(page, fixture.books[0].title);
    await page.keyboard.press('Escape'); await expect(canvas).toHaveAttribute('data-view', 'region');
    await expect(cover).toBeFocused();
    const world = await page.locator('[data-comparison-world]').getAttribute('style');
    await page.keyboard.press('ArrowRight'); expect(await page.locator('[data-comparison-world]').getAttribute('style')).toBe(world);
    await page.keyboard.press('Escape'); await expect(canvas).toHaveAttribute('data-view', 'venn');
    await page.keyboard.press('Escape'); await expect(canvas).toHaveAttribute('data-view', 'group');
    await expect(page.locator('[data-map-pair]').first()).toBeFocused();
  });
});
test('320px fixed canvas scroll reaches last loaded cover, touch opens actual work and return restores node, batch, scroll and focus', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 }, hasTouch: true }); const page = await context.newPage();
  try {
    await withComparisonFixture(async fixture => {
      const canvas = await openComparisonFixture(page, fixture); await settled(page); await pair(page); await region(page);
      const frameHeight = (await canvas.boundingBox())!.height;
      await page.getByRole('button', { name: 'Cargar más', exact: true }).tap(); await settled(page);
      await expect(page.getByText('30 de 30 obras', { exact: true })).toBeVisible();
      const last = page.locator(`[data-work-key="book:${fixture.books.at(-1)!.id}"]`); const node = await last.elementHandle();
      await last.scrollIntoViewIfNeeded(); const scroll = await page.evaluate(() => window.scrollY);
      const canvasScroll = await canvas.evaluate(node => node.scrollTop);
      expect(canvasScroll).toBeGreaterThan(1500); await expect(last).toBeInViewport();
      expect((await canvas.boundingBox())!.height).toBeCloseTo(frameHeight, 0);
      const firstBox = await last.boundingBox();
      await last.tap(); await settled(page); await expect(last).toBeInViewport();
      expect((await last.boundingBox())!.width).not.toBe(firstBox!.width);
      const entry = await visibleWorkEntry(page, fixture.books.at(-1)!.title);
      await writeFile(info.outputPath('mobile-entry-visibility.json'), JSON.stringify({ viewport: page.viewportSize(), savedScroll: scroll, savedCanvasScroll: canvasScroll, frameHeight, entry }, null, 2));
      expect((await canvas.boundingBox())!.height).toBeCloseTo(frameHeight, 0);
      await page.screenshot({ path: info.outputPath('mobile-work-destination.png') });
      await last.tap(); // Tapping the current destination must preserve origin scroll.
      await page.getByRole('button', { name: 'Volver al cruce', exact: true }).tap(); await settled(page);
      await expect(last).toBeFocused(); await expect(last).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
      expect(await canvas.evaluate(node => node.scrollTop)).toBeCloseTo(canvasScroll, 0);
      expect((await canvas.boundingBox())!.height).toBeCloseTo(frameHeight, 0);
      expect(await node!.evaluate(original => original.isConnected)).toBe(true);
      await expect(page.getByText('30 de 30 obras', { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath('mobile-last-cover-return.png') });
    });
  } finally { await context.close(); }
});


