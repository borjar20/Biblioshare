import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { chooseComparisonParticipants, comparisonRest, loginComparisonActor, withComparisonFixture, type ComparisonFixture } from './support/comparison-fixtures';

/**
 * A scene change starts on the next frame; a data reload can also replace the canvas. Only accept rest
 * after the same loaded host has crossed two frames, so its probe belongs to the scene being clicked.
 */
async function settled(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const host = document.querySelector('[data-atlas-moving]');
    const region = host?.closest('section[aria-busy]');
    if (!host || region?.getAttribute('aria-busy') !== 'false') return false;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return host.isConnected && host === document.querySelector('[data-atlas-moving]')
      && region.getAttribute('aria-busy') === 'false' && host.getAttribute('data-atlas-moving') === 'false';
  }), { message: 'la misma escena cargada termina de animarse y publica su sonda' }).toBe(true);
}
const lensSettled = settled;
async function openAtlas(page: Page, fixture: ComparisonFixture, participants = fixture.actors) {
  await loginComparisonActor(page, fixture.actors[0]);
  await page.goto('/comunidad/entre-nosotros');
  await page.getByRole('button', { name: 'Crear tu primer grupo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear grupo' });
  await form.getByLabel('Nombre del grupo').fill('Atlas QA');
  await chooseComparisonParticipants(form, fixture.actors[0], participants);
  await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Grupo: Atlas QA', exact: true })).toBeVisible();
  // Saving shows the group before router.replace finishes. Its final RSC can reload the snapshot and remount the canvas.
  await expect(page).toHaveURL(url => /^[0-9a-f-]{36}$/.test(url.searchParams.get('group') ?? ''));
  await settled(page);
}
const summary = (page: Page) => page.locator('[data-comparison-stage]').getByRole('status');
async function probe(page: Page) {
  return JSON.parse(await page.locator('[data-atlas-probe]').getAttribute('data-atlas-probe') ?? '[]') as { key: string; x: number; y: number }[];
}
/** Zoom into the shared group (a tap on a group at map zoom flies to it), then return a work on screen. */
async function zoomToWork(page: Page, tap: (x: number, y: number) => Promise<void>) {
  const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
  const [first] = await probe(page);
  await tap(box.x + first.x, box.y + first.y);
  // The flight starts on the next frame: until then the host still reads as settled at map zoom.
  await expect.poll(async () => Number(await page.locator('[data-atlas-moving]').getAttribute('data-atlas-zoom'))).toBeGreaterThan(1.1);
  await settled(page);
  expect(await zoom(page), 'el acercamiento sigue aplicado cuando termina la carga y la animación').toBeGreaterThan(1.1);
  const [work] = await probe(page);
  return { box, work };
}

test('escritorio: caras, resumen y clic que abre la ficha', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await expect(summary(page)).toHaveText('30 obras en común entre Tú, Beatriz QA y Carlos QA');
    const faces = page.getByRole('group', { name: 'Personas del cruce', exact: true });
    await faces.getByRole('button', { name: 'Carlos QA', exact: true }).click();
    await expect(summary(page)).toHaveText('30 obras en común entre Tú y Beatriz QA');
    await faces.getByRole('button', { name: 'Tú', exact: true }).click();
    await expect(summary(page)).toHaveText('30 obras de Beatriz QA. Suma a alguien para ver el cruce.');
    await faces.getByRole('button', { name: 'Beatriz QA', exact: true }).click();
    await expect(faces.getByRole('button', { name: 'Beatriz QA', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await faces.getByRole('button', { name: 'Tú', exact: true }).click(); await settled(page);
    const { box, work } = await zoomToWork(page, (x, y) => page.mouse.click(x, y));
    await page.mouse.move(box.x + work.x, box.y + work.y);
    await expect(page.getByText(/^qa_comp_motion_\d{2}$/).first()).toBeVisible();
    await page.mouse.click(box.x + work.x, box.y + work.y);
    await expect(page).toHaveURL(new RegExp(`/libro/${work.key.split(':')[1]}$`));
    await page.goBack(); await settled(page);
    await expect(summary(page)).toBeVisible();
  });
});

test('móvil: un toque abre la hoja y «Abrir ficha» navega', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    // Ruta a sangre: sin la barra inferior de la app.
    await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toHaveCount(0);
    const { box, work } = await zoomToWork(page, (x, y) => page.touchscreen.tap(x, y));
    await page.touchscreen.tap(box.x + work.x, box.y + work.y);
    const sheet = page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ });
    await expect(sheet).toBeVisible();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(scroll, 'sin scroll horizontal').toBe(true);
    await sheet.getByRole('link', { name: 'Abrir ficha', exact: true }).tap();
    await expect(page).toHaveURL(new RegExp(`/libro/${work.key.split(':')[1]}$`));
  });
});

test('escritorio: Opinión resume, la mini-ficha pone las notas y sobrevive al cambio de formato', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const lenses = page.getByRole('group', { name: 'Lente', exact: true });
    await lenses.getByRole('button', { name: 'Opinión', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Coincidís en 30 y chocáis en 0 de 30 obras compartidas');
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.mouse.move(box.x + work.x, box.y + work.y);
    // The hover tip is a mouse-only duplicate of the sheet, hence aria-hidden.
    await expect(page.getByRole('img', { name: 'Notas: Tú 9, Beatriz QA 9, Carlos QA 9', includeHidden: true })).toBeAttached();
    await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await settled(page);
    await expect(lenses.getByRole('button', { name: 'Opinión', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toHaveText('Coincidís en 30 y chocáis en 0 de 30 obras compartidas');
  });
});

test('móvil: Opinión desde el icono y la hoja con la escala de notas', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Opinión', exact: true }).tap(); await lensSettled(page);
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.touchscreen.tap(box.x + work.x, box.y + work.y);
    const sheet = page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ });
    await expect(sheet.getByRole('img', { name: 'Notas: Tú 9, Beatriz QA 9, Carlos QA 9' })).toBeVisible();
  });
});

test('escritorio: Tiempo e Islas resumen lo dibujado y el modo de Islas cambia las islas', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const lenses = page.getByRole('group', { name: 'Lente', exact: true });
    await lenses.getByRole('button', { name: 'Tiempo', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Llegaste tú primero a 30 de 30 obras compartidas');
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.mouse.move(box.x + work.x, box.y + work.y);
    // The hover tip is a mouse-only duplicate of the sheet, hence aria-hidden.
    await expect(page.getByText('Beatriz QA: 2026', { exact: true })).toBeAttached();
    await lenses.getByRole('button', { name: 'Islas', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Donde más os parecéis: Libros, con 30 en común');
    const modes = page.getByRole('group', { name: 'Agrupar islas por', exact: true });
    await modes.getByRole('button', { name: 'Género', exact: true }).click(); await lensSettled(page);
    await expect(summary(page)).toHaveText('Donde más os parecéis: Drama, con 30 en común');
    await modes.getByRole('button', { name: 'Autor/Director', exact: true }).click(); await lensSettled(page);
    // The fixture's authors are free text (not in `credits`): everything in common falls in «Otros».
    await expect(summary(page)).toHaveText('Lo que tenéis en común (30) está en Otros.');
    await expect(page.getByText('Otros: 30 obras sin autor o director identificado', { exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await lensSettled(page);
    await expect(modes.getByRole('button', { name: 'Tipo', exact: true })).toHaveCount(0);
  });
});

test('móvil: Tiempo desde el icono y la hoja con los años', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Tiempo', exact: true }).tap(); await lensSettled(page);
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    await page.touchscreen.tap(box.x + work.x, box.y + work.y);
    await expect(page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ }).getByText('Tú: 2026', { exact: true })).toBeVisible();
  });
});

