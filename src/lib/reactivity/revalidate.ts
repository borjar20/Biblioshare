import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";

// Única fuente de verdad de "qué rutas afecta mutar X". Toda server action
// revalida a través de estos helpers en vez de llamar a revalidatePath suelto,
// para que "olvidar una ruta" deje de ser posible. Modelo de caché anterior
// (sin cacheComponents): revalidatePath basta y actualiza la UI al momento si
// estás viendo la ruta afectada.

// --- Primitivas de ruta (una por zona de la app) ---

/** Feed de inicio. */
export function revalidateFeed(): void {
  revalidatePath("/");
}

/** La ficha concreta de un item (p.ej. /libro/123). */
export function revalidateItemPage(itemType: ItemType, id: string): void {
  revalidatePath(itemHref(itemType, id));
}

/** Las tres fichas como patrón dinámico: cuando no se sabe el tipo (p.ej. una
 *  reseña puede vivir en cualquiera). */
export function revalidateAllItemPages(): void {
  revalidatePath("/libro/[id]", "page");
  revalidatePath("/pelicula/[id]", "page");
  revalidatePath("/serie/[id]", "page");
}

/** Todos los perfiles (patrón dinámico): cuando no se conoce el username. */
export function revalidateProfilePages(): void {
  revalidatePath("/u/[username]", "page");
}

/** Un perfil concreto. */
export function revalidateProfile(username: string): void {
  revalidatePath(`/u/${username}`);
}

/** La colección/biblioteca del usuario. */
export function revalidateLibrary(): void {
  revalidatePath("/coleccion");
}

/** La ficha de una saga concreta. */
export function revalidateSagaPage(id: string): void {
  revalidatePath(sagaHref(id));
}

/** La pantalla de curación de miembros de una saga (/saga/[id]/editar, Task 8).
 *  Ruta DISTINTA de `revalidateSagaPage`: quien la mira puede estar editando
 *  miembros cuya fila real vive en una subsaga (ver DetailMember.ownerSagaId).
 *
 *  NO es redundante (verificado 2026-07-29 contra los docs de Next 16.2.10,
 *  `node_modules/next/dist/docs/.../revalidatePath.md`): desde una server
 *  function, `revalidatePath` "updates the UI immediately **if viewing the
 *  affected path**" — la ruta SÍ importa para el refresco inmediato. Lo que sí
 *  es global (y temporal, según esos mismos docs) es que las páginas ya
 *  visitadas se refrescan al NAVEGAR a ellas de nuevo. O sea: si mutas algo
 *  estando en /saga/[id]/editar y solo llamas a `revalidateSagaPage`, esta
 *  pantalla no se refresca hasta que salgas y vuelvas. Hay que nombrarla. */
export function revalidateSagaEditPage(id: string): void {
  revalidatePath(`${sagaHref(id)}/editar`);
}

/** La pantalla de gestión de itinerarios de una saga (/saga/[id]/rutas). Ruta
 *  DISTINTA de `revalidateSagaPage`, por el mismo motivo que
 *  `revalidateSagaEditPage`: sin nombrarla, volver a ella tras designar un orden
 *  de lectura la servía con el estado anterior — el radio marcado en lo que ya
 *  no es, y el botón de guardar deshabilitado porque el componente creía estar
 *  al día. Solo se notaba al NAVEGAR de vuelta: dentro de la pantalla, el
 *  `router.refresh()` del propio selector lo tapaba. */
export function revalidateSagaRoutesPage(id: string): void {
  revalidatePath(`${sagaHref(id)}/rutas`);
}

/** Fichas de club + sus actividades + el listado. Las acciones de club manejan
 *  clubId, no slug, así que se usa el patrón dinámico "/club/[slug]" en vez de
 *  la ruta literal. */
export function revalidateClubPages(): void {
  revalidatePath("/club/[slug]", "page");
  revalidatePath("/club/[slug]/actividad/[id]", "page");
  // El calendario y la ficha de evento también: seguir un evento cambia el
  // contador de seguidores de la ficha y la marca de «seguido» de la rejilla, y
  // sin esto el optimismo de la UI no tendría con qué reconciliarse (la causa
  // nº1 de «no se actualiza sin recargar»).
  revalidatePath("/club/[slug]/calendario", "page");
  revalidatePath("/club/[slug]/evento/[id]", "page");
  revalidatePath("/clubes");
}

// --- Helpers compuestos por forma de mutación ---

/** Registro de lectura (pase, sesión, episodio visto): ficha + perfiles + feed.
 *  Fase 4 (#448): además refresca la media de la comunidad cacheada
 *  (`getRatingSummary`, etiqueta `ratings:*`). `updateTag` —no `revalidateTag`—
 *  hace que la SIGUIENTE petición espere al dato fresco: el que acaba de puntuar
 *  ve su voto contado de inmediato (read-your-own-writes, la clase de bug más
 *  cara del repo: #36/#37/#39/#66). Es el punto PRECISO donde cambia una nota:
 *  todo escritor de nota pasa por aquí, y no por `revalidateItemPage` (que
 *  también dispara en ediciones de metadatos que no tocan la nota). */
export function revalidateReadingLog(itemType: ItemType, id: string): void {
  updateTag(`ratings:${itemType}:${id}`);
  revalidateItemPage(itemType, id);
  revalidateProfilePages();
  revalidateFeed();
}

/** Reacción/comentario: puede vivir en una ficha, en el feed o en un post de
 *  club — por eso revalida las tres zonas. La inclusión de las fichas de club
 *  es el arreglo del bug: antes un like a un post de club nunca revalidaba
 *  /club/[slug]. */
export function revalidateInteraction(): void {
  revalidateAllItemPages();
  revalidateFeed();
  revalidateClubPages();
}
