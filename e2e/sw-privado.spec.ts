import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Opt-in: el service worker solo se registra en producción, así que este spec
// necesita un build real sirviendo en :3000 (Playwright lo reutiliza gracias a
// reuseExistingServer). Cómo correrlo:
//   npm run build && npm start          # en otra terminal, en :3000
//   SW_E2E=1 npx playwright test e2e/sw-privado.spec.ts
//
// El bug (#680): el SW guardaba el HTML de TODA navegación con éxito, también
// las autenticadas, y nada lo purgaba al cerrar sesión — en un dispositivo
// compartido y sin red, otra persona podía recibir el HTML privado de la
// cuenta anterior.
test.describe("service worker y HTML privado", () => {
  test.skip(process.env.SW_E2E !== "1", "requiere build de producción (ver cabecera)");
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(120_000);

  async function cachedDocumentPaths(page: Page): Promise<string[]> {
    return page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          // Solo documentos: fuera estáticos con hash y assets de /public.
          if (url.pathname.startsWith("/_next/static/")) continue;
          if (/\.[a-z0-9]+$/i.test(url.pathname)) continue;
          paths.push(url.pathname);
        }
      }
      return paths;
    });
  }

  test("una navegación con sesión no se cachea, y el logout purga el caché", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // Sin SW al mando el test no probaría nada: se espera a que tome el control.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 30_000,
    });

    // Navegaciones completas (documento, no RSC) a páginas con sesión.
    await page.goto("/coleccion");
    await page.goto("/ajustes");

    // Cinturón 1: el HTML autenticado (Next lo sirve con no-store) no entra en
    // Cache Storage. Solo puede quedar el salvavidas /offline.
    await expect
      .poll(async () => {
        const paths = await cachedDocumentPaths(page);
        return paths.filter((p) => p !== "/offline");
      })
      .toEqual([]);

    // Cinturón 2: cerrar sesión purga el caché entero y re-siembra /offline.
    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await page.waitForURL("/");
    await expect
      .poll(async () => cachedDocumentPaths(page), { timeout: 15_000 })
      .toEqual(["/offline"]);
  });
});