const zoom = async (page: Page) => Number(await page.locator('[data-atlas-moving]').getAttribute('data-atlas-zoom'));
const faceButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Personas del cruce', exact: true }).getByRole('button', { name, exact: true });

test('escritorio: las portadas se piden solo con zoom de portada', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    const covers: string[] = [];
    page.on('request', request => { if (new URL(request.url()).hostname === 'comparison-fixture.invalid') covers.push(request.url()); });
    await openAtlas(page, fixture);
    expect(await zoom(page)).toBeLessThanOrEqual(1.1);
    expect(covers, 'sin portadas a zoom de mapa').toEqual([]);
    await zoomToWork(page, (x, y) => page.mouse.click(x, y));
    await expect.poll(() => covers.length).toBeGreaterThan(0);
    // The CDN loader's URL, never the Next image optimizer.
    expect(covers.every(url => url.includes('width=96'))).toBe(true);
    await expect.poll(async () => Number(await page.locator('[data-atlas-moving]').getAttribute('data-atlas-covers'))).toBeGreaterThan(0);
    expect(Number(await page.locator('[data-atlas-moving]').getAttribute('data-atlas-covers'))).toBeLessThanOrEqual(300);
  });
});

test('escritorio: «Ver como lista» enlaza las obras con el filtro de caras y vuelve al mapa', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const toggle = page.getByRole('button', { name: 'Ver como lista', exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
    await expect(list).toBeFocused();
    await expect(list.locator('a[href^="/libro/"]')).toHaveCount(30);
    await expect(page.locator('[data-atlas-moving] canvas')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(list.locator('a[href^="/libro/"]').first()).toBeFocused();
    await faceButton(page, 'Carlos QA').click();
    await faceButton(page, 'Beatriz QA').click();
    await expect(faceButton(page, 'Beatriz QA')).toHaveAttribute('aria-pressed', 'false');
    // All 30 are Tú's own works, so the list keeps them with only Tú active.
    await expect(list.locator('a[href^="/libro/"]')).toHaveCount(30);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(list).toHaveCount(0);
    await expect(page.locator('[data-atlas-moving] canvas')).toBeVisible();
  });
});

