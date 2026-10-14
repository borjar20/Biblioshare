import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { chooseComparisonParticipants, comparisonRest, loginComparisonActor, withComparisonFixture, type ComparisonFixture } from './support/comparison-fixtures';

async function settled(page: Page) {
  await expect(page.locator('[data-atlas-moving]')).toHaveAttribute('data-atlas-moving', 'false');
}
/**
 * After a lens change: the transition starts on the engine's next frame, so until then the host still
 * reads as settled with the previous lens's probe. Let two frames pass, then wait for it to settle.
 */
async function lensSettled(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settled(page);
}
async function openAtlas(page: Page, fixture: ComparisonFixture) {
  await loginComparisonActor(page, fixture.actors[0]);
  await page.goto('/comunidad/entre-nosotros');
  await page.getByRole('button', { name: 'Crear tu primer grupo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear grupo' });
  await form.getByLabel('Nombre del grupo').fill('Atlas QA');
  await chooseComparisonParticipants(form, fixture.actors[0], fixture.actors);
  await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Grupo: Atlas QA', exact: true })).toBeVisible();
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
    await expect(summary(page)).toHaveText('Lo que tenéis en común (30) está en Otros: no tiene autor ni director en el catálogo');
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
      const rating = list.getByText(`${longName}: media 10,0 de 30 notas`, { exact: true });
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
