import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// El corazón de la Fase 2: el feed de club deriva su primera página del servidor
// (patrón "ajustar estado al cambiar una prop"), así que un post nuevo o un
// borrado se reflejan SIN recargar — antes el feed sembraba su estado una sola
// vez y solo se enteraba vía callbacks frágiles. Cada aserción de reactividad se
// hace sin `page.reload()`: esa es justo la propiedad que se prueba.
test("el feed de club refleja un post nuevo y su borrado sin recargar", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const cuerpo = `e2e reactividad ${Date.now()}`;

  // El borrado pide confirmación con `confirm()`: aceptarla siempre.
  page.on("dialog", (dialog) => dialog.accept());

  try {
    // ── Login (devtest, miembro del club público) ──
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${CLUB_SLUG}`);

    // ── Publicar un post de texto ──
    // En estado cerrado, el composer es una fila (avatar + placeholder + glifos):
    // el placeholder "Comparte algo con el club…" ABRE el modo texto; ya abierto,
    // el textarea + un "Publicar" que ENVÍA.
    await page.getByRole("button", { name: /comparte algo con el club/i }).click();
    await page
      .getByPlaceholder(/qué quieres compartir con el club/i)
      .fill(cuerpo);
    await page.getByRole("button", { name: /^publicar$/i }).click();

    // ── Aparece en el feed SIN recargar ──
    // La revalidación de la action re-ejecuta la RSC y el feed resiembra su
    // primera página desde las props: el post surge sin tocar la página.
    await expect(page.getByText(cuerpo)).toBeVisible({ timeout: 15_000 });

    // ── Borrarlo → desaparece SIN recargar ──
    const tarjeta = page
      .locator("div")
      .filter({ hasText: cuerpo })
      .filter({ has: page.getByRole("button", { name: /^borrar$/i }) })
      .last();
    await tarjeta.getByRole("button", { name: /^borrar$/i }).click();

    await expect(page.getByText(cuerpo)).toHaveCount(0, { timeout: 15_000 });

    console.log("FEED REACTIVO OK:", cuerpo);
  } finally {
    // Red de seguridad: si el test cae antes del borrado por UI, el post queda
    // en la base. fetch nativo (el fixture `request` muere con el contexto).
    await fetch(
      `${SUPABASE_URL}/rest/v1/club_posts?body=eq.${encodeURIComponent(cuerpo)}`,
      { method: "DELETE", headers: adminHeaders() },
    );
  }
});