test('escritorio: teclado en el lienzo y la lente en la URL tras recargar', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const canvas = page.locator('[data-atlas-moving] canvas');
    await canvas.focus();
    // Back and forth with the keyboard: a keyboard focus, so the ring shows. The host draws it (Chrome hides a canvas's own inset outline).
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await expect(canvas).toBeFocused();
    const ring = () => page.locator('[data-atlas-moving]').evaluate(host => { const style = getComputedStyle(host, '::after'); return `${style.content} ${style.borderTopWidth} ${style.borderTopStyle}`; });
    expect(await ring()).toBe('"" 2px solid');
    const before = await zoom(page);
    await page.keyboard.press('+');
    await expect.poll(() => zoom(page)).toBeGreaterThan(before);
    const lenses = page.getByRole('group', { name: 'Lente', exact: true });
    await page.keyboard.press('2');
    await expect(lenses.getByRole('button', { name: 'Opinión', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('4');
    await expect(lenses.getByRole('button', { name: 'Islas', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]lente=islas(&|$)/);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Islas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('escritorio: al volver de la ficha siguen la cámara y las caras', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    await zoomToWork(page, (x, y) => page.mouse.click(x, y));
    const saved = await zoom(page);
    await faceButton(page, 'Carlos QA').click();
    await expect(faceButton(page, 'Carlos QA')).toHaveAttribute('aria-pressed', 'false');
    await settled(page);
    const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
    const [work] = await probe(page);
    expect(work, 'al desactivar una cara con zoom, la cámara mantiene alguna obra accesible').toBeDefined();
    await atlasEvidence(page, info, 'quien-zoom-seleccion-camara');
    await page.mouse.click(box.x + work.x, box.y + work.y);
    await expect(page).toHaveURL(new RegExp(`/libro/${work.key.split(':')[1]}$`));
    await page.goBack(); await settled(page);
    expect(Math.abs(await zoom(page) - saved)).toBeLessThanOrEqual(0.01);
    await expect(faceButton(page, 'Carlos QA')).toHaveAttribute('aria-pressed', 'false');
    const toggle = page.getByRole('button', { name: 'Ver como lista', exact: true });
    await toggle.click();
    await expect(page.getByRole('region', { name: 'Lista de obras', exact: true })).toBeVisible();
    await faceButton(page, 'Carlos QA').click();
    await expect(faceButton(page, 'Carlos QA')).toHaveAttribute('aria-pressed', 'true');
    await toggle.click(); await lensSettled(page);
    await expect.poll(async () => (await probe(page)).length, { message: 'al cambiar caras en lista y volver, las obras siguen dentro del encuadre' }).toBeGreaterThan(0);
    expect(Math.abs(await zoom(page) - saved), 'volver del modo lista conserva el zoom de la cámara').toBeLessThanOrEqual(0.01);
    await atlasEvidence(page, info, 'quien-camara-retorno-lista');
    await info.attach('camera-selection-and-list-return', { body: JSON.stringify({ savedZoom: saved, restoredZoom: await zoom(page),
      visibleWorks: (await probe(page)).length }, null, 2), contentType: 'application/json' });
  });
});

test('móvil: «Ver como lista» desde el dock y un toque abre la ficha', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await withComparisonFixture(async fixture => {
    await openAtlas(page, fixture);
    const toggle = page.getByRole('button', { name: 'Ver como lista', exact: true });
    await expect(toggle).toBeVisible();
    await toggle.tap();
    const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
    await expect(list.locator('a[href^="/libro/"]')).toHaveCount(30);
    const link = list.locator('a[href^="/libro/"]').first();
    const href = (await link.getAttribute('href'))!;
    await link.tap();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});

/** Opt-in review evidence; normal CI keeps its artifacts in the runner output directory. */
async function atlasEvidence(page: Page, info: TestInfo, name: string) {
  const directory = process.env.ATLAS_EVIDENCE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${info.project.name}-${name}.png` });
}
function atlasJournal(page: Page) {
  const errors: string[] = [], failures: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  return { errors, failures };
}
async function saveAtlasJournal(info: TestInfo, journal: ReturnType<typeof atlasJournal>) {
  const path = info.outputPath('atlas-journal.json');
  await writeFile(path, JSON.stringify(journal, null, 2));
  await info.attach('atlas-journal', { path, contentType: 'application/json' });
}
async function setAtlasViewport(page: Page, info: TestInfo) {
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 });
}
/** Screen-space distance between the two owned groups, independent of the engine's world/camera formulas. */
async function groupDistance(page: Page, fixture: ComparisonFixture) {
  const points = await probe(page);
  const centre = (books: ComparisonFixture['books']) => {
    const keys = new Set(books.map(book => `book:${book.id}`));
    const group = points.filter(point => keys.has(point.key));
    expect(group, 'todas las obras del grupo están en pantalla').toHaveLength(books.length);
    return { x: group.reduce((sum, point) => sum + point.x, 0) / group.length, y: group.reduce((sum, point) => sum + point.y, 0) / group.length };
  };
  const first = centre(fixture.books.slice(0, 15)), second = centre(fixture.books.slice(15));
  return Math.hypot(first.x - second.x, first.y - second.y);
}

test('Quién vivo: A+B y A+B+C convergen al quitar C y vuelven a separarse, también con movimiento reducido', async ({ page }, info) => {
  await setAtlasViewport(page, info);
  const journal = atlasJournal(page);
  try {
    await withComparisonFixture(async fixture => {
      // Real membership split: the first half belongs to A+B, the second to A+B+C.
      const ids = fixture.books.slice(0, 15).map(book => book.id).join(',');
      await comparisonRest(`passes?user_id=eq.${fixture.actors[2].id}&item_id=in.(${ids})`, { method: 'DELETE' });
      await openAtlas(page, fixture);
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        await page.emulateMedia({ reducedMotion });
        // The engine reads this preference when it mounts.
        await page.reload(); await settled(page);
        const separated = await groupDistance(page, fixture);
        expect(separated, 'dos conjuntos de propietarios se ven separados').toBeGreaterThan(40);
        await atlasEvidence(page, info, `quien-separado-${reducedMotion}`);
        await faceButton(page, 'Carlos QA').click(); await lensSettled(page);
        await expect(summary(page)).toHaveText('30 obras en común entre Tú y Beatriz QA');
        const merged = await groupDistance(page, fixture);
        expect(merged, 'las obras A+B+C pasan al conjunto A+B').toBeLessThan(15);
        expect(separated - merged, 'la selección mueve las obras en el lienzo').toBeGreaterThan(30);
        await atlasEvidence(page, info, `quien-agrupado-${reducedMotion}`);
        const toggle = page.getByRole('button', { name: 'Ver como lista', exact: true });
        await toggle.click();
        const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
        await expect(list.getByRole('heading', { name: 'Tú y Beatriz QA', exact: true })).toHaveCount(1);
        await expect(list.getByRole('heading')).toHaveCount(1);
        await expect(list.locator('a[href^="/libro/"]')).toHaveCount(30);
        await toggle.click(); await settled(page);
        await faceButton(page, 'Carlos QA').click(); await lensSettled(page);
        const restored = await groupDistance(page, fixture);
        expect(restored, 'reactivar C recupera las dos agrupaciones').toBeGreaterThan(40);
        expect(Math.abs(restored - separated), 'la separación vuelve al mismo encuadre').toBeLessThan(3);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal').toBe(true);
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
  } finally { await saveAtlasJournal(info, journal); }
});

/** Read the actual screenshot: CDN covers taint the canvas. The central corridor excludes island nodes and labels. */
async function brightGoldPixels(page: Page) {
  const screenshot = await page.locator('[data-atlas-moving] canvas').screenshot();
  const { width, height } = await sharp(screenshot).metadata();
  const { data, info } = await sharp(screenshot).extract({ left: Math.floor(width! * 0.4925), top: Math.floor(height! * 0.2),
    width: Math.max(1, Math.floor(width! * 0.015)), height: Math.floor(height! * 0.6) }).raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 190 && data[i + 1] > 140 && data[i + 2] < 170) count++;
  return count;
}

test('Islas vivas: media decimal y número de notas accesibles, copias y conexión resaltadas con ratón o toque', async ({ page }, info) => {
  await setAtlasViewport(page, info);
  const journal = atlasJournal(page);
  try {
    await withComparisonFixture(async fixture => {
      const ids = fixture.books.map(book => book.id).join(',');
      await comparisonRest(`books?id=in.(${ids})`, { method: 'PATCH', body: JSON.stringify({ genres: ['Drama', 'Aventura'] }) });
      for (const [index, half] of [fixture.books.slice(0, 15), fixture.books.slice(15)].entries()) {
        await comparisonRest(`passes?item_id=in.(${half.map(book => book.id).join(',')})`, { method: 'PATCH', body: JSON.stringify({ rating: 8 + index }) });
      }
      await openAtlas(page, fixture);
      await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Islas', exact: true }).click(); await lensSettled(page);
      await page.getByRole('group', { name: 'Agrupar islas por', exact: true }).getByRole('button', { name: 'Género', exact: true }).click(); await lensSettled(page);
      await atlasEvidence(page, info, 'islas-dos-medias');
      const baseline = await brightGoldPixels(page);
      // Keep a desktop tooltip left of the connecting corridor, so the screenshot measures the thread itself.
      const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!, [work] = (await probe(page)).toSorted((a, b) => a.x - b.x);
      expect(work, 'hay obras seleccionables en las islas').toBeDefined();
      if (info.project.name === 'mobile') {
        await page.touchscreen.tap(box.x + work.x, box.y + work.y);
        await expect(page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ })).toBeVisible();
      } else {
        await page.mouse.move(box.x + work.x, box.y + work.y);
        await expect(page.getByText(/^qa_comp_motion_\d{2}$/).first()).toBeVisible();
      }
      await lensSettled(page);
      await expect.poll(() => brightGoldPixels(page), { message: 'el enlace seleccionado añade un trazo dorado claramente visible entre las islas' })
        .toBeGreaterThan(Math.max(baseline + 20, baseline * 3));
      await atlasEvidence(page, info, 'islas-conexion-seleccionada');
      if (info.project.name === 'mobile') await page.getByRole('dialog', { name: /^qa_comp_motion_\d{2}$/ }).getByRole('button', { name: 'Cerrar', exact: true }).click();
      else await page.mouse.move(1, 1);
      await lensSettled(page);
      expect(Math.abs(await brightGoldPixels(page) - baseline), 'al soltar la selección vuelve el mapa completo').toBeLessThan(30);
      await page.getByRole('button', { name: 'Ver como lista', exact: true }).click();
      const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
      for (const genre of ['Aventura', 'Drama']) await expect(list.getByRole('heading', { name: genre, exact: true })).toBeVisible();
      for (const name of ['Tú', 'Beatriz QA', 'Carlos QA']) await expect(list.getByText(`${name}: media 8,5 de 30 notas`, { exact: true })).toHaveCount(2);
      for (const book of fixture.books) await expect(list.locator(`a[href="/libro/${book.id}"]`), 'cada obra tiene una copia por género').toHaveCount(2);
      await atlasEvidence(page, info, 'islas-lista-medias');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal').toBe(true);
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
  } finally { await saveAtlasJournal(info, journal); }
});

type IslandTitleRect = { label: string; x: number; y: number; width: number; height: number };

test('Islas vivas: cuatro islas con diez personas conservan espacio y la lista muestra íntegra una nota con nombre largo', async ({ page }, info) => {
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 360, height: 844 } : { width: 1280, height: 800 });
  const journal = atlasJournal(page);
  const genres = ['Aventura', 'Ciencia ficción', 'Drama', 'Fantasía'];
  // Observe genuine text drawing without replacing pixels, DTOs, actions or the canvas engine.
  await page.addInitScript(labels => {
    const records: Record<string, IslandTitleRect> = {};
    (globalThis as unknown as { __atlasTitleRects: typeof records }).__atlasTitleRects = records;
    const drawText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth?: number) {
      const text = String(value);
      const label = labels.find(title => title === text || (text.endsWith('…') && title.startsWith(text.slice(0, -1))));
      if (label) {
        const metrics = this.measureText(value), width = Math.min(metrics.width, maxWidth ?? Infinity);
        records[label] = { label, x: x - (this.textAlign === 'center' ? width / 2 : this.textAlign === 'right' ? width : 0),
          y: y - metrics.actualBoundingBoxAscent, width, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
      }
      if (maxWidth === undefined) drawText.call(this, value, x, y);
      else drawText.call(this, value, x, y, maxWidth);
    };
  }, genres);
  try {
    await withComparisonFixture(async fixture => {
      const ids = fixture.books.map(book => book.id).join(',');
      await comparisonRest(`books?id=in.(${ids})`, { method: 'PATCH', body: JSON.stringify({ genres }) });
      await comparisonRest(`passes?item_id=in.(${ids})`, { method: 'PATCH', body: JSON.stringify({ rating: 9 }) });
      await comparisonRest(`passes?user_id=eq.${fixture.actors[1].id}&item_id=in.(${ids})`, { method: 'PATCH', body: JSON.stringify({ rating: 10 }) });
      const longName = 'Beatriz ' + 'A'.repeat(72);
      fixture.actors[1].name = longName;
      await comparisonRest(`profiles?user_id=eq.${fixture.actors[1].id}`, { method: 'PATCH', body: JSON.stringify({ display_name: longName }) });
      await openAtlas(page, fixture);
      await expect(page.getByRole('group', { name: 'Personas del cruce', exact: true }).getByRole('button')).toHaveCount(10);
      await page.getByRole('group', { name: 'Filtrar por tipo de obra', exact: true }).getByRole('button', { name: 'Libros', exact: true }).click(); await lensSettled(page);
      await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Islas', exact: true }).click(); await lensSettled(page);
      const rectangles = await page.evaluate(() => Object.values((globalThis as unknown as { __atlasTitleRects: Record<string, IslandTitleRect> }).__atlasTitleRects));
      expect(rectangles, 'se dibujan los títulos de las cuatro islas').toHaveLength(4);
      const intersects = (a: IslandTitleRect, b: IslandTitleRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      for (const [index, title] of rectangles.entries()) {
        for (const other of rectangles.slice(index + 1)) expect(intersects(title, other), `${title.label} no pisa ${other.label}`).toBe(false);
        for (const work of await probe(page)) expect(intersects(title, { label: work.key, x: work.x - 5, y: work.y - 5, width: 10, height: 10 }), `${title.label} no tapa ninguna obra de la primera fila`).toBe(false);
      }
      await info.attach('island-title-rectangles', { body: JSON.stringify(rectangles, null, 2), contentType: 'application/json' });
      await atlasEvidence(page, info, 'islas-cuatro-diez-personas-nombre-largo');
      await page.getByRole('button', { name: 'Ver como lista', exact: true }).click();
      const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
      await expect(list.getByRole('heading')).toHaveCount(4);
      for (const genre of genres) await expect(list.getByRole('heading', { name: genre, exact: true })).toHaveCount(1);
      // Only the first three books are shared by all ten active people.
      for (const book of fixture.books.slice(0, 3)) await expect(list.locator(`a[href="/libro/${book.id}"]`)).toHaveCount(4);
      for (const book of fixture.books.slice(3)) await expect(list.locator(`a[href="/libro/${book.id}"]`)).toHaveCount(0);
      const rating = list.getByText(`${longName}: media 10,0 de 3 notas`, { exact: true });
      await expect(rating).toHaveCount(4);
      const geometry = await list.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
      expect(geometry.scrollWidth, 'la lista completa cabe sin desplazamiento horizontal').toBeLessThanOrEqual(geometry.width);
      const note = rating.first();
      const row = await note.evaluate(element => {
        const rect = element.getBoundingClientRect(), list = element.closest('[aria-label="Lista de obras"]')!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, listLeft: list.left, listRight: list.right, textWidth: element.scrollWidth, width: element.clientWidth };
      });
      expect(row.left).toBeGreaterThanOrEqual(row.listLeft);
      expect(row.right).toBeLessThanOrEqual(row.listRight);
      expect(row.textWidth, 'el texto de la nota se muestra íntegro dentro de su fila').toBeLessThanOrEqual(row.width);
      await info.attach('long-name-list-geometry', { body: JSON.stringify({ geometry, row }, null, 2), contentType: 'application/json' });
      await atlasEvidence(page, info, 'islas-lista-diez-personas-nombre-largo');
    }, { integrated: true });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
  } finally { await saveAtlasJournal(info, journal); }
});

type QuienDrawing = { counts: string[]; curves: number };

test('Selección completa: grupos pequeños identificados y las tres lentes comparan ABC; desmarcar C recupera AB', async ({ page }, info) => {
  await setAtlasViewport(page, info);
  const journal = atlasJournal(page);
  // Observe the actual canvas calls, preserving the engine and every drawn pixel.
  await page.addInitScript(() => {
    const observed = globalThis as unknown as { __quienDrawing: QuienDrawing };
    observed.__quienDrawing = { counts: [], curves: 0 };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof clear>) {
      if (this.canvas.closest('[data-atlas-moving]')) observed.__quienDrawing = { counts: [], curves: 0 };
      clear.apply(this, args);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth?: number) {
      if (this.canvas.closest('[data-atlas-moving]') && /^[123]$/.test(String(value))) observed.__quienDrawing.counts.push(String(value));
      if (maxWidth === undefined) fillText.call(this, value, x, y);
      else fillText.call(this, value, x, y, maxWidth);
    };
    const curve = CanvasRenderingContext2D.prototype.quadraticCurveTo;
    CanvasRenderingContext2D.prototype.quadraticCurveTo = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof curve>) {
      if (this.canvas.closest('[data-atlas-moving]')) observed.__quienDrawing.curves++;
      curve.apply(this, args);
    };
  });
  try {
    await withComparisonFixture(async fixture => {
      const memberships = [[0, 1], [0, 2], [0, 2], [1, 2], [1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2]];
      for (const [index, book] of fixture.books.entries()) {
        if (index >= memberships.length) {
          await comparisonRest(`passes?item_id=eq.${book.id}`, { method: 'DELETE' });
          continue;
        }
        for (const [actorIndex, actor] of fixture.actors.entries()) if (!memberships[index].includes(actorIndex)) {
          await comparisonRest(`passes?user_id=eq.${actor.id}&item_id=eq.${book.id}`, { method: 'DELETE' });
        }
        await comparisonRest(`passes?item_id=eq.${book.id}`, { method: 'PATCH', body: JSON.stringify({ finished_on: `2026-${String(index + 1).padStart(2, '0')}-01` }) });
      }
      await comparisonRest(`passes?user_id=eq.${fixture.actors[2].id}&item_id=eq.${fixture.books[5].id}`, { method: 'PATCH', body: JSON.stringify({ rating: null }) });
      await comparisonRest(`passes?user_id=eq.${fixture.actors[2].id}&item_id=eq.${fixture.books[6].id}`, { method: 'PATCH', body: JSON.stringify({ finished_on: null }) });
      await openAtlas(page, fixture);
      await expect(summary(page)).toHaveText('3 obras en común entre Tú, Beatriz QA y Carlos QA');
      const drawing = await page.evaluate(() => (globalThis as unknown as { __quienDrawing: QuienDrawing }).__quienDrawing);
      expect(drawing.counts.toSorted(), 'también las regiones de una y dos obras dibujan su cifra').toEqual(['1', '2', '2', '3']);
      expect(drawing.curves, 'cada región compartida dibuja un hilo hacia cada dueño').toBe(9);
      await info.attach('quien-small-group-drawing', { body: JSON.stringify(drawing, null, 2), contentType: 'application/json' });
      await atlasEvidence(page, info, 'quien-grupos-uno-dos');
      const lenses = page.getByRole('group', { name: 'Lente', exact: true });
      const listToggle = page.getByRole('button', { name: 'Ver como lista', exact: true });
      const lensCases = [
        { lens: 'Opinión', triple: [6, 7], pair: [0, 5, 6, 7], summary3: 'Coincidís en 2 y chocáis en 0 de 2 obras compartidas', summary2: 'Coincidís en 4 y chocáis en 0 de 4 obras compartidas' },
        { lens: 'Tiempo', triple: [5, 6, 7], pair: [0, 5, 6, 7], summary3: 'Llegaste tú primero a 2 de 2 obras compartidas (1 sin fecha)', summary2: 'Llegaste tú primero a 4 de 4 obras compartidas' },
        { lens: 'Islas', triple: [5, 6, 7], pair: [0, 5, 6, 7], summary3: 'Donde más os parecéis: Libros, con 3 en común', summary2: 'Donde más os parecéis: Libros, con 4 en común' },
      ];
      const assertWorks = async (indices: number[]) => {
        const keys = indices.map(index => `book:${fixture.books[index].id}`).toSorted();
        expect((await probe(page)).map(work => work.key).toSorted(), 'el mapa sólo contiene la intersección seleccionada').toEqual(keys);
        await listToggle.click();
        const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
        await expect(list.locator('a[href^="/libro/"]')).toHaveCount(indices.length);
        for (const [index, book] of fixture.books.entries()) await expect(list.locator(`a[href="/libro/${book.id}"]`)).toHaveCount(indices.includes(index) ? 1 : 0);
        await listToggle.click(); await lensSettled(page);
      };
      for (const lensCase of lensCases) {
        await lenses.getByRole('button', { name: lensCase.lens, exact: true }).click(); await lensSettled(page);
        await expect(summary(page)).toHaveText(lensCase.summary3);
        await assertWorks(lensCase.triple);
        await atlasEvidence(page, info, `${lensCase.lens.toLowerCase()}-abc`);
        if (lensCase.lens === 'Tiempo') {
          const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
          const work = (await probe(page)).find(point => point.key === `book:${fixture.books[6].id}`)!;
          if (info.project.name === 'mobile') {
            await page.touchscreen.tap(box.x + work.x, box.y + work.y);
            const sheet = page.getByRole('dialog', { name: fixture.books[6].title, exact: true });
            await expect(sheet.getByText('Carlos QA: sin fecha', { exact: true })).toBeVisible();
            await expect(sheet.getByText('Tú: 2026', { exact: true })).toBeVisible();
            await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
          } else {
            await page.mouse.move(box.x + work.x, box.y + work.y);
            await expect(page.getByText('Carlos QA: sin fecha', { exact: true })).toBeAttached();
            await expect(page.getByText('Tú: 2026', { exact: true })).toBeAttached();
            await page.mouse.move(1, 1);
          }
        }
        await faceButton(page, 'Carlos QA').click(); await lensSettled(page);
        await expect(summary(page)).toHaveText(lensCase.summary2);
        await assertWorks(lensCase.pair);
        await atlasEvidence(page, info, `${lensCase.lens.toLowerCase()}-ab`);
        await faceButton(page, 'Carlos QA').click(); await lensSettled(page);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal').toBe(true);
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
  } finally { await saveAtlasJournal(info, journal); }
});

/** Credits are polymorphic: delete the owned credits and people even after an interrupted fixture. */
async function clearAtlasCreators() {
  const people = await (await comparisonRest('people?name=like.qa_comp_motion_author_*&select=id,name')).json() as { id: string; name: string }[];
  for (const person of people) {
    if (!/^qa_comp_motion_author_\d{2}$/.test(person.name)) throw new Error('Unrecognized atlas creator fixture');
    await comparisonRest(`credits?person_id=eq.${person.id}`, { method: 'DELETE' });
    await comparisonRest(`people?id=eq.${person.id}`, { method: 'DELETE' });
  }
  expect(await (await comparisonRest('people?name=like.qa_comp_motion_author_*&select=id')).json(), 'disposable creators removed').toEqual([]);
}

test('Otros explica autores fuera del top diez, créditos sin identificar y series en mapa y lista', async ({ page }, info) => {
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 360, height: 844 } : { width: 1280, height: 800 });
  const journal = atlasJournal(page);
  try {
    await clearAtlasCreators();
    await withComparisonFixture(async fixture => {
      const authors = Array.from({ length: 11 }, (_, index) => ({ id: crypto.randomUUID(), name: `qa_comp_motion_author_${String(index).padStart(2, '0')}` }));
      await comparisonRest('people', { method: 'POST', body: JSON.stringify(authors) });
      await comparisonRest('credits', { method: 'POST', body: JSON.stringify(authors.map((author, index) => ({ item_type: 'book', item_id: fixture.books[index].id, person_id: author.id, role: 'author' }))) });
      await openAtlas(page, fixture, fixture.actors.slice(0, 3));
      await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Islas', exact: true }).click(); await lensSettled(page);
      await page.getByRole('group', { name: 'Agrupar islas por', exact: true }).getByRole('button', { name: 'Autor/Director', exact: true }).click(); await lensSettled(page);
      const reasons = '1 obra fuera de las diez islas principales, 20 obras sin autor o director identificado y 1 serie no agrupada por autor o director';
      await expect(page.getByText(`Otros: ${reasons}`, { exact: true })).toBeVisible();
      const geometry = await page.locator('[data-comparison-stage]').evaluate(stage => {
        const overlay = stage.querySelector('[role="status"]')!.parentElement!.parentElement!.getBoundingClientRect();
        const dock = stage.querySelector('[aria-label="Lente"]')!.parentElement!.getBoundingClientRect();
        return { overlayBottom: overlay.bottom, dockTop: dock.top, width: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      expect(geometry.overlayBottom, 'la explicación de Otros deja una banda de mapa antes del dock').toBeLessThan(geometry.dockTop - 40);
      expect(geometry.width, 'sin scroll horizontal con la explicación de tres causas').toBeLessThanOrEqual(geometry.viewport);
      expect((await probe(page)).length, 'el mapa contiene obras visibles tras medir el overlay').toBeGreaterThan(0);
      await info.attach('other-map-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
      await atlasEvidence(page, info, 'otros-tres-causas-mapa');
      await page.getByRole('button', { name: 'Ver como lista', exact: true }).click();
      const list = page.getByRole('region', { name: 'Lista de obras', exact: true });
      await expect(list.getByRole('heading')).toHaveCount(11);
      const otherSection = list.getByRole('heading', { name: 'Otros', exact: true }).locator('..');
      await expect(otherSection.getByText(reasons, { exact: true })).toBeAttached();
      await expect(otherSection.locator('a[href^="/libro/"]')).toHaveCount(20);
      await expect(otherSection.locator(`a[href="/pelicula/${fixture.movie!.id}"]`)).toHaveCount(1);
      await expect(otherSection.locator(`a[href="/serie/${fixture.series!.id}"]`)).toHaveCount(1);
      await expect(otherSection.locator(`a[href="/libro/${fixture.books[10].id}"]`), 'el undécimo autor identificado cae en Otros por límite, no por crédito ausente').toHaveCount(1);
      await otherSection.getByRole('heading', { name: 'Otros', exact: true }).scrollIntoViewIfNeeded();
      await atlasEvidence(page, info, 'otros-tres-causas-lista');
    }, { integrated: true });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
  } finally { await clearAtlasCreators(); await saveAtlasJournal(info, journal); }
});

test('leyenda del mapa: móvil plegable, escritorio visible y lista sin leyenda', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  const journal = atlasJournal(page);
  const measurements: Record<string, unknown> = {};
  const geometry = () => page.locator('[data-comparison-stage]').evaluate(stage => {
    const box = stage.getBoundingClientRect();
    const dock = stage.querySelector('[aria-label="Lente"]')!.parentElement!.getBoundingClientRect();
    const top = stage.querySelector('[role="status"]')!.parentElement!.parentElement!;
    const overlay = top.getBoundingClientRect();
    const points = JSON.parse(stage.querySelector('[data-atlas-probe]')!.getAttribute('data-atlas-probe') ?? '[]') as { x: number; y: number }[];
    const mapTop = overlay.bottom - parseFloat(getComputedStyle(top).paddingBottom || '0') - box.top;
    const mapBottom = dock.top - box.top;
    return { dockHeight: dock.height, mapTop, mapBottom, freeHeight: mapBottom - mapTop,
      pointY: points.map(point => point.y), scrollWidth: document.documentElement.scrollWidth, width: innerWidth };
  });
  try {
    await withComparisonFixture(async fixture => {
      await openAtlas(page, fixture);
      const lenses = page.getByRole('group', { name: 'Lente', exact: true });
      const toggle = page.getByRole('button', { name: 'Leyenda', exact: true, includeHidden: true });
      const captionId = await toggle.getAttribute('aria-controls');
      expect(captionId, 'el control referencia la explicación').toBeTruthy();
      const caption = page.locator(`[id="${captionId}"]`);
      await expect(caption).toContainText('Las obras se agrupan entre las personas seleccionadas');
      if (mobile) {
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(caption).toBeHidden();
        const hitbox = (await toggle.boundingBox())!;
        expect(hitbox.height, 'área táctil de al menos 44 px').toBeGreaterThanOrEqual(44);
        expect(hitbox.width, 'área táctil de al menos 44 px').toBeGreaterThanOrEqual(44);
        measurements.quienClosed = await geometry();
        await atlasEvidence(page, info, 'leyenda-quien-cerrada');
        await toggle.tap(); await lensSettled(page);
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(caption).toBeVisible();
        const opened = await geometry();
        measurements.quienOpen = opened;
        expect(opened.freeHeight, 'abrir la explicación reserva su altura en el mapa').toBeLessThan((measurements.quienClosed as typeof opened).freeHeight - 20);
        await atlasEvidence(page, info, 'leyenda-quien-abierta');
      } else {
        await expect(toggle).toBeHidden();
        await expect(caption).toBeVisible();
        await atlasEvidence(page, info, 'leyenda-escritorio');
      }
      await lenses.getByRole('button', { name: 'Islas', exact: true }).click(); await lensSettled(page);
      await expect(caption).toContainText('Obras de todas las personas seleccionadas, por tipo, género o autor.');
      await expect(caption).toBeVisible();
      if (mobile) {
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const opened = await geometry();
        measurements.islasOpen = opened;
        const openProbe = JSON.stringify(await probe(page));
        await atlasEvidence(page, info, 'leyenda-islas-abierta');
        await toggle.tap(); await lensSettled(page);
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(caption).toBeHidden();
        const closed = await geometry();
        measurements.islasClosed = closed;
        expect(closed.freeHeight, 'plegar libera la altura de la leyenda').toBeGreaterThan(opened.freeHeight + 20);
        await expect.poll(async () => JSON.stringify(await probe(page)), 'la cámara se reencaja en la banda recuperada').not.toBe(openProbe);
        const framed = await geometry();
        expect(framed.pointY.length, 'obras reales visibles en el mapa').toBeGreaterThan(0);
        expect(Math.min(...framed.pointY), 'el mapa deja libre el resumen').toBeGreaterThanOrEqual(framed.mapTop);
        expect(Math.max(...framed.pointY), 'el mapa deja libre el dock').toBeLessThanOrEqual(framed.mapBottom);
        await atlasEvidence(page, info, 'leyenda-islas-cerrada');
        await page.setViewportSize({ width: 360, height: 844 }); await lensSettled(page);
        await expect(toggle).toBeVisible();
        await expect(caption).toBeHidden();
        const narrow = await geometry();
        measurements.islas360 = narrow;
        expect(narrow.scrollWidth, 'sin scroll horizontal a 360 px').toBeLessThanOrEqual(narrow.width);
        await atlasEvidence(page, info, 'leyenda-islas-360-cerrada');
      }
      const listToggle = page.getByRole('button', { name: 'Ver como lista', exact: true });
      await listToggle.click();
      await expect(page.getByRole('region', { name: 'Lista de obras', exact: true })).toBeVisible();
      await expect(toggle).toHaveCount(0);
      await expect(caption).toHaveCount(0);
      await listToggle.click(); await lensSettled(page);
      await expect(toggle).toHaveCount(1);
      await expect(caption)[mobile ? 'toBeHidden' : 'toBeVisible']();
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
  } finally {
    await info.attach('legend-geometry', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
    const directory = process.env.ATLAS_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/${info.project.name}-leyenda-metrics.json`, JSON.stringify({ measurements, journal }, null, 2));
    }
    await saveAtlasJournal(info, journal);
  }
});

