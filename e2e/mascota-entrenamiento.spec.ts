import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { BROTE, RULESET } from "../src/lib/pet/battle/content";
import { POLICIES, runPolicy } from "../src/lib/pet/battle/policies";
import type { BattleSnapshot } from "../src/lib/pet/battle/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function cleanPreviousRun(request: APIRequestContext) {
  const response = await request.get(`${url}/rest/v1/profiles?username=in.(r2traininga,r2trainingb)&select=user_id`, { headers });
  expect(response.ok()).toBe(true);
  for (const { user_id } of await response.json() as Array<{ user_id: string }>) {
    const account = await request.get(`${url}/auth/v1/admin/users/${user_id}`, { headers });
    expect(account.ok()).toBe(true);
    const { email } = await account.json() as { email: string };
    // Never remove a real account that happens to have one of these usernames.
    expect(["r2traininga@example.com", "r2trainingb@example.com"]).toContain(email);
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
    await panel.screenshot({ path: ".superpowers/r2-training-desktop.png" });
    expect(await panel.getByTestId("training-tick").textContent()).toBe(tick);
    await panel.getByRole("button", { name: "Continuar", exact: true }).click();
    await panel.getByRole("button", { name: /Golpe interruptor.*Usar habilidad/ }).click();
    await expect(panel.getByText(/La habilidad se activa al pulsar, nunca sola/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Golpe interruptor · Recarga:/ })).toBeDisabled();
    await expect(panel.getByTestId("skill-feedback")).toContainText("Última habilidad:");
    const resolveRequest = page.waitForRequest(r => r.headers()["next-action"] !== startAction && Boolean(r.headers()["next-action"]) && r.method() === "POST", { timeout: 45_000 });
    const resolve = await resolveRequest;
    const resolveAction = resolve.headers()["next-action"];
    await expect(panel.getByRole("button", { name: "Ver repetición", exact: true })).toBeVisible({ timeout: 20_000 });
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
      const valid = runPolicy({ seed: before[0].seed, snapshot: before[0].snapshot, ruleset: RULESET, enemy: BROTE }, POLICIES.interrupt);
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
