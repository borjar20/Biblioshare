import { expect, test, type Page } from '@playwright/test';
import { chooseComparisonParticipants, loginComparisonActor, withComparisonFixture, type ComparisonFixture } from './support/comparison-fixtures';

async function settled(page: Page) {
  await expect(page.locator('[data-atlas-moving]')).toHaveAttribute('data-atlas-moving', 'false');
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