type ItemDrawing = { images: { x: number; y: number; width: number; height: number }[]; dots: { x: number; y: number; radius: number }[] };

/** Observe rendered CSS pixels without replacing the engine, scene, coordinates or image bytes. */
async function observeItems(page: Page) {
  await page.addInitScript(() => {
    const observed = globalThis as unknown as { __atlasItems: ItemDrawing };
    observed.__atlasItems = { images: [], dots: [] };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof clear>) {
      if (this.canvas.closest('[data-atlas-moving]')) observed.__atlasItems = { images: [], dots: [] };
      clear.apply(this, args);
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, image: CanvasImageSource, ...args: number[]) {
      if (this.canvas.closest('[data-atlas-moving]') && args.length === 4) {
        const [x, y, width, height] = args;
        observed.__atlasItems.images.push({ x, y, width, height });
      }
      Reflect.apply(draw, this, [image, ...args]);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof arc>) {
      const [x, y, radius] = args;
      if (this.canvas.closest('[data-atlas-moving]') && radius < 10) observed.__atlasItems.dots.push({ x, y, radius });
      arc.apply(this, args);
    };
  });
}

const itemDrawing = (page: Page) => page.evaluate(() => (globalThis as unknown as { __atlasItems: ItemDrawing }).__atlasItems);

