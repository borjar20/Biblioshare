import { test, expect, type Page, type Locator } from "@playwright/test";

// El recuadro para editar un comentario del hilo era inservible en móvil: el
// modo `compact` de CommentComposer ponía textarea, "Cancelar" y "Guardar" en
// la MISMA fila flex, con `rows={1}` y `pr-12` reservado para el contador.
//
// Medido a 360x740 en `/post/[id]`, editando un comentario a profundidad 1
// (dev, este mismo spec contra el código de antes y de después del arreglo):
//
//                          antes    después
//   ancho del campo        152px      262px
//   ancho del comentario   262px      262px
//   alto del campo          35px       92px
//
// O sea: el campo medía el 58% del comentario que estaba editando, y una sola
// línea de alto.
//
// Las dos aserciones miran la CAJA, que es lo único que distingue «se puede
// editar» de «cabe una palabra»; sin motor de layout no hay caja que medir, y
// por eso esto no se cubre con un unitario:
//
//   1. ANCHO — el campo tiene que ser tan ancho como el comentario que edita.
//      Se compara contra el cuerpo del propio comentario en vez de contra un
//      número de píxeles, para que la aserción siga valiendo a cualquier
//      profundidad del hilo y si cambia el ancho del móvil de referencia.
//   2. ALTO — tiene que caber más de una línea.
//
// Se edita un comentario ANIDADO (profundidad 1), no uno raíz: la sangría del
// hilo es justo lo que estrechaba el campo, así que un test a profundidad 0 se
// habría tragado el bug.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MOVIL = { width: 360, height: 740 };

// Marca para encontrar y borrar SOLO lo que siembra este spec. Sin "@": un
// arroba abriría el autocompletado de menciones y taparía el composer.
const MARCA = "e2e-ancho-editor";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function unPostCualquiera(): Promise<string | null> {
  const posts = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/posts?select=id&limit=1`, { headers })
  ).json()) as { id: string }[];
  return posts[0]?.id ?? null;
}

async function borrarSembrado() {
  // Los hijos primero: `parent_id` referencia al padre.
  await fetch(`${SUPABASE_URL}/rest/v1/comments?body=ilike.*${MARCA}*`, {
    method: "DELETE",
    headers,
  });
}

// Escribe en el composer visible y envía. En móvil el composer es
// `fixed bottom-0`, esté respondiendo o no.
async function comentar(page: Page, placeholder: RegExp, texto: string) {
  const campo = page.getByPlaceholder(placeholder).first();
  await campo.waitFor({ state: "visible", timeout: 30_000 });
  await campo.fill(texto);
  await page.getByRole("button", { name: "Comentar", exact: true }).first().click();
}

// El nodo del comentario que contiene `texto`. Los nodos van anidados y
// `querySelectorAll` devuelve orden de documento, así que el ANTECESOR sale
// antes que el descendiente: el último es el comentario en sí, no su padre.
function nodoDelComentario(page: Page, texto: string): Locator {
  return page.locator('[id^="c-"]').filter({ hasText: texto }).last();
}

test.use({ serviceWorkers: "block" });

test.describe("El editor de un comentario del hilo es usable en móvil", () => {
  test.skip(!EMAIL || !PASSWORD, "sin credenciales de test");

  test.afterAll(async () => {
    await borrarSembrado();
  });

  test("editando un comentario anidado, el campo es tan ancho como el comentario", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const postId = await unPostCualquiera();
    test.skip(!postId, "no hay posts en la base dev");

    await borrarSembrado();
    const raiz = `${MARCA} raiz`;
    const hijo = `${MARCA} respuesta anidada que hay que poder editar`;

    await page.setViewportSize(MOVIL);
    await login(page);
    await page.setViewportSize(MOVIL);
    await page.goto(`/post/${postId}`);

    // Siembra por la UI (no por REST) para no tener que resolver el id del
    // usuario: así los dos comentarios son suyos y traen "Editar comentario".
    await comentar(page, /escribe un comentario/i, raiz);
    const nodoRaiz = nodoDelComentario(page, raiz);
    await expect(nodoRaiz).toBeVisible();
    // El comentario optimista se pinta con id `c-optimistic-...` y editarlo
    // fallaría en el servidor: hay que esperar al id real.
    await expect(nodoRaiz).not.toHaveAttribute("id", /optimistic/);

    await nodoRaiz.getByRole("button", { name: "Responder" }).click();
    await comentar(page, /escribe una respuesta/i, hijo);

    const nodoHijo = nodoDelComentario(page, hijo);
    await expect(nodoHijo).toBeVisible();
    await expect(nodoHijo).not.toHaveAttribute("id", /optimistic/);

    // Ancho de referencia: el cuerpo del comentario tal y como se lee, ANTES de
    // entrar en edición.
    const anchoDelTexto = (await nodoHijo.locator("div.break-words").first().boundingBox())!.width;

    await nodoHijo.getByRole("button", { name: "Más acciones" }).click();
    await page.getByRole("button", { name: "Editar comentario" }).click();

    const editor = nodoHijo.locator("textarea");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(hijo);

    const caja = (await editor.boundingBox())!;

    // Antes del arreglo esto salía en 0,58 (los botones y el contador se comían
    // el resto de la fila); después, en 1,00.
    expect(
      caja.width / anchoDelTexto,
      `el campo (${Math.round(caja.width)}px) es mucho más estrecho que el comentario que edita (${Math.round(anchoDelTexto)}px)`,
    ).toBeGreaterThan(0.9);

    // Con `rows={1}` medía 35px; con `rows={3}`, 92px. El umbral va en medio.
    expect(caja.height, "el campo no llega a dos líneas de alto").toBeGreaterThan(45);
  });
});
