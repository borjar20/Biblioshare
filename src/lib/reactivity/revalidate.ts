import "server-only";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";

// Única fuente de verdad de "qué rutas afecta mutar X". Toda server action
// revalida a través de estos helpers en vez de llamar a revalidatePath suelto,
// para que "olvidar una ruta" deje de ser posible. Modelo de caché anterior
// (sin cacheComponents): revalidatePath basta y actualiza la UI al momento si
// estás viendo la ruta afectada.

/** Caducidad inmediata para `revalidateTag` (ver el bloque de `expire*`). */
const EXPIRE_NOW = { expire: 0 } as const;

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

/** El detalle de UNA colección (/coleccion/c/[id]) además del listado. Ruta
 *  distinta de `revalidateLibrary` por el mismo motivo que las pantallas de
 *  saga: renombrar una colección estando DENTRO de su detalle no refrescaba el
 *  título hasta salir y volver. Casi siempre se quieren las dos, así que van
 *  juntas y no hay que acordarse de la segunda. */
export function revalidateCollection(id: string): void {
  revalidateLibrary();
  revalidatePath(`/coleccion/c/${id}`);
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

/** El panel de administración. */
export function revalidateAdmin(): void {
  revalidatePath("/admin");
}

/** El buscador (alta manual de catálogo, que cambia lo que encuentra). */
export function revalidateSearch(): void {
  revalidatePath("/buscar");
}

/** La bandeja de filas sin resolver de una importación CSV. */
export function revalidatePendingImports(): void {
  revalidatePath("/importar/pendientes");
}

/** El asistente de alta (sus 3 pasos comparten ruta). */
export function revalidateOnboarding(): void {
  revalidatePath("/onboarding");
}

/** El chrome ENTERO, por una vez y a propósito.
 *
 *  Es la revalidación más cara que hay —purga la Client Cache y todo lo
 *  cacheado bajo el layout raíz—, así que vive aquí con nombre propio para que
 *  usarla sea una decisión y no un descuido. Solo tiene un caso legítimo:
 *  terminar el onboarding, que hace aparecer las barras de navegación por
 *  primera vez y ocurre UNA vez en la vida de una cuenta.
 *
 *  Lo que NO es caso: refrescar un contador de la topbar (era F1-014, en la
 *  campana). Un dato por-usuario no se cachea, así que no hay nada que purgar. */
export function revalidateAppChrome(): void {
  revalidatePath("/", "layout");
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

/** Fin de una importación CSV. El importador escribe pases `completed` CON NOTA
 *  sin pasar por `revalidateReadingLog` —el comentario de ahí arriba («todo
 *  escritor de nota pasa por aquí») era falso para este camino—, así que la
 *  media cacheada de cada obra importada seguía enseñando el valor viejo hasta
 *  que expiraba sola por `cacheLife("hours")` (#718).
 *
 *  Las etiquetas se invalidan UNA por obra (es el dato que cambió de verdad),
 *  pero las páginas UNA vez por tanda: un import de 300 filas no puede disparar
 *  300 revalidaciones de perfil y feed. Por eso no vale con llamar a
 *  `revalidateReadingLog` en bucle. */
export function revalidateImportBatch(
  itemType: ItemType,
  itemIds: readonly string[]
): void {
  const seen = new Set<string>();
  for (const id of itemIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    updateTag(`ratings:${itemType}:${id}`);
  }
  if (seen.size === 0) return;

  // Las fichas van por patrón (`revalidateAllItemPages`) en vez de una a una:
  // con cientos de obras importadas sale más barato y no hay que enumerar.
  revalidateAllItemPages();
  revalidateProfilePages();
  revalidateFeed();
}

/** Alta rápida en la biblioteca (el «＋» del feed y del buscador, que crea un
 *  pase `planned`). Toca TRES zonas: el feed —de donde se pulsa—, la biblioteca
 *  —donde la obra acaba de aparecer— y la ficha, cuyo CTA pasa de «Añadir» a
 *  «En tu biblioteca».
 *
 *  Antes solo se revalidaba `"/"` (F1-030): ni colección ni ficha. Hoy no se
 *  nota porque Next aún refresca al NAVEGAR toda página ya visitada, pero ese
 *  comportamiento está documentado como temporal — el día que lo retiren, la
 *  biblioteca se queda sin la obra recién añadida hasta recargar a mano.
 *
 *  No lleva `updateTag("ratings:…")` a propósito: un pase `planned` no tiene
 *  nota, así que la media de la comunidad no cambia. */
export function revalidateQuickAdd(itemType: ItemType, id: string): void {
  revalidateFeed();
  revalidateLibrary();
  revalidateItemPage(itemType, id);
}

/** Variante en lote del anterior («Guardar los N en mi cola»). Las fichas van
 *  por patrón en vez de una a una: son hasta 20 obras de tipos mezclados y
 *  enumerarlas costaría más que revalidar las tres rutas dinámicas. */
export function revalidateQuickAddMany(): void {
  revalidateFeed();
  revalidateLibrary();
  revalidateAllItemPages();
}

// --- Caducar (`revalidateTag`) vs. actualizar (`updateTag`) ---
//
// `{ expire: 0 }` es obligatorio en Next 16: `revalidateTag` pide un segundo
// argumento con el perfil de caducidad, y sin él la entrada seguiría viva su
// `cacheLife` completo —o sea, no caducaría nada—. Cero = fuera ya.
//
// Los dos helpers de abajo se llaman `expire*` y no `revalidate*` y la
// diferencia NO es cosmética: `updateTag` solo es legal DENTRO de una server
// action, y estos dos se invocan desde `after()` en la ficha —el
// enriquecimiento perezoso ocurre durante el render, no en una acción—. Con
// `updateTag` ahí, Next lanza en runtime.
//
// La semántica también encaja mejor: `updateTag` hace que la SIGUIENTE petición
// espere al dato fresco (read-your-own-writes, imprescindible cuando el que
// mutó es el que va a mirar). Aquí quien enriquece no es «el dueño» del dato —
// es un visitante cualquiera que ha rellenado catálogo compartido—, así que
// basta con marcar la entrada caducada y que se recalcule cuando toque.

/** Caduca los créditos (reparto/equipo) de un ítem recién enriquecido.
 *
 *  `getItemCredits` cachea con `cacheLife("days")` bajo la etiqueta
 *  `credits:<tipo>:<id>`, y hasta F1-023 nadie la invalidaba jamás. El agujero
 *  no es el enriquecido que funciona —ese escribe ANTES de que la misma
 *  petición lea, así que cachea bien—, sino el que FALLA: si Open Library o
 *  TMDB no contestan, la visita cachea créditos VACÍOS durante DÍAS, y la
 *  siguiente visita —la que sí consigue escribirlos— los sigue leyendo vacíos
 *  de la caché. Caducando al escribir, la visita siguiente ya los ve. */
export function expireItemCredits(itemType: ItemType, id: string): void {
  revalidateTag(`credits:${itemType}:${id}`, EXPIRE_NOW);
}

/** Caduca la membresía de saga de varios ítems desde un contexto de render
 *  (hoy: entrar en una colección TMDB al abrir una ficha de película). Mismo
 *  alcance que `revalidateSagaMembership`, distinta primitiva. */
export function expireSagaMembership(
  members: readonly { itemType: ItemType; itemId: string }[]
): void {
  for (const tag of membershipTags(members)) revalidateTag(tag, EXPIRE_NOW);
}

/** Cambio en la composición de una saga (alta, baja o borrado de la saga).
 *
 *  Recibe TODOS los miembros, no solo el ítem tocado, y ese es el punto: la
 *  ficha de cada miembro enseña «nº X de Y», y la Y es el total de la saga —
 *  así que añadir una obra cambia el rótulo de todas las demás. Hasta F1-023
 *  solo se revalidaba la ficha del ítem tocado, con lo que el resto seguía
 *  cantando el total viejo hasta que expiraba `cacheLife("days")`.
 *
 *  Se invoca desde server actions de colaborador (`updateTag`, con su espera al
 *  dato fresco: el que acaba de curar la saga la recarga y tiene que ver su
 *  cambio). Deduplica porque una misma obra puede llegar por dos caminos al
 *  recomponer jerarquías de subsagas. */
export function revalidateSagaMembership(
  members: readonly { itemType: ItemType; itemId: string }[]
): void {
  for (const tag of membershipTags(members)) updateTag(tag);
}

/** Las etiquetas de membresía, deduplicadas: una misma obra puede llegar por
 *  dos caminos al recomponer jerarquías de subsagas, y una saga de 40 títulos
 *  no debe disparar 80 invalidaciones. */
function membershipTags(
  members: readonly { itemType: ItemType; itemId: string }[]
): string[] {
  const seen = new Set<string>();
  for (const member of members) {
    seen.add(`saga-membership:${member.itemType}:${member.itemId}`);
  }
  return [...seen];
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
