import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { RULESET } from "../../src/lib/pet/battle/content";
import { BATTLE_RELEASES, replayBattle } from "../../src/lib/pet/battle/replay";
import { snapshotForProfile } from "../../src/lib/pet/battle/profiles";

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") throw new Error("#1171 requires disposable local Supabase");
const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = `qa1171_${Date.now()}`;
const credentials = { email: `${marker}@example.test`, password: `Qa1171!${randomUUID()}` };
const currentHash = BATTLE_RELEASES.find(release => release.rulesetVersion === RULESET.version)!.contentHash;
let actorId: string | undefined;
const ownId = () => { if (!actorId) throw new Error("Missing own actor"); return actorId; };
function check<T>({ data, error }: { data: T; error: { message: string } | null }): T { if (error) throw new Error(error.message); return data; }
async function battles() { const rows = check(await database.from("pet_battles").select("*").eq("user_id", ownId())); if (!rows) throw new Error("Missing battle rows"); return rows; }
async function cleanBattles() { check(await database.from("pet_battles").delete().eq("user_id", ownId())); expect(await battles()).toEqual([]); }
async function pet() { check(await database.from("pet_state").upsert({ user_id: ownId(), name: "Nuez QA1171", class: "wizard" })); }
async function login(page: Page) {
  await page.goto(`/login?next=${encodeURIComponent("/mascota?view=training")}`);
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("region", { name: "Entrenamiento", exact: true })).toBeVisible();
}
async function signInAgain(page: Page, panel: Locator) {
  const link = panel.getByRole("link", { name: "Volver a entrar", exact: true });
  await expect(link).toHaveAttribute("href", `/login?next=${encodeURIComponent("/mascota?view=training")}`);
  await expect(panel.getByRole("button", { name: /Reintentar/ })).toHaveCount(0);
  await link.focus(); await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.locator('button[type="submit"]').click();
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/mascota\?view=training$/);
}
function trainingArgs(pageRequest: { method(): string; headers(): Record<string, string>; postData(): string | null }): [string, string] | null {
  if (pageRequest.method() !== "POST" || !pageRequest.headers()["next-action"]) return null;
  try {
    const args = JSON.parse(pageRequest.postData() ?? "null");
    return Array.isArray(args) && args.length === 2 && typeof args[0] === "string" && typeof args[1] === "string"
      && /^[0-9a-f-]{36}$/.test(args[0]) && ["brote", "caparazon", ""].includes(args[1]) ? [args[0], args[1]] : null;
  } catch { return null; }
}

test.beforeAll(async () => {
  const actor = await database.auth.admin.createUser({ ...credentials, email_confirm: true });
  if (actor.error) throw actor.error;
  if (!actor.data.user) throw new Error("Missing actor");
  actorId = actor.data.user.id;
  check(await database.from("profiles").upsert({ user_id: actorId, username: marker, onboarded_at: new Date().toISOString() }));
  await pet();
});
test.beforeEach(async () => { await cleanBattles(); await pet(); });
test.afterEach(async () => { await cleanBattles(); });
test.afterAll(async ({}, info) => {
  const cleanup: Array<{ table: string; count: number }> = [];
  let auth404 = false;
  try {
    if (actorId) {
      const deleted = await database.auth.admin.deleteUser(actorId); if (deleted.error) throw deleted.error;
      auth404 = (await database.auth.admin.getUserById(actorId)).error?.status === 404; expect(auth404).toBe(true);
      for (const table of ["profiles", "pet_state", "pet_battles", "passes", "pet_acorn_ledger", "pet_cosmetics", "pet_daily_missions", "user_celebrations"]) {
        const remaining = check(await database.from(table).select("user_id").eq("user_id", actorId));
        if (!remaining) throw new Error(`Missing cleanup rows for ${table}`);
        cleanup.push({ table, count: remaining.length }); expect(remaining).toEqual([]);
      }
    }
  } finally {
    const result = { marker, actorId, auth404, cleanup };
    await writeFile(info.outputPath("cleanup.json"), JSON.stringify(result, null, 2));
    if (process.env.QA1171_OUT) await writeFile(`${process.env.QA1171_OUT}/cleanup.json`, JSON.stringify(result, null, 2));
  }
});

