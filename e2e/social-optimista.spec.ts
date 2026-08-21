import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es miembro

// Prefijo común a todas las pasadas: la limpieza barre por él, así que una
// corrida se lleva también lo que dejaron las anteriores.
const PREFIJO = "e2e optimista ";

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// Cierra el desplegable de reacciones de una tarjeta pulsando su propia capa de
// cierre, y espera a que el trigger vuelva a decir `aria-expanded="false"`. La
// capa es un `<button aria-hidden tabIndex={-1}>` a pantalla completa, así que
// mientras esté abierto ningún otro clic de la tarjeta llega a su destino.
async function cerrarPicker(card: import("@playwright/test").Locator) {
  await card.locator('button[aria-hidden="true"]').first().click();
  await expect(card.getByRole("button", { name: "Reaccionar" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
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

  const cuerpo = `${PREFIJO}${Date.now()}`;
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
    // El composer cerrado es una fila; su placeholder abre el modo texto.
    await page.getByRole("button", { name: /comparte algo con el club/i }).click();
    await page.getByPlaceholder(/qué quieres compartir con el club/i).fill(cuerpo);
    await page.getByRole("button", { name: /^publicar$/i }).click();
    await expect(page.getByText(cuerpo)).toBeVisible({ timeout: 15_000 });

    // La tarjeta de ESTE post: contiene su cuerpo y su botón de reacciones.
    //
    // «Me gusta» dejó de ser un botón suelto en la tarjeta: es una de las cuatro
    // reacciones que viven dentro del desplegable de «Reaccionar» (`7f9c3f69`).
    // Localizar la tarjeta por él era lo que dejó este spec en rojo (#750).
    const card = page
      .locator("div.shadow-card")
      .filter({ hasText: cuerpo })
      .filter({ has: page.getByRole("button", { name: "Reaccionar" }) })
      .last();

    // ── Like: se marca sin recargar ──
    // Se abre el desplegable; queda abierto tras elegir, así que el aserto de
    // `aria-pressed` va sobre el mismo botón que se acaba de pulsar.
    await card.getByRole("button", { name: "Reaccionar" }).click();
    const like = card.getByRole("button", { name: "Me gusta" });
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    // Cerrar antes de seguir. Mientras el desplegable está abierto, la capa que
    // lo cierra ocupa la pantalla entera (`fixed inset-0`, así se cierra sin
    // useEffect — ver `reaction-bar.tsx`) e intercepta cualquier otro clic. Así
    // que se pulsa ESA capa, no «Reaccionar» ni un punto al azar.
    await cerrarPicker(card);

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
      .filter({ has: page.getByRole("button", { name: "Reaccionar" }) })
      .last();
    // El like sigue marcado y el contador de comentarios subió a 1. Hay que
    // reabrir el desplegable: la recarga lo devuelve a cerrado.
    await cardTrasRecarga.getByRole("button", { name: "Reaccionar" }).click();
    await expect(
      cardTrasRecarga.getByRole("button", { name: "Me gusta" }),
    ).toHaveAttribute("aria-pressed", "true");
    await cerrarPicker(cardTrasRecarga);
    await expect(
      cardTrasRecarga.getByRole("button", { name: /1 comentario/i }),
    ).toBeVisible();

    console.log("SOCIAL OPTIMISTA OK:", cuerpo, "|", comentario);
  } finally {
    // Borra por PREFIJO, no por el cuerpo de esta pasada; sus reacciones y
    // comentarios caen por cascade. Mientras el spec estuvo rojo cada corrida
    // dejó su post huérfano en el club de pruebas, y una limpieza que solo se
    // lleva lo suyo no los recoge nunca (#750).
    await fetch(
      `${SUPABASE_URL}/rest/v1/club_posts?body=like.${encodeURIComponent(`${PREFIJO}%`)}`,
      { method: "DELETE", headers: adminHeaders() },
    );
  }
});
