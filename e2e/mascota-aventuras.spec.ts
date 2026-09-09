import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { resolveFinalEmpire } from "./support/book-fixture";

test.use({ actionTimeout: 20_000 });

// R4a (spec docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md): la
// concesión diaria de aventuras deriva de la actividad real (`passes` +
// `progress_sessions`), y la cadena de tramos vive en una única fila de
// `pet_battles` (`kind = 'adventure'`) hasta que se resuelve. Este spec entra por
// UI con una cuenta desechable, valida la concesión por RPC, reanuda tras recargar
// (log local + lectura del mismo intent por el servidor) y termina la cadena a 2× hasta
// victoria o derrota, comprobando en cada punto lo que hay realmente en la fila.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function cleanPreviousRun(request: APIRequestContext) {
  const response = await request.get(`${url}/rest/v1/profiles?username=in.(r4adventurea,r4adventureb)&select=user_id`, { headers });
  expect(response.ok()).toBe(true);
  for (const { user_id } of await response.json() as Array<{ user_id: string }>) {
    const account = await request.get(`${url}/auth/v1/admin/users/${user_id}`, { headers });
    expect(account.ok()).toBe(true);
    const { email } = await account.json() as { email: string };
    // Never remove a real account that happens to have one of these usernames.
    expect(["r4adventurea@example.com", "r4adventureb@example.com"]).toContain(email);
    expect((await request.delete(`${url}/auth/v1/admin/users/${user_id}`, { headers })).ok()).toBe(true);
  }
}

// `passes_one_active` (20260716_pass_hub_a_columns.sql) permite como mucho un pase
// activo por (user_id, item_type, item_id): sembrar varios días para la MISMA cuenta
// con el mismo libro fixture reutiliza el pase existente en vez de reinsertarlo.
async function seedActivity(request: APIRequestContext, userId: string, daysAgo: number) {
  const book = await resolveFinalEmpire<{ id: string }>(url, headers, "id");
  const existing = await request.get(`${url}/rest/v1/passes?user_id=eq.${userId}&item_id=eq.${book.id}&select=id`, { headers });
  expect(existing.ok()).toBe(true);
  const found = await existing.json() as Array<{ id: string }>;
  let passId = found[0]?.id;
  if (!passId) {
    const pass = await request.post(`${url}/rest/v1/passes`, { headers: { ...headers, Prefer: "return=representation" }, data: { user_id: userId, item_type: "book", item_id: book.id, is_active: true } });
    expect(pass.ok()).toBe(true);
    [{ id: passId }] = await pass.json() as Array<{ id: string }>;
  }
  const day = new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const session = await request.post(`${url}/rest/v1/progress_sessions`, { headers, data: { user_id: userId, pass_id: passId, duration_minutes: 20, session_date: day, position: {} } });
  expect(session.ok()).toBe(true);
  return day;
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login?next=/mascota");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/mascota$/, { timeout: 30_000 });
}

async function userToken(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: anon, "Content-Type": "application/json" }, data: { email, password } });
  expect(res.ok()).toBe(true);
  return (await res.json()).access_token as string;
}

