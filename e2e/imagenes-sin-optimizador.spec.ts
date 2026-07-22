import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Regresión de cuota: el plan Hobby de Vercel incluye 5.000 transformaciones de
// imagen al mes y ya se agotó una vez. Con el loader propio
// (src/lib/images/cdn-loader.ts) ninguna imagen debe pasar por el optimizador,
// ni en dev (/_next/image) ni en producción (/_vercel/image).
//
// Si alguien revierte `loader: "custom"` en next.config.ts, este test cae.
test("ninguna imagen pasa por el optimizador de Vercel", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  const optimizadas: string[] = [];
  const rotas: string[] = [];
  const desdeCdn: string[] = [];

  page.on("request", (req) => {
    if (req.resourceType() !== "image") return;
    const url = req.url();
    if (url.includes("/_next/image") || url.includes("/_vercel/image")) {
      optimizadas.push(url);
    }
    if (/image\.tmdb\.org|covers\.openlibrary\.org|\.supabase\.co/.test(url)) {
      desdeCdn.push(url);
    }
  });
  page.on("response", (res) => {
    if (res.request().resourceType() !== "image") return;
    // Portadas que devuelven 4xx: normalmente el loader pidió al CDN un
    // tamaño que esa familia de imágenes no admite.
    if (res.status() >= 400) rotas.push(`${res.status()} ${res.url()}`);
  });

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // Colección: la vista con más portadas por pantalla.
  await page.goto("/coleccion");
  await expect(page.locator("h1:visible")).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Sin esto el test pasaría en una colección vacía, que no prueba nada.
  expect(desdeCdn.length, "portadas cargadas directas del CDN").toBeGreaterThan(
    0
  );
  expect(optimizadas, "imágenes servidas por el optimizador").toEqual([]);
  expect(rotas, "portadas que devolvieron error").toEqual([]);
});
