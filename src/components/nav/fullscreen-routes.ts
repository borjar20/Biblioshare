/**
 * Rutas que se comen el marco de la app. `/partida/activa` es la única pantalla de
 * Biblioshare sin topbar ni barra de cinco, y eso es justo lo que separa
 * «configurar» de «jugar»: la mesa ocupa el dispositivo entero (#931).
 *
 * OJO con el prefijo: `/partidas` (los hubs) NO entra — comparar con un `startsWith`
 * a secas dejaría los hubs sin navegación.
 */
export function isFullscreenRoute(pathname: string): boolean {
  return pathname === "/partida" || pathname.startsWith("/partida/");
}
