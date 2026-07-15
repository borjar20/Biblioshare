import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// Fase 3: la capa optimista (like/comentario) pinta al instante ENCIMA de la
// revalidación. El timing optimista puro no se puede aseverar fiable en E2E
// (localhost responde rápido), así que se prueba lo que importa: el cambio se
// refleja sin recargar Y persiste al recargar (la verdad del servidor). Se hace
// sobre un post de club porque ahí ReviewInteractions es accesible para devtest.
test("like y comentario de una reseña se reflejan sin recargar y persisten", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const cuerpo = `e2e optimista ${Date.now()}`;
  const comentario = `comentario ${Date.now()}`;

  try {
    // ── Login (devtest, miembro del club público) ──
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    await page.goto(`/club/${CLUB_SLUG}`);

    // ── Crear un post de texto sobre el que interactuar ──
    await page.getByRole("button", { name: /^publicar$/i }).click();
    await page.getByPlaceholder(/qué quieres compartir con el club/i).fill(cuerpo);
    await page.getByRole("button", { name: /^publicar$/i }).click();
    await expect(page.getByText(cuerpo)).toBeVisible({ timeout: 15_000 });

    // La tarjeta de ESTE post: contiene su cuerpo y su botón de like.
    const card = page
      .locator("div.shadow-card")
      .filter({ hasText: cuerpo })
      .filter({ has: page.getByRole("button", { name: "Me gusta" }) })
      .last();

    // ── Like: se marca sin recargar ──
    const like = card.getByRole("button", { name: "Me gusta" });
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");

    // ── Comentario: aparece sin recargar ──
    await card.getByRole("button", { name: /comentario/i }).click(); // expande el hilo
    await card.getByPlaceholder(/escribe un comentario/i).fill(comentario);
    await card.getByRole("button", { name: /^comentar$/i }).click();
    await expect(page.getByText(comentario)).toBeVisible({ timeout: 15_000 });

    // ── Persiste: recargar y la verdad del servidor lo confirma ──
    await page.reload();
    const cardTrasRecarga = page
      .locator("div.shadow-card")
      .filter({ hasText: cuerpo })
      .filter({ has: page.getByRole("button", { name: "Me gusta" }) })
      .last();
    // El like sigue marcado y el contador de comentarios subió a 1.
    await expect(
      cardTrasRecarga.getByRole("button", { name: "Me gusta" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      cardTrasRecarga.getByRole("button", { name: /1 comentario/i }),
    ).toBeVisible();

    console.log("SOCIAL OPTIMISTA OK:", cuerpo, "|", comentario);
  } finally {
    // Borra el post por cuerpo; sus reacciones y comentarios caen por cascade.
    await fetch(
      `${SUPABASE_URL}/rest/v1/club_posts?body=eq.${encodeURIComponent(cuerpo)}`,
      { method: "DELETE", headers: adminHeaders() },
    );
  }
});