for (const viewport of [{ name: "mobile", width: 320, height: 844 }, { name: "desktop", width: 1280, height: 900 }]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    for (const cause of ["network", "authentication", "resolution-authentication", "UNKNOWN_RELEASE", "INVALID_SNAPSHOT", "NO_PET"] as const) {
      test(`${cause}: message, correct action and retained decisions`, async ({ page }, info) => {
        if (cause === "resolution-authentication") { test.setTimeout(60000); await page.clock.install(); }
        const errors: string[] = [], requests: Array<[string, string]> = [];
        const recoveryConsoleErrors: string[] = [], recoveryFailedRequests: Array<{ path: string; error: string | undefined }> = [];
        if (cause === "resolution-authentication") {
          page.on("console", message => { if (message.type() === "error") recoveryConsoleErrors.push(message.text()); });
          page.on("requestfailed", request => recoveryFailedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
        }
        page.on("pageerror", error => errors.push(error.message));
        page.on("request", request => { const args = trainingArgs(request); if (args) requests.push(args); });
        await login(page);
        const panel = page.getByRole("region", { name: "Entrenamiento", exact: true });
        if (cause === "resolution-authentication") {
          await panel.locator('input[value="caparazon"]').check();
          await panel.getByRole("button", { name: "Empezar combate", exact: true }).click();
          await expect(panel.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
          await panel.getByRole("button", { name: "Pausar", exact: true }).click();
          await panel.getByRole("combobox").selectOption("2");
          const original = (await battles())[0]; expect(original.status).toBe("open");
          await page.context().clearCookies();
          await panel.getByRole("button", { name: "Continuar", exact: true }).click();
          await panel.getByRole("button", { name: "Golpe interruptor · Usar habilidad", exact: true }).click();
          await page.clock.runFor((RULESET.maxTicks + 1) * RULESET.tickMs / 2);
          await page.clock.resume();
          await expect(panel.getByRole("alert")).toHaveText("Tu sesión ha caducado. Vuelve a entrar para continuar.");
          expect(await battles()).toEqual([original]);
          const pointerKey = `pet-training:${ownId()}:current`, logKey = `pet-training:${ownId()}:${original.intent_id}`;
          expect(await page.evaluate(key => localStorage.getItem(key), pointerKey)).toBe(JSON.stringify({ intent: original.intent_id }));
          const saved = await page.evaluate(key => localStorage.getItem(key), logKey); expect(saved).not.toBeNull();
          const decisions = JSON.parse(saved!).inputs; expect(decisions).toHaveLength(1); expect(decisions[0].action).toBe("skill");
          await page.screenshot({ path: info.outputPath("training-error.png") });
          await signInAgain(page, panel);
          const checkpointAfterLogin = await page.evaluate(key => localStorage.getItem(key), logKey); expect(checkpointAfterLogin).not.toBeNull();
          await panel.getByRole("button", { name: "Continuar", exact: true }).click();
          const replay = panel.getByRole("button", { name: "Ver repetición", exact: true });
          try {
            // A failed terminal resolution is complete locally; recovery must
            // resolve it without another playback click or advancing the clock.
            await expect(replay, "Terminal recovery must show the result after one Continue").toBeVisible();
            await expect(panel.getByRole("alert")).toHaveCount(0);
            const resolved = await battles(); expect(resolved).toHaveLength(1);
            const row = resolved[0];
            expect(row.id).toBe(original.id); expect(row.intent_id).toBe(original.intent_id); expect(row.status).toBe("resolved");
            expect(row.inputs).toEqual(decisions); expect(row.digest).toMatch(/^[0-9a-f]{64}$/);
            const audit = await replayBattle({ rulesetVersion: row.ruleset_version, contentHash: row.content_hash, enemyId: row.enemy_id, seed: row.seed, snapshot: row.snapshot, inputs: row.inputs, result: row.result });
            expect(audit.ok).toBe(true); if (!audit.ok) throw new Error(`Resolved battle replay failed: ${audit.code}`);
            expect(row.digest).toBe(audit.digest); expect(row.result).toEqual(audit.result);
            await info.attach("retained-decisions", { body: JSON.stringify({ intent: original.intent_id, decisions, result: row.result, digest: row.digest, replayDigest: audit.digest }), contentType: "application/json" });
            await page.screenshot({ path: info.outputPath("training-result.png"), fullPage: true });
          } finally {
            await info.attach("terminal-recovery", { body: JSON.stringify({ viewport, intent: original.intent_id, checkpointBeforeLogin: JSON.parse(saved!), checkpoint: JSON.parse(checkpointAfterLogin!), rows: await battles(), panel: await panel.innerText(), errors, consoleErrors: recoveryConsoleErrors, failedRequests: recoveryFailedRequests, overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) }), contentType: "application/json" });
          }
        } else if (cause === "UNKNOWN_RELEASE" || cause === "INVALID_SNAPSHOT") {
          const intent = randomUUID();
          check(await database.from("pet_battles").insert({
            user_id: ownId(), intent_id: intent, kind: "training", enemy_id: "brote", status: "open",
            ruleset_version: cause === "UNKNOWN_RELEASE" ? "retired-qa1171" : RULESET.version,
            content_hash: currentHash, seed: "00000001000000020000000300000004",
            snapshot: cause === "INVALID_SNAPSHOT" ? { broken: true } : snapshotForProfile("social", "wizard"),
          }));
          const original = (await battles())[0];
          const pointerKey = `pet-training:${ownId()}:current`, logKey = `pet-training:${ownId()}:${intent}`;
          const log = JSON.stringify({ tick: 3, inputs: [] });
          await page.evaluate(({ pointerKey, logKey, intent, log }) => { localStorage.setItem(pointerKey, JSON.stringify({ intent })); localStorage.setItem(logKey, log); }, { pointerKey, logKey, intent, log });
          await page.reload();
          await panel.getByRole("button", { name: "Continuar", exact: true }).click();
          await expect(panel.getByRole("alert")).toHaveText("Este combate no es compatible con la versión actual.");
          expect(await battles()).toEqual([original]);
          expect(await page.evaluate(key => localStorage.getItem(key), pointerKey)).toBe(JSON.stringify({ intent }));
          await panel.getByRole("button", { name: "Empezar un combate nuevo", exact: true }).click();
          await expect(panel.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
          await panel.getByRole("button", { name: "Pausar", exact: true }).click();
          const after = await battles(); expect(after).toHaveLength(2);
          expect(after.find(row => row.intent_id === intent)).toEqual(original);
          expect(requests.at(-1)?.[0]).not.toBe(intent);
          expect(await page.evaluate(key => localStorage.getItem(key), logKey)).toBe(log);
        } else {
          await panel.locator('input[value="caparazon"]').check();
          let blocked = cause === "network";
          if (blocked) await page.route("**/*", async route => {
            if (blocked && trainingArgs(route.request())) await route.abort("connectionfailed");
            else await route.continue();
          });
          if (cause === "authentication") await page.context().clearCookies();
          if (cause === "NO_PET") check(await database.from("pet_state").delete().eq("user_id", ownId()));
          await panel.getByRole("button", { name: "Empezar combate", exact: true }).click();
          const message = cause === "network" ? "No hay conexión con el servidor. Comprueba la conexión y vuelve a intentarlo."
            : cause === "authentication" ? "Tu sesión ha caducado. Vuelve a entrar para continuar."
            : "No se ha podido completar la operación. Puedes reintentar sin perder tus decisiones.";
          await expect(panel.getByRole("alert")).toHaveText(message);
          expect(await battles()).toEqual([]);
          await page.screenshot({ path: info.outputPath("training-error.png") });
          if (cause === "authentication") {
            await signInAgain(page, panel);
            await panel.getByRole("button", { name: "Empezar combate", exact: true }).click();
          } else {
            blocked = false;
            if (cause === "NO_PET") await pet();
            await panel.getByRole("button", { name: "Reintentar el mismo combate", exact: true }).click();
            expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
          }
          await expect(panel.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
          await panel.getByRole("button", { name: "Pausar", exact: true }).click();
          expect(await battles()).toHaveLength(1);
        }
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        await info.attach("training-requests", { body: JSON.stringify({ cause, viewport, actorId, requests }), contentType: "application/json" });
      });
    }
  });
}
