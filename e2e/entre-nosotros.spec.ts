import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { comparisonRest, deleteComparisonActor, loginComparisonActor, withComparisonFixture, type ComparisonActor, type ComparisonFixture } from './support/comparison-fixtures';

type Record = { method: string; path: string; status: number; ms: number; bytes: number; body?: string; bodyState?: 'complete' | 'unavailable' | 'incomplete'; request?: string };
async function attachJson(info: TestInfo, name: string, data: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}
const test = base.extend<{ journal: Record[] }>({
  journal: [async ({ context }, use, info) => {
    const journal: Record[] = [], errors: string[] = [], consoleMessages: string[] = [], failures: string[] = [];
    const started = new Map<object, number>(), pending: Promise<void>[] = [];
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push(message.text()); });
    });
    context.on('request', request => started.set(request, Date.now()));
    context.on('requestfailed', request => failures.push(`${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
    context.on('response', response => {
      pending.push((async () => {
        const request = response.request(), path = new URL(response.url()).pathname;
        const action = !!request.headers()['next-action'] && path.includes('/entre-nosotros');
        let body = '', bodyState: Record['bodyState'] = 'complete';
        if (action) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            body = await Promise.race([response.text(), new Promise<string>(resolve => {
              timer = setTimeout(() => { bodyState = 'incomplete'; resolve('[body incomplete after 5s]'); }, 5000);
            })]);
          } catch { bodyState = 'unavailable'; body = '[body unavailable]'; }
          finally { clearTimeout(timer); }
        }
        journal.push({ method: request.method(), path, status: response.status(), ms: Date.now() - (started.get(request) ?? Date.now()), bytes: Buffer.byteLength(body),
          ...(action ? { body, bodyState, request: request.postData() ?? '' } : {}) });
      })());
    });
    await use(journal);
    await Promise.all(pending);
    await attachJson(info, 'browser-journal', { journal, errors, consoleMessages, failures });
    expect(errors, 'uncaught browser errors').toEqual([]);
  }, { auto: true }],
});
async function settled(page: Page) {
  await expect(page.locator('[data-camera-moving]')).toHaveAttribute('data-camera-moving', 'false');
}
async function createGroup(page: Page, actors: ComparisonActor[], name = 'Mi grupo QA') {
  await page.getByRole('button', { name: 'Crear grupo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear grupo' });
  await form.getByLabel('Nombre del grupo').fill(name);
  for (const actor of actors) await form.getByRole('checkbox', { name: actor.name, exact: true }).check();
  await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await settled(page);
  return new URL(page.url()).searchParams.get('group')!;
}
async function open(page: Page, fixture: ComparisonFixture, actors = fixture.actors, name?: string) {
  await loginComparisonActor(page, fixture.actors[0]);
  await page.goto('/comunidad/entre-nosotros');
  return createGroup(page, actors, name);
}
async function selectPeople(page: Page, fixture: ComparisonFixture, selected: number[]) {
  for (const [index, actor] of fixture.actors.entries()) {
    const checkbox = page.getByRole('checkbox', { name: actor.name, exact: true });
    if (await checkbox.count()) await checkbox.setChecked(selected.includes(index));
  }
}
async function comparisonResponse(page: Page, action: () => Promise<unknown>, predicate: (request: string) => boolean = () => true) {
  const response = page.waitForResponse(response => response.request().method() === 'POST' && !!response.request().headers()['next-action'] &&
    new URL(response.url()).pathname.includes('/entre-nosotros') && predicate(response.request().postData() ?? ''));
  await action();
  const result = await response;
  expect(result.status()).toBe(200);
  return { body: await result.text(), request: result.request().postData() ?? '' };
}
async function bufferedSaveResponse(page: Page, action: () => Promise<unknown>) {
  let done!: (value: { body: string; request: string }) => void;
  let reject!: (error: unknown) => void;
  const captured = new Promise<{ body: string; request: string }>((resolve, fail) => { done = resolve; reject = fail; });
  const handler: Parameters<Page['route']>[1] = async route => {
    const request = route.request().postData() ?? '';
    if (!route.request().headers()['next-action'] || !request.includes('expectedRevision')) return route.continue();
    try {
      const upstream = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
      expect(upstream.status()).toBe(200);
      const body = await upstream.text(); await route.fulfill({ response: upstream }); done({ body, request });
    } catch (error) { reject(error); }
  };
  await page.route('**/comunidad/entre-nosotros**', handler);
  try { await action(); return await captured; }
  finally { await page.unroute('**/comunidad/entre-nosotros**', handler); }
}
function resultBody(response: { body: string }) {
  for (const line of response.body.split('\n')) {
    try {
      const value = JSON.parse(line.slice(line.indexOf(':') + 1));
      if (value && typeof value === 'object' && 'ok' in value) return value;
    } catch { /* Flight framing lines are not all JSON values. */ }
  }
  throw new Error('Missing Server Action result in real response');
}
async function geometry(page: Page, info: TestInfo, name: string) {
  const data = await page.evaluate(() => {
    const stage = document.querySelector('[data-comparison-stage]')!;
    return { viewport: { width: innerWidth, height: innerHeight }, scrollY, documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight, stage: stage.getBoundingClientRect().toJSON(),
      colors: { background: getComputedStyle(stage).backgroundColor, text: getComputedStyle(stage).color } };
  });
  expect(data.documentWidth).toBeLessThanOrEqual(data.viewport.width);
  await attachJson(info, name, data);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
  return data;
}

test('ten-person CRUD, owner-free group, exact pair/trio, formats, notes, persistence and keyboard', async ({ page, journal }, info) => {
  await withComparisonFixture(async fixture => {
    const group = await open(page, fixture);
    expect(group).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByRole('checkbox')).toHaveCount(10);
    expect(journal.some(row => row.body?.includes('PRIVATE PASS QA MUST NOT LEAVE'))).toBe(false);
    await selectPeople(page, fixture, [0, 1]);
    await page.getByRole('button', { name: 'Comparar selección', exact: true }).click(); await settled(page);
    await expect(page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA; 32 obras', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Carlos QA', exact: true }).check(); await settled(page);
    await expect(page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA; 0 obras', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA, Carlos QA; 32 obras', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('book'); await settled(page);
    await expect(page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA, Carlos QA; 30 obras', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir región: Ana QA, Beatriz QA, Carlos QA; 30 obras', exact: true }).click(); await settled(page);
    const cover = page.locator(`[data-work-key="book:${fixture.books[0].id}"]`);
    const detail = await comparisonResponse(page, () => cover.click(), request => request.includes(`book:${fixture.books[0].id}`));
    const result = resultBody(detail);
    expect(result.data.people.map((person: { userId: string }) => person.userId).sort()).toEqual(fixture.actors.slice(0, 3).map(actor => actor.id).sort());
    expect(result.data.people.find((person: { userId: string }) => person.userId === fixture.actors[0].id).rating).toBeNull();
    await expect(page.getByRole('link', { name: 'Ver ficha', exact: true })).toBeVisible(); await settled(page);
    await expect(page.getByText('Sin valorar', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await settled(page); await expect(cover).toBeFocused();
    await page.reload(); await settled(page); await expect(page.getByRole('heading', { name: 'Mi grupo QA', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('group')).toBe(group);
    await page.getByRole('button', { name: 'Editar grupo', exact: true }).click();
    const form = page.getByRole('form', { name: 'Editar grupo' });
    await expect(form.getByLabel('Nombre del grupo')).toBeFocused();
    await form.getByLabel('Nombre del grupo').fill('Grupo sin dueño QA');
    for (const [index, actor] of fixture.actors.entries()) await form.getByRole('checkbox', { name: actor.name, exact: true }).setChecked(index === 1 || index === 2);
    await form.getByRole('button', { name: 'Guardar grupo', exact: true }).focus(); await page.keyboard.press('Enter'); await settled(page);
    await expect(page.getByRole('checkbox', { name: 'Ana QA', exact: true })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await page.getByRole('button', { name: 'Editar grupo', exact: true }).click();
    await page.getByRole('form', { name: 'Editar grupo' }).getByRole('button', { name: 'Eliminar grupo', exact: true }).focus(); await page.keyboard.press('Enter');
    const focusAfterConfirm = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100) }));
    await attachJson(info, 'editor-confirmation-focus-observation', { focusAfterConfirm });
    await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Crea un grupo para empezar a comparar.', { exact: true })).toBeVisible();
  }, { integrated: true });
});

for (const width of [320, 768, 1280]) test(`Gustos restores A/B after Works selects C; ${width}px both themes and long async series evidence`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 });
  await withComparisonFixture(async fixture => {
    await open(page, fixture, fixture.actors.slice(0, 3));
    await selectPeople(page, fixture, [0, 1]);
    await page.getByRole('button', { name: 'Gustos', exact: true }).click();
    await page.getByRole('button', { name: 'Explorar Drama', exact: true }).click(); await settled(page);
    await page.getByRole('button', { name: 'Obras', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Carlos QA', exact: true }).check();
    await page.getByRole('button', { name: 'Gustos', exact: true }).click(); await settled(page);
    await expect(page.getByRole('checkbox', { name: 'Carlos QA', exact: true })).not.toBeChecked();
    for (const name of ['Ana QA', 'Beatriz QA']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
    await expect(page.getByRole('region', { name: 'Obras de Carlos QA', exact: true })).toHaveCount(0);
    const cover = page.locator(`[data-work-key="series:${fixture.series!.id}"]`), original = await cover.elementHandle();
    await cover.scrollIntoViewIfNeeded();
    const savedScroll = await page.evaluate(() => scrollY);
    // Delay transport delivery only: response is still the genuine action/RLS result.
    let release!: () => void;
    let originalDetailBody = '';
    const hold = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/comunidad/entre-nosotros**', async route => {
      if (route.request().method() !== 'POST' || !route.request().postData()?.includes(`series:${fixture.series!.id}`)) return route.continue();
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
      originalDetailBody = await response.text();
      await hold; await route.fulfill({ response });
    });
    const response = page.waitForResponse(response => response.request().postData()?.includes(`series:${fixture.series!.id}`) ?? false);
    const probe = await page.evaluateHandle(() => {
      const samples: { t: number; moving: string | null; height: number; transform: string }[] = [];
      const start = performance.now(); let running = true;
      function tick() { const node = document.querySelector('[data-camera-moving]')!, stage = document.querySelector('[data-comparison-stage]')!;
        samples.push({ t: performance.now() - start, moving: node.getAttribute('data-camera-moving'), height: stage.getBoundingClientRect().height,
          transform: (document.querySelector('[data-comparison-world]') as HTMLElement).style.transform }); if (running) requestAnimationFrame(tick); }
      requestAnimationFrame(tick); return { samples, stop() { running = false; } };
    });
    await cover.click(); await page.waitForTimeout(300); release();
    const detail = await response;
    expect(detail.status()).toBe(200);
    expect(JSON.parse(detail.request().postData()!)[2]).toEqual(fixture.actors.slice(0, 2).map(actor => actor.id));
    // Read the same original forwarded response, avoiding Chromium's intermittent
    // Network.getResponseBody failure without replacing the delivered DTO.
    const dto = resultBody({ body: originalDetailBody }); expect(dto.data.commonEpisodes).toHaveLength(40);
    await expect(page.getByRole('link', { name: 'Ver ficha', exact: true })).toBeVisible(); await settled(page);
    await page.waitForTimeout(300); await probe.evaluate(probe => probe.stop());
    const samples = await probe.evaluate(probe => probe.samples);
    const finalMoving = samples.findLastIndex(sample => sample.moving === 'true');
    // Measured wall clock includes native click/commit overhead; catches a response-driven restart.
    expect(samples[finalMoving].t - samples.find(sample => sample.moving === 'true')!.t).toBeLessThan(950);
    const final = samples.at(-1)!;
    expect(final.height).toBeGreaterThan(3000);
    expect(samples.slice(finalMoving + 2).every(sample => sample.transform === final.transform)).toBe(true);
    expect(await original!.evaluate(node => node.isConnected)).toBe(true);
    await expect(page.getByRole('button', { name: 'Volver a la categoría', exact: true })).toBeFocused();
    for (const [index, status] of ['completed', 'dropped'].entries()) {
      expect(dto.data.people.find((person: { userId: string }) => person.userId === fixture.actors[index].id).progress.status).toBe(status);
    }
    await expect(page.getByText('Abandonada', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Terminada', { exact: true })).toHaveCount(1);
    const titleLayout = await page.getByRole('heading', { name: fixture.series!.title, exact: true }).evaluate((heading, key) => {
      const cover = document.querySelector(`[data-work-key="${key}"]`)!, stage = heading.closest('[data-comparison-stage]')!;
      const title = heading.getBoundingClientRect(), hero = cover.getBoundingClientRect(), boundary = stage.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(heading);
      return { title: title.toJSON(), cover: hero.toJSON(), stage: boundary.toJSON(),
        overlapArea: Math.max(0, Math.min(title.right, hero.right) - Math.max(title.left, hero.left)) * Math.max(0, Math.min(title.bottom, hero.bottom) - Math.max(title.top, hero.top)),
        scrollWidth: heading.scrollWidth, clientWidth: heading.clientWidth,
        textRects: [...range.getClientRects()].map(rect => rect.toJSON()), text: heading.textContent };
    }, `series:${fixture.series!.id}`);
    await attachJson(info, `work-title-${width}`, titleLayout);
    expect(titleLayout.overlapArea, 'full heading must not pass behind the unchanged cover').toBe(0);
    expect(titleLayout.scrollWidth, 'full title text must fit its own box').toBeLessThanOrEqual(titleLayout.clientWidth + 1);
    expect(titleLayout.text).toBe(fixture.series!.title);
    for (const line of titleLayout.textRects) {
      expect(line.x).toBeGreaterThanOrEqual(titleLayout.stage.x - 1);
      expect(line.x + line.width).toBeLessThanOrEqual(titleLayout.stage.x + titleLayout.stage.width + 1);
      expect(line.y + line.height).toBeLessThanOrEqual(titleLayout.stage.y + titleLayout.stage.height + 1);
    }
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      await geometry(page, info, `series-${width}-${theme}`);
    }
    const last = page.getByRole('heading', { name: 'Temporada 1 · episodio 40', exact: true });
    await last.scrollIntoViewIfNeeded(); await expect(last).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(2000);
    await page.keyboard.press('Escape'); await settled(page); await expect(cover).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(savedScroll, 0);
    await attachJson(info, 'async-series-motion', { samples, savedScroll, width });
  }, { integrated: true });
});

test('two real tabs conflict, same-account focus preserves context, cookie logout/account switch removes old evidence', async ({ page, context }, info) => {
  await withComparisonFixture(async fixture => {
    const group = await open(page, fixture, fixture.actors.slice(0, 3));
    const other = await context.newPage(); await other.goto(`/comunidad/entre-nosotros?group=${group}`); await settled(other);
    await page.getByRole('button', { name: 'Editar grupo', exact: true }).click();
    await other.getByRole('button', { name: 'Editar grupo', exact: true }).click();
    await other.getByRole('form', { name: 'Editar grupo' }).getByLabel('Nombre del grupo').fill('Otra pestaña QA');
    await other.getByRole('form', { name: 'Editar grupo' }).getByRole('button', { name: 'Guardar grupo', exact: true }).click(); await settled(other);
    const conflict = await bufferedSaveResponse(page, () => page.getByRole('form', { name: 'Editar grupo' }).getByRole('button', { name: 'Guardar grupo', exact: true }).click());
    expect(resultBody(conflict)).toEqual({ ok: false, code: 'conflict' });
    await expect(page.getByRole('form', { name: 'Editar grupo' }).getByRole('alert')).toContainText('otra pestaña');
    await page.getByRole('button', { name: 'Recargar grupo', exact: true }).click(); await settled(page);
    await selectPeople(page, fixture, [0, 1]); await page.getByRole('button', { name: 'Gustos', exact: true }).click();
    await page.getByRole('button', { name: 'Explorar Drama', exact: true }).click(); await settled(page);
    await other.bringToFront(); await page.bringToFront();
    await expect(page.getByRole('checkbox', { name: 'Beatriz QA', exact: true })).toBeChecked();
    await expect(page.locator('[data-comparison-slot="tastes"]')).toHaveAttribute('data-view', 'facet');
    await other.goto('/ajustes');
    const timeline: { phase: string; t: number }[] = [];
    const mark = (phase: string) => timeline.push({ phase, t: Date.now() });
    let release!: () => void, capturedA!: () => void, deliveredA!: () => void, authChecks = 0;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const haveA = new Promise<void>(resolve => { capturedA = resolve; });
    const haveDeliveredA = new Promise<void>(resolve => { deliveredA = resolve; });
    let releaseRefresh!: () => void;
    const refreshHold = new Promise<void>(resolve => { releaseRefresh = resolve; });
    const refreshForwards: Promise<void>[] = [];
    // Delay only authentic RSC responses, so a null-session refresh cannot
    // navigate away before we deliver the already captured A response.
    const refreshHandler: Parameters<Page['route']>[1] = route => {
      if (route.request().method() !== 'GET' || route.request().headers()['rsc'] !== '1') return route.continue();
      const forward = (async () => {
        mark('old-tab RSC refresh forwarding');
        const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
        mark(`old-tab RSC response held status ${response.status()}`);
        await refreshHold; await route.fulfill({ response }); mark('original RSC response delivered');
      })();
      refreshForwards.push(forward); return forward;
    };
    await page.route('**/comunidad/entre-nosotros**', refreshHandler);
    await page.route('**/auth/v1/user', async route => {
      authChecks += 1;
      if (authChecks !== 1) return route.continue();
      mark('A verification forward started');
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect((await response.json()).id).toBe(fixture.actors[0].id);
      mark('A response received and held');
      capturedA(); await hold; await route.fulfill({ response }); mark('A response delivered'); deliveredA();
    });
    try {
      await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await haveA;
      await expect(page.getByText('Verificando tu sesi\u00f3n\u2026', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Otra pesta\u00f1a QA', exact: true })).not.toBeVisible();
      await other.bringToFront();
      await other.getByRole('button', { name: 'Cerrar sesi\u00f3n', exact: true }).click();
      await expect(other).toHaveURL('http://localhost:3000/'); mark('real logout completed');
      await loginComparisonActor(other, fixture.actors[2]);
      await expect(other.getByRole('link', { name: 'Mi perfil', exact: true })).toHaveAttribute('href', `/u/${fixture.actors[2].username}`);
      mark('B real login completed and profile verified');
      const visibilityProbe = await page.evaluateHandle(() => {
        const samples: { t: number; oldVisible: boolean; path: string }[] = []; let running = true;
        const start = performance.now();
        function tick() {
          const heading = [...document.querySelectorAll('h2')].find(node => node.textContent === 'Otra pesta\u00f1a QA');
          samples.push({ t: performance.now() - start, oldVisible: !!heading?.getClientRects().length, path: location.pathname });
          if (running) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick); return { samples, stop() { running = false; } };
      });
      await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      mark('fresh focus verification requested'); release(); mark('A response released after B login');
      await haveDeliveredA; await page.waitForTimeout(500); await visibilityProbe.evaluate(probe => probe.stop());
      const samples = await visibilityProbe.evaluate(probe => probe.samples);
      await attachJson(info, 'stale-auth-delivery', { timeline, authChecks, samples, oldAccount: fixture.actors[0].username,
        newAccount: fixture.actors[2].username, boundaryMountedAfterRelease: await page.getByText('La sesi\u00f3n ha cambiado. Actualizando tus grupos\u2026', { exact: true }).isVisible() });
      expect(samples.length).toBeGreaterThan(10);
      expect(samples.every(sample => !sample.oldVisible), 'late A must never reopen its visible evidence after real B login').toBe(true);
    } finally {
      release(); releaseRefresh(); await Promise.all(refreshForwards);
      await page.unroute('**/comunidad/entre-nosotros**', refreshHandler);
    }
    // A legitimate intermediate null refresh may redirect to login. The brief
    // requires old-state removal, not automatic navigation back into the feature.
    await page.goto(`/comunidad/entre-nosotros?group=${group}`);
    await expect(page.getByText('Crea un grupo para empezar a comparar.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mi perfil', exact: true })).toHaveAttribute('href', `/u/${fixture.actors[2].username}`);
    await expect(page.getByRole('option', { name: 'Otra pestaña QA', exact: true })).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-comparison-stage]')).toHaveCount(0);
    await attachJson(info, 'identity-switch', { group, oldEvidenceRemoved: true, newAccount: fixture.actors[2].username, authChecks, staleResponseAccount: fixture.actors[0].username });
    await other.close();
  }, { integrated: true });
});

test('foreign owner isolation and revoke/block/delete redact actual action responses and UI', async ({ page, browser }) => {
  await withComparisonFixture(async fixture => {
    const group = await open(page, fixture, fixture.actors.slice(0, 3));
    const ownerResponse = page.waitForResponse(response => !!response.request().headers()['next-action'] && response.request().postData() === JSON.stringify([group, 'all']));
    await page.getByRole('button', { name: 'Actualizar acceso', exact: true }).click();
    const ownerAction = (await ownerResponse).request(); await settled(page);
    const stranger = await browser.newContext(); const strangerPage = await stranger.newPage();
    try {
      await loginComparisonActor(strangerPage, fixture.actors[2]);
      const foreign = await strangerPage.goto(`/comunidad/entre-nosotros?group=${group}`);
      expect(foreign!.status()).toBe(200);
      const body = await foreign!.text();
      const forbidden = await strangerPage.request.post('/comunidad/entre-nosotros', {
        headers: { 'next-action': ownerAction.headers()['next-action'], 'Content-Type': 'text/plain;charset=UTF-8' }, data: ownerAction.postData()!,
      });
      expect(forbidden.status()).toBe(200);
      expect(resultBody({ body: await forbidden.text() })).toEqual({ ok: false, code: 'unavailable' });
      expect(body).not.toContain('Mi grupo QA'); expect(body).not.toContain(fixture.books[0].id);
      await expect(strangerPage.getByRole('option', { name: 'Mi grupo QA', exact: true })).toHaveCount(0);
      await expect(strangerPage.locator('[data-comparison-stage]')).toHaveCount(0);
    } finally { await stranger.close(); }
    await comparisonRest(`follows?follower_id=eq.${fixture.actors[0].id}&followee_id=eq.${fixture.actors[1].id}`, { method: 'DELETE' });
    const revoked = resultBody(await comparisonResponse(page, () => page.getByRole('button', { name: 'Actualizar acceso', exact: true }).click()));
    expect(revoked.data.group.members[1]).toMatchObject({ userId: null, name: null, avatarUrl: null, available: false });
    expect(revoked.data.works.some((work: { userId: string }) => work.userId === fixture.actors[1].id)).toBe(false);
    await expect(page.getByRole('checkbox', { name: 'Beatriz QA', exact: true })).toHaveCount(0);
    await comparisonRest('user_blocks', { method: 'POST', body: JSON.stringify({ blocker_id: fixture.actors[0].id, blocked_id: fixture.actors[2].id }) });
    const blocked = resultBody(await comparisonResponse(page, () => page.getByRole('button', { name: 'Actualizar acceso', exact: true }).click()));
    expect(blocked.data.group.members[2]).toMatchObject({ userId: null, name: null, available: false });
    await comparisonRest(`user_blocks?blocker_id=eq.${fixture.actors[0].id}&blocked_id=eq.${fixture.actors[2].id}`, { method: 'DELETE' });
    await deleteComparisonActor(fixture.actors[2]);
    const deleted = resultBody(await comparisonResponse(page, () => page.getByRole('button', { name: 'Actualizar acceso', exact: true }).click()));
    expect(deleted.data.group.members[2]).toMatchObject({ userId: null, name: null, available: false });
    expect(deleted.data.works.every((work: { userId: string }) => work.userId === fixture.actors[0].id)).toBe(true);
    expect(JSON.stringify(deleted)).not.toContain('PRIVATE');
    await expect(page.getByRole('checkbox')).toHaveCount(1);
  }, { integrated: true });
});

test('read transport error clears visible evidence and explicit retry recovers real data', async ({ page }) => {
  await withComparisonFixture(async fixture => {
    await open(page, fixture, fixture.actors.slice(0, 3));
    await page.route('**/comunidad/entre-nosotros**', route => route.request().headers()['next-action'] ? route.abort('failed') : route.continue());
    await page.getByRole('button', { name: 'Actualizar acceso', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Lienzo de comparación' }).getByRole('alert')).toBeVisible();
    await expect(page.locator('[data-comparison-stage]')).toHaveCount(0);
    await page.unroute('**/comunidad/entre-nosotros**');
    const recovered = resultBody(await comparisonResponse(page, () => page.getByRole('button', { name: 'Recargar comparación', exact: true }).click()));
    expect(recovered.ok).toBe(true); expect(recovered.data.works).toHaveLength(96);
    await settled(page);
  }, { integrated: true });
});

test('LOCAL ONLY ten-person full HTTP snapshot includes 1205 historical book passes without private prose', async ({ page }, info) => {
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin).toBe('http://127.0.0.1:54321');
  await page.setViewportSize({ width: 320, height: 800 });
  await withComparisonFixture(async fixture => {
    const start = Date.now(); const group = await open(page, fixture);
    const elapsed = Date.now() - start;
    const stage = page.locator('[data-comparison-stage]');
    const map = await stage.evaluate((stage, names) => {
      const boundary = stage.getBoundingClientRect();
      const people = names.map(name => {
        const node = [...stage.querySelectorAll('span')].find(node => node.textContent === name)!;
        const rect = node.getBoundingClientRect();
        return { name, rect: rect.toJSON(), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      });
      const summary = [...stage.querySelectorAll('strong')].find(node => node.parentElement?.querySelector('span'))!.parentElement!.getBoundingClientRect().toJSON();
      const covers = [...stage.querySelectorAll('[data-work-key]')].map(node => node.getBoundingClientRect().toJSON());
      return { stage: boundary.toJSON(), people, summary, covers };
    }, fixture.actors.map(actor => actor.name));
    await attachJson(info, 'ten-person-mobile-map', map);
    await stage.screenshot({ path: info.outputPath('ten-person-mobile-map.png') });
    // The tall element capture includes sticky shell at the current viewport.
    // A real full-page capture from the top keeps those controls at their normal
    // page positions, without hiding UI or changing the measured map geometry.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: info.outputPath('ten-person-mobile-map-full-page.png'), fullPage: true });
    for (const person of map.people) {
      expect(person.rect.x).toBeGreaterThanOrEqual(map.stage.x);
      expect(person.rect.x + person.rect.width).toBeLessThanOrEqual(map.stage.x + map.stage.width);
      expect(person.rect.top).toBeGreaterThanOrEqual(map.stage.top);
      expect(person.rect.bottom).toBeLessThanOrEqual(map.stage.bottom);
      expect(person.scrollWidth).toBeLessThanOrEqual(person.clientWidth + 1);
      for (const other of [map.summary, ...map.covers]) {
        const a = person.rect, b = other;
        expect(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)), `${person.name} must not intersect the summary or a cover`).toBe(0);
      }
    }
    expect(map.people.find(person => person.name === fixture.actors[3].name)!.rect.height).toBeGreaterThan(40);
    expect(map.summary.bottom).toBeLessThanOrEqual(map.stage.bottom);
    for (let first = 0; first < map.people.length; first++) for (let second = first + 1; second < map.people.length; second++) {
      const a = map.people[first].rect, b = map.people[second].rect;
      const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      expect(intersection, `${map.people[first].name} and ${map.people[second].name} name chips must not overlap`).toBe(0);
    }
    // Chromium cannot always retrieve this large Flight body through CDP.
    // Buffer the ORIGINAL upstream HTTP response and deliver it unchanged to UI.
    let captured!: (response: { body: string; status: number }) => void;
    const fullResponse = new Promise<{ body: string; status: number }>(resolve => { captured = resolve; });
    await page.route('**/comunidad/entre-nosotros**', async route => {
      if (!route.request().headers()['next-action'] || route.request().postData() !== JSON.stringify([group, 'all'])) return route.continue();
      const upstream = await route.fetch(); const body = await upstream.text();
      await route.fulfill({ response: upstream }); captured({ body, status: upstream.status() });
    });
    const before = Date.now();
    await page.getByRole('button', { name: 'Actualizar acceso', exact: true }).click();
    const response = await fullResponse; expect(response.status).toBe(200);
    const refreshMs = Date.now() - before, bytes = Buffer.byteLength(response.body), result = resultBody(response);
    expect(result.data.group.members).toHaveLength(10);
    expect(result.data.catalog.filter((work: { key: string }) => work.key.startsWith('book:'))).toHaveLength(1205);
    expect(result.data.works.filter((work: { userId: string; key: string }) => work.userId === fixture.actors[1].id && work.key.startsWith('book:'))).toHaveLength(1205);
    expect(response.body).not.toContain('PRIVATE');
    await settled(page);
    await attachJson(info, 'volume-measurement', { backend: 'local54321', members: 10, historicalBookPassesForPrivateMember: 1205, catalogWorks: result.data.catalog.length, personWorks: result.data.works.length, elapsedLoginCreateAndLoadMs: elapsed, refreshMs, uncompressedActionResponseBytes: bytes });
  }, { integrated: true, volume: true });
});
