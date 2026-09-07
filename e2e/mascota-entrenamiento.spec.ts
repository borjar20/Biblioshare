import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { BROTE, RULESET } from "../src/lib/pet/battle/content";
import { POLICIES, runPolicy } from "../src/lib/pet/battle/policies";
import type { BattleSnapshot } from "../src/lib/pet/battle/types";
import { createUltiPuzzle } from "../src/lib/pet/battle/ulti";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function cleanPreviousRun(request: APIRequestContext) {
  const response = await request.get(`${url}/rest/v1/profiles?username=in.(r2traininga,r2trainingb,r3traininga)&select=user_id`, { headers });
  expect(response.ok()).toBe(true);
  for (const { user_id } of await response.json() as Array<{ user_id: string }>) {
    const account = await request.get(`${url}/auth/v1/admin/users/${user_id}`, { headers });
    expect(account.ok()).toBe(true);
    const { email } = await account.json() as { email: string };
    // Never remove a real account that happens to have one of these usernames.
    expect(["r2traininga@example.com", "r2trainingb@example.com", "r3traininga@example.com"]).toContain(email);
    expect((await request.delete(`${url}/auth/v1/admin/users/${user_id}`, { headers })).ok()).toBe(true);
  }
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login?next=/mascota");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/mascota$/, { timeout: 30_000 });
}