test("aventuras: concesión por día, empezar, reanudar tras recargar, resolver, reintentar o cobrar botín", async ({ page, request }) => {
  // Presupuesto: sembrado y login (~40 s contra Supabase dev) + la cadena entera a 2×
  // (el bucle se corta a los 150 s) + el reintento. Con 240 s el reloj del test se
  // comía el último tramo y moría con «Test timeout» en vez de con una aserción.
  test.setTimeout(330_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await cleanPreviousRun(request);
  await withBattleUsers(url, key, async (createUser) => {
    const a = await createUser("r4adventurea");
    const b = await createUser("r4adventureb");
    for (const u of [a, b]) expect((await request.post(`${url}/rest/v1/pet_state`, { headers, data: { user_id: u.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    await seedActivity(request, a.id, 0);
    await seedActivity(request, a.id, 6);
    await seedActivity(request, a.id, 7); // fuera de ventana

    // Concesión por RPC: A ve dos días, B ninguno
    const tokenA = await userToken(request, a.email, a.password);
    const daysA = await request.post(`${url}/rest/v1/rpc/get_pet_adventure_days`, { headers: { apikey: anon, Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, data: {} });
    expect(daysA.ok()).toBe(true);
    expect(await daysA.json()).toHaveLength(2);
    const tokenB = await userToken(request, b.email, b.password);
    const daysB = await request.post(`${url}/rest/v1/rpc/get_pet_adventure_days`, { headers: { apikey: anon, Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, data: {} });
    expect(await daysB.json()).toHaveLength(0);

    await page.setViewportSize({ width: 320, height: 844 });
    await login(page, a);
    await expect(page.getByText("2 aventuras pendientes", { exact: true })).toBeVisible();
    await page.goto("/mascota?view=adventure");
    const section = page.getByTestId("pet-adventure");
    await section.screenshot({ path: ".superpowers/r4-aventura-pendientes-mobile.png", style: "header:has(a[href='/']) { visibility: hidden; }" });
    await section.getByRole("button", { name: "Empezar aventura", exact: true }).click();
    await expect(section.getByTestId("fight-marker")).toHaveText(/Tramo 1 de \d/);
    await section.screenshot({ path: ".superpowers/r4-aventura-combate-mobile.png", style: "header:has(a[href='/']) { visibility: hidden; }" });
    // Una fila abierta del día más antiguo
    const open = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=*`, { headers })).json() as Array<{ intent_id: string; status: string; attempt: number; adventure_day: string; enemy_id: string }>;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ status: "open", attempt: 1 });
    expect(open[0].enemy_id.split(",").length).toBeGreaterThanOrEqual(2);

    // Recargar a mitad: reanuda en pausa con el mismo intent
    await page.waitForTimeout(1500);
    await section.getByRole("button", { name: "Pausar", exact: true }).click();
    const tickBefore = await section.getByTestId("training-tick").textContent();
    await page.reload();
    await expect(section.getByRole("button", { name: "Reanudar aventura", exact: true })).toBeVisible();
    await section.getByRole("button", { name: "Reanudar aventura", exact: true }).click();
    await expect(section.getByRole("button", { name: "Continuar", exact: true })).toBeVisible();
    expect(await section.getByTestId("training-tick").textContent()).toBe(tickBefore);
    const stillOpen = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=intent_id,status`, { headers })).json() as Array<{ intent_id: string; status: string }>;
    expect(stillOpen).toEqual([{ intent_id: open[0].intent_id, status: "open" }]);

    // Dejar correr a 2× hasta el final (interrumpir cuando haya carga; pulsar Continuar entre tramos)
    const panel = page.getByTestId("pet-adventure");
    await panel.getByRole("button", { name: "Continuar", exact: true }).click();
    await panel.getByRole("combobox", { name: "Velocidad", exact: true }).selectOption("2");
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      if (await panel.getByRole("button", { name: /Reintentar aventura|Ver repetición/ }).first().isVisible().catch(() => false)) break;
      const cont = panel.getByRole("status").getByRole("button", { name: "Continuar", exact: true });
      if (await cont.isVisible().catch(() => false)) { await cont.click(); continue; }
      const skill = panel.getByRole("button", { name: "Golpe interruptor · Usar habilidad" });
      if ((await panel.locator('[data-enemy-phase="windup"]').count()) > 0 && await skill.isEnabled().catch(() => false)) await skill.click();
      await page.waitForTimeout(150);
    }
    const resolved = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=status,result,reward,digest,adventure_day`, { headers })).json() as Array<{ status: string; result: { outcome: string; fight: number } | null; reward: { itemId: string } | null; digest: string | null; adventure_day: string }>;
    expect(resolved).toHaveLength(1);
    expect(resolved[0].status).toBe("resolved");
    expect(resolved[0].digest).toMatch(/^[0-9a-f]{64}$/);
    if (resolved[0].result?.outcome === "win") {
      expect(resolved[0].reward?.itemId).toBeTruthy();
      await expect(panel.getByText("¡Aventura superada!")).toBeVisible();
      await page.getByRole("button", { name: "Ver mochila", exact: true }).click();
      await expect(page.getByTestId("pet-equipment")).toBeVisible();
      await page.getByRole("button", { name: "Campamento", exact: true }).click();
      await expect(page.getByText("1 aventura pendiente", { exact: true })).toBeVisible();
    } else {
      expect(resolved[0].reward).toBeNull();
      await panel.getByRole("button", { name: "Reintentar aventura", exact: true }).click();
      // El marcador de tramo se pinta mientras haya vista, así que SOBREVIVE a la
      // derrota: si se perdió en el primer tramo, «Tramo 1 de 3» ya está en pantalla
      // antes de pulsar y la aserción de abajo se cumpliría sola, dejando que la
      // lectura de la tabla adelante al `start` que aún va de viaje. La señal de que
      // el reintento existe es la fila nueva, no el marcador: se espera por ella.
      const attempts = `${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=attempt,adventure_day,status&order=attempt`;
      await expect.poll(
        async () => (await (await request.get(attempts, { headers })).json() as Array<{ attempt: number }>).map((r) => r.attempt),
        { timeout: 30_000, message: "el reintento inserta el intento 2 del mismo día" },
      ).toEqual([1, 2]);
      await expect(panel.getByTestId("fight-marker")).toHaveText(/Tramo 1 de \d/);
      const rows = await (await request.get(attempts, { headers })).json() as Array<{ attempt: number; adventure_day: string; status: string }>;
      expect(new Set(rows.map((r) => r.adventure_day)).size).toBe(1);
      // los pendientes no cambian al reintentar
      await page.getByRole("button", { name: "Campamento", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Campamento", exact: true })).toBeVisible();
      // The camp CTA describes the current attempt while one exists. Check the
      // actual remaining entitlement rather than requiring a second CTA summary.
      const remaining = await request.post(`${url}/rest/v1/rpc/get_pet_adventure_days`, {headers:{apikey:anon,Authorization:`Bearer ${tokenA}`,"Content-Type":"application/json"},data:{}});
      expect(remaining.ok()).toBe(true);
      expect(await remaining.json()).toHaveLength(1);
    }
    // B no ve nada de A
    const seen = await request.get(`${url}/rest/v1/pet_battles?select=id`, { headers: { apikey: anon, Authorization: `Bearer ${tokenB}` } });
    expect(await seen.json()).toEqual([]);
  });
  expect(errors).toEqual([]);
});
