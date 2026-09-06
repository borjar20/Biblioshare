import { test, expect } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";

test("Colección muestra estado legible en claro y oscuro, móvil y escritorio", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  expect(url, "solo datos de prueba en dev").toBe("https://tyvzpuhxfwxrnkcpzxyg.supabase.co");
  expect(key).toBeTruthy();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  async function rest(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${url}/rest/v1/${path}`, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
    return response.status === 204 ? null : response.json();
  }
  const suffix = Date.now().toString(36);
  const statuses = ["planned", "in_progress", "completed", "dropped"];
  const titles = statuses.map(status => `E2E892-${status}-${suffix}`);
  await withBattleUsers(url, key, async (create) => {
    const user = await create(`qa892_${suffix}`);
    async function cleanup() {
      await rest(`passes?user_id=eq.${user.id}`, "DELETE");
      await rest(`books?title=in.(${titles.join(",")})`, "DELETE");
    }
    try {
      await cleanup();
      await rest(`profiles?user_id=eq.${user.id}`, "PATCH", { onboarded_at: new Date().toISOString() });
      const books = await rest("books", "POST", titles.map((title) => ({ title }))) as Array<{ id: string }>;
      await rest("passes", "POST", books.map((book, i) => ({ user_id: user.id, item_type: "book", item_id: book.id,
        status: statuses[i], is_active: true, is_public: true })));
      await page.goto("/login");
      await page.locator('input[name="email"]').fill(user.email);
      await page.locator('input[name="password"]').fill(user.password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL("/");
      const badges = page.locator('[data-testid="status-badge"]:visible');
      for (const target of ["collection", "profile"]) {
      if (target === "profile") await page.context().clearCookies();
      await page.goto(target === "collection" ? "/coleccion?tab=todo&type=todos" : `/u/qa892_${suffix}?tab=coleccion`);
      await expect(badges).toHaveCount(4);
      await page.emulateMedia({ colorScheme: "dark" });
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark", "system-dark"]) {
          await page.evaluate((value) => {
            document.documentElement.classList.remove("light", "dark");
            if (value !== "system-dark") document.documentElement.classList.add(value);
          }, theme);
          const measurements = await badges.evaluateAll((nodes) => nodes.map((node) => {
            const style = getComputedStyle(node);
            const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d")!;
            const rgb = (color: string, backing: string) => {
              ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = backing; ctx.fillRect(0, 0, 1, 1);
              ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
              return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
            };
            const luminance = (channels: number[]) => channels.map((value) => {
              const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            }).reduce((total, c, i) => total + c * [0.2126, 0.7152, 0.0722][i], 0);
            const fg = luminance(rgb(style.color, "white"));
            const ratios = ["black", "white"].map((backing) => {
              const bg = luminance(rgb(style.backgroundColor, backing));
              return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
            });
            return { text: node.textContent?.trim(), ratio: Math.min(...ratios), role: node.getAttribute("role"),
              clipped: node.scrollWidth > node.clientWidth };
          }));
          for (const measurement of measurements) {
            expect(measurement.text).toBeTruthy();
            expect(measurement.role).not.toBe("img");
            expect(measurement.ratio).toBeGreaterThanOrEqual(4.5);
            expect(measurement.clipped).toBe(false);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await testInfo.attach(`contrast-${target}-${theme}-${width}`, { body: JSON.stringify(measurements), contentType: "application/json" });
          await page.screenshot({ path: testInfo.outputPath(`${target}-${theme}-${width}.png`), fullPage: true });
        }
      }
      }
    } finally { await cleanup(); }
  });
});