async function rows(request: APIRequestContext, userId: string, intent?: string) {
  const response = await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${userId}${intent ? `&intent_id=eq.${intent}` : ""}&select=*`, { headers });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<Array<{ id: string; intent_id: string; seed: string; snapshot: BattleSnapshot; status: string; digest: string; inputs: unknown[] }>>;
}

test("training: playable loop, authenticated actions, immutable concurrent resolution and replay", async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await cleanPreviousRun(request);
  await withBattleUsers(url, key, async createUser => {
    const a = await createUser("r2traininga");
    const b = await createUser("r2trainingb");
    for (const user of [a, b]) {
      const seed = await request.post(`${url}/rest/v1/pet_state`, {
        headers, data: { user_id: user.id, name: "Nuez", class: "wizard" },
      });
      expect(seed.ok()).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await login(page, a);
    const panel = page.getByRole("region", { name: "Entrenamiento", exact: true });
    await expect(panel).toBeVisible();
    const startRequest = page.waitForRequest(r => Boolean(r.headers()["next-action"]) && r.method() === "POST");
    await panel.getByRole("button", { name: "Empezar combate", exact: true }).click();
    const start = await startRequest;
    const startAction = start.headers()["next-action"];
    const [uiIntent] = JSON.parse(start.postData()!) as [string];
    await expect(panel.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Pausar", exact: true }).click();
    const tick = await panel.getByTestId("training-tick").textContent();
    await page.waitForTimeout(450);
    expect(await panel.getByTestId("training-tick").textContent()).toBe(tick);
    await panel.getByRole("combobox", { name: "Velocidad", exact: true }).selectOption("2");
    await panel.screenshot({ path: ".superpowers/r2-training-desktop.png", style: "header:has(a[href='/']) { visibility: hidden; }" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await panel.screenshot({ path: ".superpowers/r3-hud-desktop.png", style: "header:has(a[href='/']) { visibility: hidden; }" });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await panel.getByTestId("training-tick").textContent()).toBe(tick);
    // Track the real button through text, countdown and feedback changes.
    // Panel-relative coordinates exclude scrolling and browser scroll anchoring.
    const layout = panel.locator('button[aria-describedby="training-skill-summary"]').evaluate(button => new Promise<{ deltaY: number; deltaHeight: number; phases: number; minY: number; count: number }>(resolve => {
      const ys: number[] = [], heights: number[] = [];
      const phases = new Set<string>();
      const sample = () => {
        if (!button.isConnected) {
          resolve({ deltaY: Math.max(...ys) - Math.min(...ys), deltaHeight: Math.max(...heights) - Math.min(...heights), phases: phases.size, minY: Math.min(...ys), count: ys.length });
          return;
        }
        const rect = button.getBoundingClientRect();
        ys.push(rect.top - button.closest("section")!.getBoundingClientRect().top);
        heights.push(rect.height);
        phases.add(document.querySelector('[data-enemy-phase]')?.getAttribute('data-enemy-phase') ?? "");
        requestAnimationFrame(sample);
      };
      sample();
    }));
    await panel.getByRole("button", { name: "Continuar", exact: true }).click();
    await panel.getByRole("button", { name: /Golpe interruptor.*Usar habilidad/ }).click();
    await panel.getByText("Cómo funcionan los ataques", { exact: true }).click();
    await expect(panel.getByText(/La habilidad se activa al pulsar, nunca sola/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Golpe interruptor · Recarga:/ })).toBeDisabled();
    await expect(panel.getByTestId("skill-feedback")).toContainText("Habilidad:");
    const resolveRequest = page.waitForRequest(r => r.headers()["next-action"] !== startAction && Boolean(r.headers()["next-action"]) && r.method() === "POST", { timeout: 45_000 });
    const resolve = await resolveRequest;
    const resolveAction = resolve.headers()["next-action"];
    await expect(panel.getByRole("button", { name: "Ver repetición", exact: true })).toBeVisible({ timeout: 20_000 });
    const geometry = await layout;
    console.log("Training layout geometry", geometry);
    expect(geometry.phases).toBeGreaterThan(1);
    expect(geometry.count).toBeGreaterThan(50);
    expect(geometry.deltaY, "skill button must not move as combat messages change").toBeLessThan(1);
    expect(geometry.deltaHeight, "skill button must keep its touch target").toBeLessThan(1);
    const [played] = await rows(request, a.id, uiIntent);
    expect(played.status).toBe("resolved");
    expect(played.inputs.length).toBeGreaterThan(0);

    const replayRequest = page.waitForRequest(r => Boolean(r.headers()["next-action"]) && r.method() === "POST");
    await panel.getByRole("button", { name: "Ver repetición", exact: true }).click();
    const replayAction = (await replayRequest).headers()["next-action"];
    const postAction = async (client: Page, action: string, args: unknown[]) => {
      return client.evaluate(async ({ action, args }) => { const response = await fetch("/mascota", { method: "POST",
        headers: { "Next-Action": action, "Content-Type": "text/plain;charset=UTF-8", Origin: "http://localhost:3000" },
        body: JSON.stringify(args),
      });
      if (!response.ok) throw new Error(`Action HTTP ${response.status}`);
      return response.text(); }, { action, args });
    };
    const anonymous = await browser.newContext();
    const other = await browser.newContext();
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto("http://localhost:3000/login");
      expect(await postAction(anonymousPage, startAction, [crypto.randomUUID()])).toContain("UNAUTHENTICATED");
      const otherPage = await other.newPage();
      await login(otherPage, b);
      await expect(otherPage.getByRole("region", { name: "Entrenamiento", exact: true })).toBeVisible();
      expect(await postAction(otherPage, resolveAction, [uiIntent, []])).toContain("NOT_FOUND");
      expect(await postAction(otherPage, replayAction, [uiIntent])).toContain("NOT_FOUND");

      const intent = crypto.randomUUID();
      await Promise.all([postAction(page, startAction, [intent]), postAction(page, startAction, [intent])]);
      const before = await rows(request, a.id, intent);
      expect(before).toHaveLength(1);
      expect(before[0].status).toBe("open");
      expect(await postAction(page, resolveAction, [intent, [{ seq: 0, tick: 0, action: "skill", payload: { injected: "x" } }]]))
        .toContain("NONEMPTY_PAYLOAD");
      expect((await rows(request, a.id, intent))[0].status).toBe("open");
      const valid = runPolicy({ seed: before[0].seed, snapshot: before[0].snapshot, ruleset: RULESET, enemies: [BROTE] }, POLICIES.interrupt);
      const resolutions = await Promise.all([
        postAction(page, resolveAction, [intent, []]),
        postAction(page, resolveAction, [intent, valid.inputs]),
      ]);
      const after = await rows(request, a.id, intent);
      expect(after).toHaveLength(1);
      expect(after[0].status).toBe("resolved");
      expect(after[0].snapshot).toEqual(before[0].snapshot);
      expect(after[0].seed).toBe(before[0].seed);
      for (const response of resolutions) expect(response).toContain(after[0].digest);
      expect(await postAction(page, resolveAction, [intent, [{ invalid: true }]])).toContain(after[0].digest);
      expect(await postAction(page, replayAction, [intent])).toContain(after[0].digest);
      expect(await rows(request, a.id, intent)).toEqual(after);
      // Same UUID in another account is a separate intention, with an independent snapshot/seed.
      await postAction(otherPage, startAction, [intent]);
      expect((await rows(request, b.id, intent))[0].id).not.toBe(after[0].id);

      const malformedIntent = crypto.randomUUID();
      await postAction(page, startAction, [malformedIntent]);
      const patch = await request.patch(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&intent_id=eq.${malformedIntent}`, {
        headers, data: { snapshot: { ...before[0].snapshot, atk: "x" } },
      });
      expect(patch.ok()).toBe(true);
      expect(await postAction(page, resolveAction, [malformedIntent, []])).toContain("INVALID_SNAPSHOT");
      expect((await rows(request, a.id, malformedIntent))[0].status).toBe("open");
    } finally {
      await anonymous.close();
      await other.close();
    }
    await page.bringToFront();
    await expect(panel.getByRole("button", { name: "Ver repetición", exact: true })).toBeVisible({ timeout: 35_000 });
    expect((await rows(request, a.id, uiIntent))[0]).toEqual(played);
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({ path: ".superpowers/r2-result-mobile.png" });
    const countBeforeRepeat = (await rows(request, a.id)).length;
    await panel.getByRole("button", { name: "Nuevo combate", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Pausar", exact: true }).click();
    await panel.screenshot({ path: ".superpowers/r2-training-mobile.png" });
    expect((await rows(request, a.id)).length).toBe(countBeforeRepeat + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test("R3: enemy choice, paused keyboard puzzle, authoritative ultimate and replay", async ({ page, request }) => {
  // Este test encadena dos combates completos contra `caparazon` (el rival con
  // armadura, el más largo), un repaso de la repetición y tres aperturas del puzle:
  // medido, pide ~96 s y no cabe en los 60 s por defecto del config. Hasta ahora no
  // se veía porque moría antes, en la versión del ruleset. No relaja ninguna
  // aserción: solo deja de cortar el test por el reloj.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await cleanPreviousRun(request);
  await withBattleUsers(url, key, async createUser => {
    const user = await createUser("r3traininga");
    expect((await request.post(`${url}/rest/v1/pet_state`, { headers, data: { user_id: user.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    await page.setViewportSize({ width: 320, height: 844 });
    await login(page, user);
    const panel = page.getByRole("region", { name: "Entrenamiento", exact: true });
    await panel.getByRole("combobox", { name: "Rival de entrenamiento" }).selectOption("caparazon");
    await panel.getByRole("button", { name: "Empezar combate", exact: true }).click();
    await panel.getByRole("combobox", { name: "Velocidad", exact: true }).selectOption("2");
    const ready = panel.getByRole("button", { name: "Preparar ulti", exact: true });
    await expect(ready).toBeEnabled({ timeout: 15_000 });
    await ready.click();
    const puzzle = panel.getByTestId("ulti-puzzle");
    await expect(puzzle).toBeVisible();
    const frozen = await panel.getByTestId("training-tick").textContent();
    await page.waitForTimeout(500);
    expect(await panel.getByTestId("training-tick").textContent()).toBe(frozen);
    const [battle] = await rows(request, user.id);
    // El entrenamiento pasó a r4.1 con #1086 (motor de cadena): un solo tramo y los
    // números de r3.1 sin tocar (spec R4a §3). La versión que se graba es la del
    // motor vivo, no la de la release anterior.
    expect(battle).toMatchObject({ enemy_id: "caparazon", ruleset_version: "r4.1", status: "open" });
    const tick = Math.round(Number.parseFloat(frozen!) * 10);
    const order = createUltiPuzzle(battle.seed, tick).recipes.find(recipe => recipe.id === "power")!.order;
    for (const [slot, tile] of order.entries()) {
      await puzzle.getByRole("button", { name: `Ficha ${tile + 1}`, exact: true }).focus();
      await page.keyboard.press("Enter");
      await puzzle.getByRole("button", { name: new RegExp(`^Hueco ${slot + 1}:`) }).focus();
      await page.keyboard.press("Enter");
    }
    await puzzle.screenshot({ path: ".superpowers/r3-puzzle-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await puzzle.screenshot({ path: ".superpowers/r3-puzzle-390.png" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await puzzle.screenshot({ path: ".superpowers/r3-puzzle-dark.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.setViewportSize({ width: 320, height: 844 });
    await puzzle.getByRole("button", { name: "Lanzar ulti", exact: true }).click();
    await expect(puzzle).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Ulti utilizada", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Ver repetición", exact: true })).toBeVisible({ timeout: 40_000 });
    const [resolved] = await rows(request, user.id);
    const ultimates = resolved.inputs.filter(input => (input as { action: string }).action === "ulti");
    expect(ultimates).toEqual([{ seq: 0, tick, action: "ulti", payload: { order: order.join("") } }]);
    expect(resolved.status).toBe("resolved");
    await panel.getByRole("button", { name: "Ver repetición", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ver repetición", exact: true })).toBeVisible({ timeout: 40_000 });
    expect((await rows(request, user.id))[0]).toEqual(resolved);
    await panel.getByRole("button", { name: "Nuevo combate", exact: true }).click();
    await expect(ready).toBeEnabled({ timeout: 15_000 });
    await ready.click();
    await puzzle.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(ready).toBeFocused();
    await expect(ready).toBeEnabled();
    await ready.click();
    await puzzle.getByRole("button", { name: "Saltar · daño base", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Ulti utilizada", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Ver repetición", exact: true })).toBeVisible({ timeout: 40_000 });
    const skipped = (await rows(request, user.id)).find(row => row.intent_id !== battle.intent_id)!;
    expect(skipped.inputs).toMatchObject([{ action: "ulti", payload: { order: "" } }]);
    expect(skipped.status).toBe("resolved");
    expect(errors).toEqual([]);
  });
});
