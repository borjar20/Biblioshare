import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { withBattleUsers } from "../support/battle-users";

test("una partida anónima conserva las vidas al recargar", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await page.getByRole("button", { name: "Quitar una vida a Jugador 1" }).click();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
  // Navigate through the public hub before reload, allowing the app's normal
  // asynchronous persistence to finish without inspecting its internal storage.
  await page.goto("/partidas");
  await page.getByRole("link", { name: /partida en curso/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
  await page.reload();
  await expect(page.getByLabel("Vidas de Jugador 1")).toHaveText("39");
});

test("login real y filtros del cuaderno sin desborde móvil (#833)", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  await withBattleUsers(url, key, async (create) => {
    const user = await create(`ci_${randomUUID().replaceAll("-", "").slice(0, 12)}`);
    const response = await fetch(`${url}/rest/v1/profiles?user_id=eq.${user.id}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
    });
    expect(response.ok).toBe(true);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/login?next=/notas");
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/notas$/);
    const search = page.locator('form[action="/notas"]');
    await expect(search.getByRole("button", { name: /buscar/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const bounds = await search.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await search.locator('input[name="q"]').fill("sin coincidencias");
    await search.getByRole("button", { name: /buscar/i }).click();
    await expect(page).toHaveURL(/q=sin(?:\+|%20)coincidencias/);
    await page.goto("/coleccion");
    await expect(page.getByRole("heading", { name: "Mi Biblioteca" })).toBeVisible();
  });
});
