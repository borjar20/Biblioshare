import { expect, test as base, type Page, type TestInfo, type Request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { chooseComparisonParticipants, comparisonRest, deleteComparisonActor, loginComparisonActor, withComparisonFixture, type ComparisonActor, type ComparisonFixture } from './support/comparison-fixtures';

function coverOwnership(request: Request) {
  const url = new URL(request.url());
  if (url.hostname !== 'comparison-fixture.invalid') return null;
  const worker = request.serviceWorker();
  let frame: string | null = null;
  if (!worker) { try { const source = new URL(request.frame().url()); frame = source.origin + source.pathname; } catch { /* Frame may already be detached. */ } }
  return { url: url.origin + url.pathname, resourceType: request.resourceType(), worker: worker?.url() ?? null, frame };
}
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
    const covers: unknown[] = [];
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push(message.text()); });
    });
    context.on('request', request => { started.set(request, Date.now()); const cover = coverOwnership(request); if (cover) covers.push({ ...cover, event: 'request' }); });
    context.on('requestfailed', request => { failures.push(`${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText}`); const cover = coverOwnership(request); if (cover) covers.push({ ...cover, event: 'failed', error: request.failure()?.errorText }); });
    context.on('response', response => {
      pending.push((async () => {
        const request = response.request(), path = new URL(response.url()).pathname;
        const cover = coverOwnership(request); if (cover) covers.push({ ...cover, event: 'response', status: response.status(), fromServiceWorker: response.fromServiceWorker() });
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
    await attachJson(info, 'browser-journal', { journal, errors, consoleMessages, failures, covers });
    expect(errors, 'uncaught browser errors').toEqual([]);
  }, { auto: true }],
});
async function settled(page: Page) {
  await expect(page.locator('[data-atlas-moving]').first()).toBeAttached();
  await expect(page.locator('[data-atlas-moving="true"]')).toHaveCount(0);
}
async function groups(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Grupos', exact: true });
  if (!await sheet.isVisible()) await page.getByRole('button', { name: /^Grupo: / }).click();
  return sheet;
}
const faces = (page: Page) => page.getByRole('group', { name: 'Personas del cruce', exact: true }).getByRole('button');
const summary = (page: Page) => page.locator('[data-comparison-stage]').getByRole('status');
async function createGroup(page: Page, actors: ComparisonActor[], name = 'Mi grupo QA', owner = actors[0]) {
  const firstGroup = page.getByRole('button', { name: 'Crear tu primer grupo', exact: true });
  if (await firstGroup.isVisible()) await firstGroup.click();
  else await (await groups(page)).getByRole('button', { name: 'Crear grupo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear grupo' });
  await form.getByLabel('Nombre del grupo').fill(name);
  // The owner never has to pick themselves: a new group starts with them included.
  await expect(form.getByRole('checkbox', { name: 'Incluirme en la comparación', exact: true })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: owner.name, exact: true })).toHaveCount(0);
  await chooseComparisonParticipants(form, owner, actors);
  await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.getByRole('button', { name: `Grupo: ${name}`, exact: true })).toBeVisible();
  await settled(page);
  return new URL(page.url()).searchParams.get('group')!;
}
async function open(page: Page, fixture: ComparisonFixture, actors = fixture.actors, name?: string) {
  await loginComparisonActor(page, fixture.actors[0]);
  await page.goto('/comunidad/entre-nosotros');
  return createGroup(page, actors, name);
}
async function comparisonResponse(page: Page, action: () => Promise<unknown>, predicate: (request: string) => boolean = () => true) {
  // Inspect genuine upstream bytes before browser delivery: Chromium can lose
  // the CDP resource body even after waitForResponse reports HTTP 200.
  let done!: (value: { body: string; request: string }) => void;
  let reject!: (error: unknown) => void;
  const captured = new Promise<{ body: string; request: string }>((resolve, fail) => { done = resolve; reject = fail; });
  const handler: Parameters<Page['route']>[1] = async route => {
    const request = route.request().postData() ?? '';
    if (route.request().method() !== 'POST' || !route.request().headers()['next-action'] || !predicate(request)) return route.continue();
    try {
      const upstream = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
      expect(upstream.status()).toBe(200);
      const body = await upstream.text(); await route.fulfill({ response: upstream }); done({ body, request });
    } catch (error) { reject(error); }
  };
  await page.route('**/comunidad/entre-nosotros**', handler);
  try { const [, response] = await Promise.all([action(), captured]); return response; }
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

test('ten-person CRUD, owner-free group, atlas faces and formats, persistence and keyboard', async ({ page, journal }, info) => {
  await withComparisonFixture(async fixture => {
    const group = await open(page, fixture);
    expect(group).toMatch(/^[0-9a-f-]{36}$/);
    await expect(faces(page)).toHaveCount(10);
    expect(journal.some(row => row.body?.includes('PRIVATE PASS QA MUST NOT LEAVE'))).toBe(false);
    // All ten share the first three books; the first three also share 27 more, the movie and the series.
    await expect(summary(page)).toHaveText('3 obras en común entre las 10 personas');
    for (const actor of fixture.actors.slice(3)) await faces(page).filter({ hasText: actor.name }).click();
    await expect(summary(page)).toHaveText('32 obras en común entre Tú, Beatriz QA y Carlos QA');
    await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await settled(page);
    await expect(summary(page)).toHaveText('30 obras en común entre Tú, Beatriz QA y Carlos QA');
    await page.reload(); await settled(page); await expect(page.getByRole('button', { name: 'Grupo: Mi grupo QA', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('group')).toBe(group);
    await (await groups(page)).getByRole('button', { name: 'Editar grupo', exact: true }).click();
    const form = page.getByRole('form', { name: 'Editar grupo' });
    await expect(form.getByLabel('Nombre del grupo')).toBeFocused();
    await form.getByLabel('Nombre del grupo').fill('Grupo sin dueño QA');
    await form.getByRole('checkbox', { name: 'Incluirme en la comparación', exact: true }).setChecked(false);
    for (const [index, actor] of fixture.actors.entries()) if (index > 0) await form.getByRole('checkbox', { name: actor.name, exact: true }).setChecked(index === 1 || index === 2);
    await form.getByRole('button', { name: 'Guardar grupo', exact: true }).focus(); await page.keyboard.press('Enter'); await settled(page);
    await expect(faces(page).filter({ hasText: 'Tú' })).toHaveCount(0); await expect(faces(page)).toHaveCount(2);
    await (await groups(page)).getByRole('button', { name: 'Editar grupo', exact: true }).click();
    await page.getByRole('form', { name: 'Editar grupo' }).getByRole('button', { name: 'Eliminar grupo', exact: true }).focus(); await page.keyboard.press('Enter');
    const focusAfterConfirm = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100) }));
    await attachJson(info, 'editor-confirmation-focus-observation', { focusAfterConfirm });
    // The confirmation's Cancel sits in the sheet body, before the footer's Cancel.
    const safeCancel = form.getByRole('button', { name: 'Cancelar', exact: true }).first();
    await expect(safeCancel).toBeFocused(); await page.keyboard.press('Enter');
    await expect(form.getByRole('button', { name: 'Eliminar grupo', exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(safeCancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(form.getByRole('button', { name: 'Confirmar eliminación', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
    const empty = page.getByRole('main').getByText('Compara con quien sigues', { exact: true });
    await expect(empty).toHaveCount(1); await expect(empty).toBeVisible();
  }, { integrated: true });
});

test('two real tabs conflict, same-account focus preserves context, cookie logout/account switch removes old evidence', async ({ page, context }, info) => {
  await withComparisonFixture(async fixture => {
    const group = await open(page, fixture, fixture.actors.slice(0, 3));
    const other = await context.newPage(); await other.goto(`/comunidad/entre-nosotros?group=${group}`); await settled(other);
    await (await groups(page)).getByRole('button', { name: 'Editar grupo', exact: true }).click();
    await (await groups(other)).getByRole('button', { name: 'Editar grupo', exact: true }).click();
    await other.getByRole('form', { name: 'Editar grupo' }).getByLabel('Nombre del grupo').fill('Otra pestaña QA');
    // The atlas host settles before the Server Action answers: wait for the other
    // tab's save to commit, or this tab may save first and win the race.
    const otherSaved = other.waitForResponse(response => !!response.request().headers()['next-action'] && !!response.request().postData()?.includes('Otra pestaña QA'));
    await other.getByRole('form', { name: 'Editar grupo' }).getByRole('button', { name: 'Guardar grupo', exact: true }).click();
    await otherSaved; await expect(other.getByRole('button', { name: 'Grupo: Otra pestaña QA', exact: true })).toBeVisible(); await settled(other);
    const conflict = await comparisonResponse(page, () => page.getByRole('form', { name: 'Editar grupo' }).getByRole('button', { name: 'Guardar grupo', exact: true }).click(), request => request.includes('expectedRevision'));
    expect(resultBody(conflict)).toEqual({ ok: false, code: 'conflict' });
    await expect(page.getByRole('form', { name: 'Editar grupo' }).getByRole('alert')).toContainText('otra pestaña');
    // «Recargar grupo» loads at once and again when router.refresh brings the new
    // revision. Selecting people between both found no chips (CI #1491): wait for
    // the comparison request issued after the refreshed groups arrive.
    let groupsRefreshed = false;
    const refreshedGroups = page.waitForResponse(response => response.request().method() === 'GET' && response.request().headers()['rsc'] === '1'
      && response.url().includes('/comunidad/entre-nosotros')).then(response => { groupsRefreshed = true; return response; });
    const reloadAfterRefresh = page.waitForRequest(request => groupsRefreshed && request.method() === 'POST' && !!request.headers()['next-action']);
    await page.getByRole('button', { name: 'Recargar grupo', exact: true }).click();
    await refreshedGroups; await (await reloadAfterRefresh).response(); await settled(page);
    await page.getByRole('button', { name: 'Opinión', exact: true }).click();
    await faces(page).filter({ hasText: 'Carlos QA' }).click(); await settled(page);
    await other.bringToFront(); await page.bringToFront();
    await expect(page.getByRole('button', { name: 'Opinión', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(faces(page).filter({ hasText: 'Carlos QA' })).toHaveAttribute('aria-pressed', 'false');
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
      // Unchanged session cookies: the same account keeps its evidence while auth answers.
      await expect(page.getByText('Verificando tu sesi\u00f3n\u2026', { exact: true })).toHaveCount(0);
      await expect(page.locator('[data-comparison-slot="works"]')).toBeVisible();
      await other.bringToFront();
      await other.getByRole('button', { name: 'Cerrar sesi\u00f3n', exact: true }).click();
      await expect(other).toHaveURL(new URL('/', info.project.use.baseURL).href); mark('real logout completed');
      await loginComparisonActor(other, fixture.actors[2]);
      await expect(other.getByRole('link', { name: 'Mi perfil', exact: true })).toHaveAttribute('href', `/u/${fixture.actors[2].username}`);
      mark('B real login completed and profile verified');
      // B's login rewrote the shared cookies: the focus itself hides A before auth answers.
      await page.bringToFront();
      const visibilityProbe = await page.evaluateHandle(() => {
        window.dispatchEvent(new Event('focus'));
        const samples: { t: number; oldVisible: boolean; path: string }[] = []; let running = true;
        const start = performance.now();
        function tick() {
          const oldVisible = [...document.querySelectorAll('h2')].some(node => node.textContent === 'Otra pesta\u00f1a QA' && node.getClientRects().length > 0);
          samples.push({ t: performance.now() - start, oldVisible, path: location.pathname });
          if (running) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick); return { samples, stop() { running = false; } };
      });
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
    // B follows nobody in the fixture: the empty state points to people to follow.
    const empty = page.getByRole('main').getByText('Aún no sigues a nadie', { exact: true });
    await expect(empty).toHaveCount(1); await expect(empty).toBeVisible();
    await expect((await groups(page)).getByRole('option', { name: 'Otra pestaña QA', exact: true })).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-comparison-stage]')).toHaveCount(0);
    // The atlas route is full-bleed (no app topbar): confirm the tab's account where «Mi perfil» lives.
    await page.goto('/comunidad');
    await expect(page.getByRole('link', { name: 'Mi perfil', exact: true })).toHaveAttribute('href', `/u/${fixture.actors[2].username}`);
    await attachJson(info, 'identity-switch', { group, oldEvidenceRemoved: true, newAccount: fixture.actors[2].username, authChecks, staleResponseAccount: fixture.actors[0].username });
    await other.close();
  }, { integrated: true });
});

test('foreign owner isolation and revoke/block/delete redact actual action responses and UI', async ({ page, browser }) => {
  await withComparisonFixture(async fixture => {
    const group = await open(page, fixture, fixture.actors.slice(0, 3));
    const ownerResponse = page.waitForResponse(response => !!response.request().headers()['next-action'] && response.request().postData() === JSON.stringify([group, 'all']));
    await (await groups(page)).getByRole('button', { name: 'Actualizar', exact: true }).click();
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
      await expect((await groups(strangerPage)).getByRole('option', { name: 'Mi grupo QA', exact: true })).toHaveCount(0);
      await expect(strangerPage.locator('[data-comparison-stage]')).toHaveCount(0);
    } finally { await stranger.close(); }
    await comparisonRest(`follows?follower_id=eq.${fixture.actors[0].id}&followee_id=eq.${fixture.actors[1].id}`, { method: 'DELETE' });
    const revoked = resultBody(await comparisonResponse(page, async () => (await groups(page)).getByRole('button', { name: 'Actualizar', exact: true }).click()));
    expect(revoked.data.group.members[1]).toMatchObject({ userId: null, name: null, avatarUrl: null, available: false });
    expect(revoked.data.works.some((work: { userId: string }) => work.userId === fixture.actors[1].id)).toBe(false);
    await expect(faces(page).filter({ hasText: 'Beatriz QA' })).toHaveCount(0);
    await comparisonRest('user_blocks', { method: 'POST', body: JSON.stringify({ blocker_id: fixture.actors[0].id, blocked_id: fixture.actors[2].id }) });
    const blocked = resultBody(await comparisonResponse(page, async () => (await groups(page)).getByRole('button', { name: 'Actualizar', exact: true }).click()));
    expect(blocked.data.group.members[2]).toMatchObject({ userId: null, name: null, available: false });
    await comparisonRest(`user_blocks?blocker_id=eq.${fixture.actors[0].id}&blocked_id=eq.${fixture.actors[2].id}`, { method: 'DELETE' });
    await deleteComparisonActor(fixture.actors[2]);
    const deleted = resultBody(await comparisonResponse(page, async () => (await groups(page)).getByRole('button', { name: 'Actualizar', exact: true }).click()));
    expect(deleted.data.group.members[2]).toMatchObject({ userId: null, name: null, available: false });
    expect(deleted.data.works.every((work: { userId: string }) => work.userId === fixture.actors[0].id)).toBe(true);
    expect(JSON.stringify(deleted)).not.toContain('PRIVATE');
    // Only «Tú» remains available; the revoked and deleted members stay as «Persona no disponible».
    await expect(faces(page)).toHaveCount(3);
    await expect(faces(page).filter({ hasText: 'Persona no disponible' })).toHaveCount(2);
  }, { integrated: true });
});

test('profile «Comparar» opens an unsaved pair and «Guardar como grupo» keeps it (#1484)', async ({ page }) => {
  await withComparisonFixture(async fixture => {
    const [owner, beatriz] = fixture.actors;
    await loginComparisonActor(page, owner);
    await page.goto(`/u/${beatriz.username}`);
    await page.getByRole('link', { name: 'Comparar', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/comunidad/entre-nosotros' && url.searchParams.get('con') === beatriz.id);
    await settled(page);
    const select = (await groups(page)).getByRole('combobox', { name: 'Grupo', exact: true });
    await expect(select).toHaveValue(`with:${beatriz.id}`);
    await expect(select.locator('option:checked')).toHaveText('Tú y Beatriz QA · sin guardar');
    await page.keyboard.press('Escape');
    // The pair shares the 30 fixture books; nothing was saved to get here.
    await expect(summary(page)).toHaveText('30 obras en común entre Tú y Beatriz QA');
    expect(await (await comparisonRest(`comparison_groups?owner_id=eq.${owner.id}&select=id`)).json()).toEqual([]);
    await (await groups(page)).getByRole('button', { name: 'Guardar como grupo', exact: true }).click();
    const form = page.getByRole('form', { name: 'Crear grupo' });
    await expect(form.getByLabel('Nombre del grupo')).toHaveValue('Tú y Beatriz QA');
    await expect(form.getByRole('checkbox', { name: 'Beatriz QA', exact: true })).toBeChecked();
    await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
    // The unsaved pair already shows this name: wait for the saved group's URL instead.
    await expect(page).toHaveURL(url => /^[0-9a-f-]{36}$/.test(url.searchParams.get('group') ?? '') && !url.searchParams.has('con')); await settled(page);
    await expect((await groups(page)).getByRole('combobox', { name: 'Grupo', exact: true }).locator('option:checked')).toHaveText('Tú y Beatriz QA');
    await page.keyboard.press('Escape');
    expect(await (await comparisonRest(`comparison_groups?owner_id=eq.${owner.id}&select=name`)).json()).toEqual([{ name: 'Tú y Beatriz QA' }]);
    // A profile you do not follow offers no comparison.
    await page.goto(`/u/${fixture.actors[2].username}`);
    await comparisonRest(`follows?follower_id=eq.${owner.id}&followee_id=eq.${fixture.actors[2].id}`, { method: 'DELETE' });
    await page.reload();
    await expect(page.getByRole('link', { name: 'Comparar', exact: true })).toHaveCount(0);
  });
});

test('read transport error clears visible evidence and explicit retry recovers real data', async ({ page }) => {
  await withComparisonFixture(async fixture => {
    await open(page, fixture, fixture.actors.slice(0, 3));
    await page.route('**/comunidad/entre-nosotros**', route => route.request().headers()['next-action'] ? route.abort('failed') : route.continue());
    await (await groups(page)).getByRole('button', { name: 'Actualizar', exact: true }).click();
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
    await (await groups(page)).getByRole('button', { name: 'Actualizar', exact: true }).click();
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

