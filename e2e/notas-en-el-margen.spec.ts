import { expect, test, type Browser, type Page } from "@playwright/test";
import { deleteExperienceActor, experienceActor, loginExperienceUser } from "./support/experience-fixtures";
import {
  MARGIN_QA_PREFIX,
  clearMarginFixtures,
  encountersForReader,
  follow,
  insertBookNote,
  insertEpisodeNote,
  startSeriesPass,
  marginBook,
  marginSeries,
  resetEncountersUnseen,
  setReaderProgress,
  watchEpisode,
} from "./support/margin-fixtures";

// Corre contra un build de producción (`npm run build && npm run start`), no
// `next dev`: un `use cache` mal puesto pasa el build y falla en `next start`.
// El progreso del lector se escribe por REST (mismo trigger de BD que una
// sesión real); la revelación SÍ se comprueba en el navegador al recargar la ficha.

async function loggedInPage(browser: Browser, actor: { email: string; password: string }) {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  await loginExperienceUser(page, actor);
  return page;
}

async function leaveBookNote(page: Page, bookId: string, pageNo: string, chapter: string, body: string) {
  await page.goto(`/libro/${bookId}`);
  // «Mi registro» (donde vive el margen) solo existe si la obra está seguida: la autora la añade.
  await page.getByRole("button", { name: "Seguir", exact: true }).click();
  await page.getByRole("button", { name: "Dejar una nota en el margen" }).click();
  const sheet = page.getByRole("dialog", { name: "Una nota en el margen" });
  await sheet.getByLabel("Página").fill(pageNo);
  await sheet.getByLabel("Capítulo").fill(chapter);
  await sheet.getByLabel("Tu nota").fill(body);
  await sheet.getByRole("button", { name: "Dejar la nota" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Nota dejada en el margen");
  await expect(sheet).toBeHidden();
}

const ANY_REVEAL = /nota en el margen|notas en el margen/;

test.describe("notas en el margen", () => {
  test("se abre al pasar el margen, se responde y la autora ve el hilo", async ({ browser }) => {
    const author = await experienceActor("margin-author", true);
    const reader = await experienceActor("margin-reader", true);
    const book = await marginBook();
    const body = `${MARGIN_QA_PREFIX}aquí lloré`;
    try {
      await follow(reader.id, author.id);

      // La autora deja la nota con la hoja real de la ficha (se hace seguidora de la obra para ver «Mi registro»).
      const a = await loggedInPage(browser, author);
      await leaveBookNote(a, book.id, "214", "Cap. 12", body);
      await expect(a.getByText(body)).toBeVisible();

      const r = await loggedInPage(browser, reader);
      // Sesión hasta la 200: aún no.
      await setReaderProgress(reader.id, book.id, { page: 200 });
      await r.goto(`/libro/${book.id}?tab=log`);
      await expect(r.getByRole("heading", { name: "Notas en el margen" })).toBeVisible();
      await expect(r.getByRole("dialog", { name: ANY_REVEAL })).toHaveCount(0);
      await expect(r.getByText(body)).toHaveCount(0);

      // Hasta la 230: revelación al recargar la ficha.
      await setReaderProgress(reader.id, book.id, { page: 230 });
      await r.goto(`/libro/${book.id}?tab=log`);
      const reveal = r.getByRole("dialog", { name: "Has encontrado una nota en el margen" });
      await expect(reveal).toBeVisible();
      await expect(reveal.getByText(body)).toBeVisible();
      await reveal.getByRole("link", { name: "Responder" }).click();
      await expect(r).toHaveURL(/\/margen\/[0-9a-f-]{36}$/);
      await expect(r.getByText(body)).toBeVisible();
      // Los comentarios del hilo están plegados hasta pulsar el contador.
      await r.getByRole("button", { name: /^0 comentarios$/ }).click();
      const reply = `${MARGIN_QA_PREFIX}yo también`;
      await r.getByPlaceholder("Escribe un comentario…").first().fill(reply);
      await r.getByRole("button", { name: "Comentar", exact: true }).click();
      await expect(r.getByText(reply)).toBeVisible();

      // La autora ve quién la encontró y el hilo.
      await a.goto(`/libro/${book.id}?tab=log`);
      await expect(a.getByText(/La encontraron: /)).toBeVisible();
      await a.getByRole("link", { name: "margin-reader" }).first().click();
      await expect(a).toHaveURL(/\/margen\/[0-9a-f-]{36}$/);
      await a.getByRole("button", { name: /^1 comentario$/ }).click();
      await expect(a.getByText(reply)).toBeVisible();
    } finally {
      await clearMarginFixtures([book.id]);
      await deleteExperienceActor(author);
      await deleteExperienceActor(reader);
    }
  });

  test("retroactiva: aparece como nueva en la ficha y en el Cuaderno, sin hoja", async ({ browser }) => {
    const author = await experienceActor("margin-author", true);
    const reader = await experienceActor("margin-reader", true);
    const book = await marginBook();
    const body = `${MARGIN_QA_PREFIX}retro`;
    try {
      await follow(reader.id, author.id);
      // El lector ya terminó el libro ANTES de que la autora escriba.
      await setReaderProgress(reader.id, book.id, { status: "completed" });

      await insertBookNote(author, book.id, 300, 400, "Cap. 20", body);

      const r = await loggedInPage(browser, reader);
      await r.goto(`/libro/${book.id}?tab=log`);
      await expect(r.getByText(body)).toBeVisible();
      await expect(r.getByText("Nueva", { exact: true })).toBeVisible();
      await expect(r.getByRole("dialog", { name: ANY_REVEAL })).toHaveCount(0);

      // La ficha las marca vistas; se devuelve a «sin ver» para probar el Cuaderno.
      await expect.poll(async () => (await encountersForReader(reader.id)).every((e) => e.seen_at)).toBe(true);
      await resetEncountersUnseen(reader.id);
      await r.goto("/notas?margen=encontradas");
      await expect(r.getByText(body)).toBeVisible();
      await expect(r.getByText("Nueva", { exact: true })).toBeVisible();
    } finally {
      await clearMarginFixtures([book.id]);
      await deleteExperienceActor(author);
      await deleteExperienceActor(reader);
    }
  });

  test("serie: la nota del T1E3 no se abre al ver el T1E4 y sí al ver el T1E3", async ({ browser }) => {
    const author = await experienceActor("margin-author", true);
    const reader = await experienceActor("margin-reader", true);
    const series = await marginSeries();
    const body = `${MARGIN_QA_PREFIX}giro del tercero`;
    try {
      await follow(reader.id, author.id);
      // Nota de episodio por REST: la ficha no fija episodio (eso lo hace el panel de episodios).
      await insertEpisodeNote(author, series.id, 1, 3, body);

      const r = await loggedInPage(browser, reader);
      await startSeriesPass(reader.id, series.id);
      await watchEpisode(reader.id, series.id, 1, 4);
      await r.goto(`/serie/${series.id}?tab=log`);
      await expect(r.getByRole("heading", { name: "Notas en el margen" })).toBeVisible();
      await expect(r.getByText(body)).toHaveCount(0);
      await expect(r.getByRole("dialog", { name: ANY_REVEAL })).toHaveCount(0);

      await watchEpisode(reader.id, series.id, 1, 3);
      await r.goto(`/serie/${series.id}?tab=log`);
      const reveal = r.getByRole("dialog", { name: "Has encontrado una nota en el margen" });
      await expect(reveal).toBeVisible();
      await expect(reveal.getByText(body)).toBeVisible();
      await expect(reveal.getByText("T1 · E3")).toBeVisible();
    } finally {
      await clearMarginFixtures([], [series.id]);
      await deleteExperienceActor(author);
      await deleteExperienceActor(reader);
    }
  });

  test("la hoja de la ficha deja la nota y la autora la ve en su ficha", async ({ browser }) => {
    const author = await experienceActor("margin-author", true);
    const book = await marginBook();
    try {
      const a = await loggedInPage(browser, author);
      await leaveBookNote(a, book.id, "214", "Cap. 12", `${MARGIN_QA_PREFIX}desde la hoja`);
      await expect(a.getByText(`${MARGIN_QA_PREFIX}desde la hoja`)).toBeVisible();
    } finally {
      await clearMarginFixtures([book.id]);
      await deleteExperienceActor(author);
    }
  });
});