/** Use an actual wheel gesture, keeping a real item at its existing screen position. */
async function itemZoom(page: Page, value: number) {
  const canvas = page.locator('[data-atlas-moving] canvas');
  const box = (await canvas.boundingBox())!;
  const points = await probe(page);
  const point = points.find(point => point.x > 60 && point.x < box.width - 60 && point.y > 180 && point.y < box.height - 150) ?? points[0];
  expect(point, 'una obra real disponible para anclar el zoom').toBeDefined();
  await page.mouse.move(box.x + point.x, box.y + point.y);
  // Chromium's mobile emulation reports wheel deltas divided by the emulated DPR.
  const wheelScale = await page.evaluate(() => devicePixelRatio);
  await page.mouse.wheel(0, -Math.log(value / await zoom(page)) / 0.0018 * wheelScale);
  await expect.poll(() => zoom(page)).toBeCloseTo(value, 2);
  await lensSettled(page);
}

test('portadas tempranas y mayores: Opinión y Tiempo a 0,7; cada lente conserva sus límites', async ({ page }, info) => {
  await setAtlasViewport(page, info);
  await observeItems(page);
  const journal = atlasJournal(page), measurements: Record<string, unknown> = {};
  try {
    await withComparisonFixture(async fixture => {
      // Spread real notes and dates: the visual gate must not depend on thirty coincident items.
      const ids = fixture.books.map(book => book.id).join(',');
      const rows = await (await comparisonRest(`passes?item_id=in.(${ids})&select=id,user_id,item_id`)).json() as { id: string; user_id: string; item_id: string }[];
      await comparisonRest('passes', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows.map(row => {
        const index = fixture.books.findIndex(book => book.id === row.item_id);
        const actor = fixture.actors.findIndex(actor => actor.id === row.user_id);
        return { ...row, item_type: 'book', status: 'completed', is_active: false, is_public: true,
          rating: actor === 0 ? index % 10 + 1 : Math.floor(index / 3) + 1,
          finished_on: `2026-${String(index % 12 + 1).padStart(2, '0')}-${String(actor + 1).padStart(2, '0')}` };
      })) });
      await openAtlas(page, fixture);
      const lenses = page.getByRole('group', { name: 'Lente', exact: true });
      for (const lens of ['Quién', 'Opinión', 'Tiempo', 'Islas']) {
        await lenses.getByRole('button', { name: lens, exact: true }).click(); await lensSettled(page);
        await itemZoom(page, 0.5);
        const dotsZoom = await zoom(page);
        const dots = await itemDrawing(page);
        expect(dots.images, `${lens}: bajo 0,6 mantiene puntos`).toHaveLength(0);
        expect(dots.dots.length, `${lens}: puntos reales dibujados`).toBeGreaterThan(0);
        await itemZoom(page, 0.7);
        if (['Opinión', 'Tiempo'].includes(lens)) await expect.poll(async () => (await itemDrawing(page)).images.length).toBeGreaterThan(0);
        const low = await itemDrawing(page);
        measurements[lens] = { dotsZoom, dotRadiiAt05: dots.dots.map(dot => dot.radius), coverZoom: await zoom(page), coversAt07: low.images };
        if (['Opinión', 'Tiempo'].includes(lens)) {
          expect(Math.min(...low.images.map(image => image.width)), 'portadas tempranas con al menos 12 px de ancho').toBeGreaterThanOrEqual(12);
          if (info.project.name === 'mobile') await atlasEvidence(page, info, `despues-${lens === 'Opinión' ? 'opinion' : 'tiempo'}-07`);
        } else expect(low.images, `${lens}: conserva el umbral de 1,1`).toHaveLength(0);
        await itemZoom(page, 1.4);
        await expect.poll(async () => (await itemDrawing(page)).images.length).toBeGreaterThan(0);
        const high = await itemDrawing(page);
        (measurements[lens] as Record<string, unknown>).coversAt14 = high.images;
        expect(Math.min(...high.images.map(image => image.width)), `${lens}: portadas mayores también por encima del umbral anterior`).toBeGreaterThanOrEqual(lens === 'Opinión' ? 19 : 16);
        expect(Number(await page.locator('[data-atlas-moving]').getAttribute('data-atlas-covers'))).toBeLessThanOrEqual(300);
        if (['Opinión', 'Tiempo'].includes(lens)) {
          await itemZoom(page, 3.4);
          const drawing = await itemDrawing(page), points = await probe(page);
          const box = (await page.locator('[data-atlas-moving] canvas').boundingBox())!;
          const item = drawing.images.find(image => {
            const x = image.x + image.width / 2, y = image.y + image.height / 2;
            return image.x > 35 && image.x + image.width < box.width - 35 && image.y > 210 && image.y + image.height < box.height - 160
              && drawing.images.every(other => other === image || Math.hypot(other.x + other.width / 2 - x, other.y + other.height / 2 - y) > image.height);
          });
          expect(item, `${lens}: una portada aislada para tocar su esquina`).toBeDefined();
          const point = points.find(point => Math.hypot(point.x - item!.x - item!.width / 2, point.y - item!.y - item!.height / 2) < 2);
          expect(point, 'la portada pertenece a una obra real publicada por la sonda').toBeDefined();
          const book = fixture.books.find(book => `book:${book.id}` === point!.key)!;
          const x = box.x + item!.x + item!.width - 2, y = box.y + item!.y + 2;
          if (info.project.name === 'mobile') {
            await page.touchscreen.tap(x, y);
            const sheet = page.getByRole('dialog', { name: book.title, exact: true });
            await expect(sheet).toBeVisible();
            await sheet.getByRole('button', { name: 'Cerrar', exact: true }).tap();
          } else {
            await page.mouse.move(x, y);
            await expect(page.getByText(book.title, { exact: true }).first()).toBeVisible();
            await page.mouse.click(x, y);
            await expect(page).toHaveURL(new RegExp(`/libro/${book.id}$`));
            await page.goBack(); await lensSettled(page);
          }
          (measurements[lens] as Record<string, unknown>).cornerHit = { key: point!.key, width: item!.width, height: item!.height };
        }
      }
      if (info.project.name === 'mobile') {
        await page.setViewportSize({ width: 360, height: 844 });
        await lenses.getByRole('button', { name: 'Tiempo', exact: true }).click(); await lensSettled(page);
        await itemZoom(page, 0.7);
        await expect.poll(async () => (await itemDrawing(page)).images.length).toBeGreaterThan(0);
        const images = (await itemDrawing(page)).images, minCoverWidth = Math.min(...images.map(image => image.width));
        expect(minCoverWidth, 'también a 360 px las portadas tempranas conservan 12 px de ancho').toBeGreaterThanOrEqual(12);
        await expect(summary(page)).toHaveText('Llegaste tú primero a 30 de 30 obras compartidas');
        (measurements.Tiempo as Record<string, unknown>).viewport360 = { zoom: await zoom(page), minCoverWidth, visibleCovers: images.length };
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin desplazamiento horizontal').toBe(true);
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
    expect(journal.failures.filter(failure => !failure.endsWith('net::ERR_ABORTED')), 'sin peticiones fallidas fuera de las canceladas al navegar').toEqual([]);
  } finally {
    await info.attach('item-size-measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
    const directory = process.env.ATLAS_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/${info.project.name}-despues-items-metrics.json`, JSON.stringify({ measurements, journal }, null, 2));
    }
    await saveAtlasJournal(info, journal);
  }
});

test('opiniones densas: treinta notas iguales siguen visibles al bajar el zoom de portada', async ({ page }, info) => {
  await setAtlasViewport(page, info);
  await observeItems(page);
  const journal = atlasJournal(page);
  let drawing: ItemDrawing | undefined;
  try {
    await withComparisonFixture(async fixture => {
      await openAtlas(page, fixture);
      await page.getByRole('group', { name: 'Lente', exact: true }).getByRole('button', { name: 'Opinión', exact: true }).click(); await lensSettled(page);
      await itemZoom(page, 0.7);
      await expect.poll(async () => (await itemDrawing(page)).images.length).toBe(30);
      drawing = await itemDrawing(page);
      await expect(summary(page)).toHaveText('Coincidís en 30 y chocáis en 0 de 30 obras compartidas');
      expect(await probe(page), 'treinta obras reales presentes incluso con la misma nota').toHaveLength(30);
      if (info.project.name === 'mobile') await atlasEvidence(page, info, 'despues-opinion-densa-07');
      await page.getByRole('button', { name: 'Ver como lista', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Lista de obras', exact: true }).locator('a[href^="/libro/"]')).toHaveCount(30);
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
    expect(journal.failures.filter(failure => !failure.endsWith('net::ERR_ABORTED')), 'sin peticiones fallidas fuera de las canceladas al navegar').toEqual([]);
  } finally {
    const data = { drawing, journal };
    await info.attach('dense-item-measurements', { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
    const directory = process.env.ATLAS_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/${info.project.name}-despues-dense-metrics.json`, JSON.stringify(data, null, 2));
    }
    await saveAtlasJournal(info, journal);
  }
});

