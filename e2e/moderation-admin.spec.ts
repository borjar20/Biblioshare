import { test, expect, type Page } from "@playwright/test";
import { api, cleanupModeration, createUser, ids, login, namespace, seed, write } from "./support/moderation-fixtures";

// Run with playwright.moderation.config.ts. Private persistent audit evidence is
// intentionally not REST-deletable; run the companion cleanup SQL in DEV before
// and after this spec (see e2e/fixtures/moderation-admin-cleanup.sql).
test("admin reviews reports and withdraws, restores and permanently deletes content", async ({ page, browser }, testInfo) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  let adminToken: string | undefined;
  let primaryError: unknown;
  const failed: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", request => {
    if (!request.failure()?.errorText.includes("ERR_ABORTED")) failed.push(`${request.method()} ${request.url()}`);
  });
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  async function select(kind: "post" | "club" | "comment" | "club_post", id: string) {
    await page.goto(`/admin/${kind === "club" ? "clubes" : "contenido"}?kind=${kind}&q=${id}`);
    await expect(page.getByTestId("moderation-row")).toHaveCount(1);
    await expect(page.getByTestId("moderation-row")).toBeVisible();
  }
  async function act(action: "Retirar" | "Restaurar" | "Eliminar definitivamente", confirmation?: string) {
    await page.getByRole("button", { name: "Acciones de moderación" }).click();
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    const form = page.getByRole("form", { name: action, exact: true });
    const submit = form.getByRole("button", { name: action, exact: true });
    await expect(submit).toBeDisabled();
    await form.getByLabel("Motivo de la decisión").fill(`${namespace}: ${action}`);
    if (confirmation) {
      await form.getByLabel(/Escribe/).fill("CONFIRMACION INCORRECTA");
      await form.getByRole("checkbox").check();
      await expect(submit).toBeDisabled();
      await form.getByLabel(/Escribe/).fill(confirmation);
    }
    await submit.click();
    await expect(form).toHaveCount(0);
  }
  async function invisible(viewer: Page, route: string, text: string) {
    await viewer.goto(route);
    await expect(viewer.getByText(text, { exact: true })).toHaveCount(0);
    await expect(viewer.getByRole("heading", { name: /404|no encontramos|no existe|no encontrada/i }).first()).toBeVisible();
  }
  try {
    await cleanupModeration();
    const admin = await createUser("admin");
    adminToken = admin.token;
    const owner = await createUser("owner");
    await seed(owner, admin);
    await login(page, admin);
    await login(ownerPage, owner);
    await ownerPage.goto("/admin/contenido");
    await expect(ownerPage).toHaveURL("http://localhost:3000/");
    for (const [rpc, body] of [
      ["admin_moderation_list", { p_kind: "post", p_status: "all", p_query: "", p_offset: 0 }],
      ["admin_moderate_content", { p_kind: "post", p_id: ids.post, p_action: "remove", p_reason: "unauthorized", p_confirmation: "" }],
    ] as const) {
      const denied = await api(`rest/v1/rpc/${rpc}`, "POST", body, owner.token);
      expect(denied.status, `${rpc} denies non-admin`).toBe(403);
    }
    await page.goto("/admin/reportes");
    const nav = page.getByRole("navigation", { name: "Administración" });
    for (const name of ["Reportes", "Contenido", "Clubes", "Usuarios", "Historial"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    await page.getByLabel("Buscar por texto o identificador").fill(ids.report);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByTestId("moderation-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Resolver reporte", exact: true }).click();
    const review = page.getByRole("form", { name: "Resolver reporte" });
    await review.getByLabel("Motivo de la decisión").fill(`${namespace}: revisado`);
    await review.getByRole("button", { name: "Resolver reporte", exact: true }).click();
    await expect(page.getByTestId("moderation-row")).toHaveCount(0);
    await select("post", ids.post);
    await page.getByRole("button", { name: "Acciones de moderación" }).click();
    await expect(page.getByRole("menuitem", { name: "Retirar", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: testInfo.outputPath("moderation-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("moderation-row")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("moderation-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await ownerPage.goto(`/post/${ids.post}`);
    await expect(ownerPage.getByText(`${namespace} post`, { exact: true })).toBeVisible();
    await act("Retirar");
    await expect(page.getByTestId("moderation-row").getByText("Retirado", { exact: true })).toBeVisible();
    await invisible(ownerPage, `/post/${ids.post}`, `${namespace} post`);
    await invisible(page, `/post/${ids.post}`, `${namespace} post`);
    await select("post", ids.post);
    await act("Restaurar");
    await ownerPage.goto(`/post/${ids.post}`);
    await expect(ownerPage.getByText(`${namespace} post`, { exact: true })).toBeVisible();
    await select("comment", ids.comment);
    await act("Retirar");
    await ownerPage.goto(`/post/${ids.post}`);
    await expect(ownerPage.getByText(`${namespace} comment`, { exact: true })).toHaveCount(0);
    await act("Restaurar");
    await ownerPage.reload();
    await expect(ownerPage.getByText(`${namespace} comment`, { exact: true })).toBeVisible();
    await select("club_post", ids.clubPost);
    await act("Retirar");
    await select("club", ids.club);
    await act("Retirar");
    await invisible(ownerPage, `/club/${namespace}`, `${namespace} club`);
    await invisible(page, `/club/${namespace}`, `${namespace} club`);
    await select("club", ids.club);
    await act("Restaurar");
    await ownerPage.goto(`/club/${namespace}`);
    await expect(ownerPage.getByText(`${namespace} club`, { exact: true }).first()).toBeVisible();
    await select("club_post", ids.clubPost);
    await expect(page.getByTestId("moderation-row").getByText("Retirado", { exact: true })).toBeVisible();
    await act("Restaurar");
    await select("post", ids.post);
    await act("Eliminar definitivamente", "ELIMINAR");
    await expect(page.getByTestId("moderation-row")).toHaveCount(0);
    await select("club", ids.club);
    await act("Eliminar definitivamente", `${namespace} club`);
    await expect(page.getByTestId("moderation-row")).toHaveCount(0);
    for (const [table, id] of [["posts", ids.post], ["clubs", ids.club], ["club_posts", ids.clubPost], ["comments", ids.comment]]) {
      expect(await (await write(`rest/v1/${table}?id=eq.${id}&select=id`, "GET")).json()).toEqual([]);
    }
    expect(await (await write(`rest/v1/passes?id=eq.${ids.pass}&select=id`, "GET")).json()).toEqual([{ id: ids.pass }]);
    const [report] = await (await write(`rest/v1/content_reports?id=eq.${ids.report}`, "GET")).json();
    expect(report.status).toBe("actioned");
    expect(report.target_deleted_at).toBeTruthy();
    expect(report.snapshot.body).toBe(`${namespace} comment`);
    await page.goto(`/admin/historial?q=${ids.club}`);
    await expect(page.getByTestId("moderation-row")
      .filter({ hasText: `${namespace}: Eliminar definitivamente` })
      .filter({ has: page.locator("dd", { hasText: `Club · ${ids.club}` }) })).toHaveCount(1);
    expect(errors, "uncaught browser errors").toEqual([]);
    expect(failed, "unexpected failed network requests").toEqual([]);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await testInfo.attach("console-errors", { body: consoleErrors.join("\n\n"), contentType: "text/plain" });
    await ownerContext.close();
    try { await cleanupModeration(adminToken); }
    catch (cleanupError) {
      if (primaryError) throw new AggregateError([primaryError, cleanupError], "Moderation assertion and fixture cleanup both failed");
      throw cleanupError;
    }
  }
});
