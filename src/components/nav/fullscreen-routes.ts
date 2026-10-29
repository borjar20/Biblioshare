/**
 * Rutas que se comen el marco de la app. `/partida/activa` es la única pantalla de
 * Biblioshare sin topbar ni barra de cinco, y eso es justo lo que separa
 * «configurar» de «jugar»: la mesa ocupa el dispositivo entero (#931).
 *
 * OJO con el prefijo: `/partidas` (los hubs) NO entra — comparar con un `startsWith`
 * a secas dejaría los hubs sin navegación.
 *
 * `/comunidad/entre-nosotros` es el atlas de Entre nosotros: un mapa a sangre
 * con su propio «← Comunidad».
 *
 * `/saga/<id>/mapa` es el atlas de la saga (spec 2026-10-28 §3), con su propio
 * «‹». `/saga/<id>/mapa/editar` NO: es un redirect al editor, que va con marco.
 *
 * `/sagas` es el atlas de sagas y universos (spec 2026-10-28 índice §3); `/sagas/nueva` no.
 */
export function isFullscreenRoute(pathname: string): boolean {
  return pathname === "/partida" || pathname.startsWith("/partida/")
    || pathname === "/mascota" || pathname.startsWith("/mascota/")
    || pathname === "/comunidad/entre-nosotros"
    || /^\/saga\/[^/]+\/mapa$/.test(pathname)
    || pathname === "/sagas";
}
