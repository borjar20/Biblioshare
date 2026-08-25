import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

// Prefijo común a todas las pasadas: la limpieza barre por él, así que una
// corrida se lleva también lo que dejaron las anteriores.
const PREFIJO = "e2e reactividad ";

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

  const cuerpo = `${PREFIJO}${Date.now()}`;

  // El borrado sigue pidiendo confirmación con `confirm()` nativo, aunque ahora
  // se pida desde el «···». Playwright descarta los diálogos por defecto.
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
    // Borrar dejó de ser un botón en la tarjeta: vive tras el «···» (F3-012,
    // `3061b6f0`). La tarjeta se localiza por el menú, no por el botón rojo que
    // ya no existe — que es lo que dejó este spec en rojo un mes (#750).
    // La tarjeta se ancla por su clase (`div.shadow-card`), no por `div` a
    // secas: filtrar `div` por texto casa también con los CONTENEDORES que
    // envuelven a todos los posts del feed, y `.last()` no salva de eso — el
    // locator resolvía a doce menús a la vez.
    const tarjeta = page.locator("div.shadow-card").filter({ hasText: cuerpo }).last();
    await tarjeta.getByRole("button", { name: /acciones de la publicación/i }).click();
    await page.getByRole("menuitem", { name: /^borrar$/i }).click();

    await expect(page.getByText(cuerpo)).toHaveCount(0, { timeout: 15_000 });

    console.log("FEED REACTIVO OK:", cuerpo);
  } finally {
    // Red de seguridad: si el test cae antes del borrado por UI, el post queda
    // en la base. fetch nativo (el fixture `request` muere con el contexto).
    //
    // Se borra por PREFIJO, no por el cuerpo exacto de esta pasada: mientras el
    // spec estuvo en rojo cada corrida dejó su post huérfano en el club de
    // pruebas, y una limpieza que solo se lleva lo suyo no los recoge nunca
    // (#750). Mismo criterio que el `globalSetup` de sagas, que reimpone la
    // línea base en vez de fiarse de que la pasada anterior limpiara.
    await fetch(
      `${SUPABASE_URL}/rest/v1/club_posts?body=like.${encodeURIComponent(`${PREFIJO}%`)}`,
      { method: "DELETE", headers: adminHeaders() },
    );
  }
});
