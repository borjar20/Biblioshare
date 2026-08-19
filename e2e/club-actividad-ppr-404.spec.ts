import { expect, test } from "@playwright/test";

// Issue #514. La ruta genérica de actividad, `/club/[slug]/actividad/[id]`, se
// compila como Partial Prerender (`◐` en `next build`) y en un build de
// PRODUCCIÓN devuelve **200** al pedir un evento (`kind='evento'`, que el body
// 404-ea con `notFound()` porque `hasDetailView === false`). En `next dev` el
// mismo caso da 404.
//
// MEDIDO el 2026-08-19 contra `next build` + `next start`, que es lo que la
// issue dejaba sin medir y lo único que decidía su gravedad:
//
//   · el cuerpo servido NO contiene el título del evento
//   · no hay heading con ese título
//   · el <title> es el genérico ("Actividad — Biblioshare", defensa de #131)
//   · y `notFound()` inyecta <meta name="robots" content="noindex">
//
// O sea: el 200 sirve el CONTENIDO del 404. No hay fuga entre cuentas — la
// hipótesis P0 de la issue queda descartada.
//
// Y el 200 NO es un fallo de esta ruta ni una configuración mal puesta: es
// comportamiento DOCUMENTADO de Cache Components. De
// `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`:
//
//   «Because the check runs inside the <Suspense> boundary, the response has
//    already begun streaming as a 200, and the status can't change once
//    streaming has started. The noindex tag keeps a soft 404 out of search
//    results. To return a real 404 status, the resource has to be checked
//    before the response streams. With Cache Components, every dynamic route
//    streams a static shell first, so run that check in `proxy` instead.»
//
// De paso: `export const instant = false` NO es —ni pretende ser— un opt-out de
// PPR. Solo desactiva la validación de navegación instantánea y la del shell
// estático (ver su doc de referencia). Tampoco `dynamic = 'force-dynamic'`
// serviría: la guía de migración dice literalmente «Not needed. All pages are
// dynamic by default».
//
// Por eso este spec asevera el CONTENIDO y el `noindex`, que es la protección
// real, y NO exige 404: exigirlo sería aseverar un bug. El status se comprueba
// como «404 en dev, 200 en producción», que es el contrato de verdad.
//
// Se apoya en un evento que ya existe en el club de pruebas en vez de crearlo
// por el asistente: aquí no se prueba la creación (eso es club-evento.spec.ts),
// y arrastrar ese flujo solo añade motivos de rojo ajenos a lo que se mide.

const CLUB_SLUG = "test-public-club";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("la ruta genérica de actividad no sirve la ficha de un evento (#514)", async ({
  page,
  request,
}) => {
  test.skip(
    !SUPABASE_URL || !SERVICE_KEY || !process.env.TEST_USER_EMAIL,
    "faltan credenciales en .env.local",
  );

  // Un evento cualquiera del club de pruebas. Se lee con service_role porque
  // esto es preparación del test, no la superficie que se está probando.
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/club_activities?select=id,title,club_id,kind` +
      `&kind=eq.evento&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  expect(res.ok(), "no se pudo leer un evento de ejemplo").toBeTruthy();
  const [evento] = (await res.json()) as Array<{ id: string; title: string }>;
  test.skip(!evento, "no hay ningún evento en dev con el que probar");

  await page.goto("/login");
  await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  const respuesta = await page.goto(`/club/${CLUB_SLUG}/actividad/${evento.id}`);
  const status = respuesta?.status();
  const html = (await respuesta?.text()) ?? "";

  // LA ASERCIÓN QUE IMPORTA: pase lo que pase con el status, el cuerpo NO puede
  // ser la ficha del evento. Se comprueba sobre el HTML servido y no sobre lo
  // que se ve en pantalla: con PPR el shell estático llega primero y un
  // `toBeVisible` podría medir el estado intermedio.
  expect(html, `el cuerpo servido no debe contener el título del evento (status ${status})`)
    .not.toContain(evento.title);
  await expect(page.getByRole("heading", { name: evento.title })).toHaveCount(0);

  // Y el <title>, que #131 ya cerró y sigue siendo la defensa del <head>.
  await expect(page).not.toHaveTitle(new RegExp(evento.title));

  // LA OTRA QUE IMPORTA: con 200, el `noindex` que inyecta `notFound()` es lo
  // único que mantiene la página fuera de los buscadores. Si alguien "arregla"
  // el gate cambiando `notFound()` por un render alternativo, el status seguiría
  // siendo 200 y ESTO se caería — que es justo el aviso que hace falta.
  expect(html, "notFound() debe inyectar el noindex que sostiene el soft-404")
    .toMatch(/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i);

  // El status es 404 en `next dev` y 200 en un build de producción. No se exige
  // 404: es comportamiento documentado de Cache Components (ver cabecera), y
  // exigirlo sería aseverar un bug. Lo que sí se cierra es que no sea un 2xx con
  // la ficha real: de eso se encargan las aserciones de contenido de arriba.
  expect([200, 404], `status inesperado: ${status}`).toContain(status);
});
