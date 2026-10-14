import { expect, test, type Page } from '@playwright/test';
import { chooseComparisonParticipants, loginComparisonActor, withComparisonFixture, type ComparisonFixture } from './support/comparison-fixtures';

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
    await page.mouse.click(box.x + work.x, box.y + work.y);
    await expect(page).toHaveURL(new RegExp(`/libro/${work.key.split(':')[1]}$`));
    await page.goBack(); await settled(page);
    expect(Math.abs(await zoom(page) - saved)).toBeLessThanOrEqual(0.01);
    await expect(faceButton(page, 'Carlos QA')).toHaveAttribute('aria-pressed', 'false');
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