test('mini-ficha: cada persona conserva su nota en Quién, Tiempo e Islas; Opinión mantiene su escala', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  await page.setViewportSize(mobile ? { width: 360, height: 844 } : { width: 1280, height: 800 });
  const journal = atlasJournal(page), measurements: Record<string, unknown> = {};
  const directory = process.env.ATLAS_EVIDENCE_DIR;
  try {
    await withComparisonFixture(async fixture => {
      const longName = 'Beatriz QA con un nombre extraordinariamente largo';
      fixture.actors[1].name = longName;
      await comparisonRest(`profiles?user_id=eq.${fixture.actors[1].id}`, { method: 'PATCH', body: JSON.stringify({ display_name: longName }) });
      const removedIds = fixture.books.slice(2).map(book => book.id).join(',');
      await comparisonRest(`passes?item_id=in.(${removedIds})`, { method: 'DELETE' });
      for (const [index, actor] of fixture.actors.entries()) {
        await comparisonRest(`passes?user_id=eq.${actor.id}&item_id=eq.${fixture.books[0].id}`, { method: 'PATCH', body: JSON.stringify({ rating: [8, 4, null][index], finished_on: index === 2 ? null : `2026-0${index + 1}-01` }) });
        await comparisonRest(`passes?user_id=eq.${actor.id}&item_id=eq.${fixture.books[1].id}`, { method: 'PATCH', body: JSON.stringify({ rating: [7, 6, 9][index] }) });
      }
      await openAtlas(page, fixture);
      const lenses = page.getByRole('group', { name: 'Lente', exact: true });
      const work = fixture.books[0];
      const showCard = async (book = work) => {
        const sheet = page.getByRole('dialog', { name: book.title, exact: true });
        if (mobile && await sheet.isVisible()) return sheet;
        const canvas = page.locator('[data-atlas-moving] canvas');
        let point = (await probe(page)).find(point => point.key === `book:${book.id}`);
        if (!point) { await canvas.focus(); await page.keyboard.press('0'); await lensSettled(page); point = (await probe(page)).find(point => point.key === `book:${book.id}`); }
        expect(point, 'la obra sembrada está visible en su lente').toBeDefined();
        let box = (await canvas.boundingBox())!;
        if (await lenses.getByRole('button', { name: 'Quién', exact: true }).getAttribute('aria-pressed') === 'true' && await zoom(page) <= 1.1) {
          if (mobile) await page.touchscreen.tap(box.x + point!.x, box.y + point!.y);
          else await page.mouse.click(box.x + point!.x, box.y + point!.y);
          await expect.poll(() => zoom(page)).toBeGreaterThan(1.1); await lensSettled(page);
          point = (await probe(page)).find(point => point.key === `book:${book.id}`);
          expect(point, 'la misma obra sigue visible tras acercarse al grupo').toBeDefined();
          box = (await canvas.boundingBox())!;
        }
        if (mobile) { await page.touchscreen.tap(box.x + point!.x, box.y + point!.y); await expect(sheet).toBeVisible(); return sheet; }
        await page.mouse.move(box.x + point!.x, box.y + point!.y);
        const tip = page.locator('[data-comparison-stage] div[aria-hidden="true"]').filter({ has: page.getByText(book.title, { exact: true }) });
        await expect(tip).toBeVisible(); return tip;
      };
      for (const lens of ['Quién', 'Tiempo', 'Islas']) {
        await lenses.getByRole('button', { name: lens, exact: true }).click(); await lensSettled(page);
        const card = await showCard();
        const expected = [['Tú', '8/10'], [longName, '4/10'], ['Carlos QA', 'sin nota']];
        for (const [name, rating] of expected) {
          const label = lens === 'Tiempo' ? `${name}: ${name === 'Carlos QA' ? 'sin fecha' : '2026'}` : name;
          const row = card.locator('li').filter({ has: page.getByText(label, { exact: true }) });
          await expect(row).toHaveCount(1);
          await expect(row.getByText(rating, { exact: true })).toBeVisible();
        }
        const geometry = await card.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth,
          rows: [...element.querySelectorAll('li')].map(row => row.textContent),
          text: [...element.querySelectorAll('li > span')].map(span => ({ width: span.clientWidth, scrollWidth: span.scrollWidth })) }));
        measurements[lens] = geometry;
        expect(geometry.scrollWidth, `${lens}: la mini-ficha cabe con el nombre largo`).toBeLessThanOrEqual(geometry.width);
        expect(geometry.text.every(span => span.scrollWidth <= span.width), `${lens}: las columnas no desbordan con el nombre largo`).toBe(true);
        if (directory && (mobile || lens === 'Tiempo')) await atlasEvidence(page, info, `notas-${lens === 'Quién' ? 'quien' : lens.toLowerCase()}`);
        await faceButton(page, 'Carlos QA').click(); await lensSettled(page);
        const selected = await showCard();
        await expect(selected.locator('li')).toHaveCount(2);
        await expect(selected.getByText('sin nota', { exact: true })).toHaveCount(0);
        await expect(selected.getByText(lens === 'Tiempo' ? 'Carlos QA: sin fecha' : 'Carlos QA', { exact: true })).toHaveCount(0);
        if (mobile) await selected.getByRole('button', { name: 'Cerrar', exact: true }).tap();
        else await page.mouse.move(1, 1);
        await faceButton(page, 'Carlos QA').click(); await lensSettled(page);
      }
      await lenses.getByRole('button', { name: 'Opinión', exact: true }).click(); await lensSettled(page);
      const opinionCard = await showCard(fixture.books[1]);
      await expect(opinionCard.getByRole('img', { name: `Notas: Tú 7, ${longName} 6, Carlos QA 9`, includeHidden: true })).toBeVisible();
      await expect(opinionCard.getByText('7/10', { exact: true })).toHaveCount(0);
      await expect(opinionCard.getByText('6/10', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'la página no desborda a 360 px ni escritorio').toBe(true);
    });
    expect(journal.errors, 'sin errores de consola ni excepciones del navegador').toEqual([]);
    expect(journal.failures.filter(failure => !failure.endsWith('net::ERR_ABORTED')), 'sin peticiones fallidas fuera de las canceladas al navegar').toEqual([]);
  } finally {
    await info.attach('owner-rating-card-measurements', { body: JSON.stringify({ measurements, journal }, null, 2), contentType: 'application/json' });
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/${info.project.name}-notas-metrics.json`, JSON.stringify({ measurements, journal }, null, 2));
    }
    await saveAtlasJournal(info, journal);
  }
});
