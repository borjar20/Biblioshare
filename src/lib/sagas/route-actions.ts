"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateSagaPage, revalidateSagaRoutesPage } from "@/lib/reactivity/revalidate";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { computeMovedPositions, getSagaRoutes } from "./get-saga-routes";
import { validateRouteDraft } from "./validate-route-draft";
import { getSagaDetail } from "./get-saga-detail";
import { createCuratedOrder } from "./curated-order";
import type { RawRouteEntry } from "./route-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Adopción de un itinerario (spec 2026-07-22). Clona el patrón de
// follow-actions: RLS solo-dueño y sin gate de rol, porque es preferencia
// personal, no curación.
//
// Guarda el SLUG, no el route_id: así vale también para las rutas sintéticas
// («lectura», «publicacion») y si un curador borra la ruta, la preferencia
// degrada sola al orden por defecto en vez de dejar una referencia rota.
export async function adoptRoute(sagaId: string, slug: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("saga_route_choices")
    .upsert({ user_id: user.id, saga_id: sagaId, route_slug: slug }, { onConflict: "user_id,saga_id" });
  revalidateSagaPage(sagaId);
}

export async function dropRoute(sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("saga_route_choices").delete().eq("user_id", user.id).eq("saga_id", sagaId);
  revalidateSagaPage(sagaId);
}

// Curación de itinerarios (spec 2026-07-22, Task 8): crear, renombrar,
// reordenar, borrar. Al contrario que la adopción de arriba, esto SÍ es
// curación: gate collaborator+ en el server action, además del de RLS que ya
// lleva la tabla (política "saga routes writable by collaborators"). Los
// dos, nunca solo uno.
export type RouteFormState = { error?: "nameRequired" | "slugTaken" | "forbidden" | "generic" };

/** Slug a partir del nombre: minúsculas, sin acentos, separadores simples. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Hallazgo 4 (revisión Task 6): el cálculo de slug + position estaba escrito
// dos veces (aquí y en generateRoute), idéntico carácter a carácter — la
// misma clase de duplicación que en la Task 5 dejó dos rutas empatadas y en
// la Task 4 obligó a unificar un comparador escrito tres veces. Se extrae
// AQUÍ, no a una RPC nueva: sigue siendo un insert de una fila, no una
// operación que necesite atomicidad de servidor. Devuelve el `id` de la fila
// creada porque eso es justo lo que obligaba a duplicar: createRoute solo
// necesitaba devolver RouteFormState (sin id), pero generateRoute sí necesita
// el id para guardar los pasos a continuación.
async function insertRouteRow(
  supabase: SupabaseServerClient,
  sagaId: string,
  name: string,
  summary: string | null,
): Promise<{ id?: string; error?: "slugTaken" | "generic" }> {
  let slug = slugify(name);
  // Los slugs reservados los rechaza el CHECK saga_routes_slug_not_reserved;
  // aquí se desvían antes de llegar, para dar un error legible en vez de un 500.
  if (!slug || slug === "lectura" || slug === "publicacion") slug = `${slug || "ruta"}-1`;

  const { data: last } = await supabase
    .from("saga_routes")
    .select("position")
    .eq("saga_id", sagaId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from("saga_routes")
    .insert({
      saga_id: sagaId,
      slug,
      name,
      summary,
      position: ((last as { position: number } | null)?.position ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.code === "23505" ? "slugTaken" : "generic" };
  return { id: (inserted as { id: string }).id };
}

export async function createRoute(
  sagaId: string,
  _prev: RouteFormState,
  formData: FormData,
): Promise<RouteFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };
  const summary = String(formData.get("summary") ?? "").trim() || null;

  const { error } = await insertRouteRow(supabase, sagaId, name, summary);
  if (error) return { error };

  revalidateSagaPage(sagaId);
  return {};
}

// Renombrar (brecha de spec 2026-07-22, Task 8: la spec pedía "crear,
// renombrar, reordenar, borrar" y solo se entregaron dos de las cuatro). Sin
// esto, corregir el nombre de un itinerario obligaba a borrarlo y recrearlo
// — y saga_route_entries cuelga de route_id con `on delete cascade`, así que
// eso se llevaba por delante todos sus pasos.
export async function renameRoute(
  routeId: string,
  sagaId: string,
  _prev: RouteFormState,
  formData: FormData,
): Promise<RouteFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };
  const summary = String(formData.get("summary") ?? "").trim() || null;

  // Decisión de diseño explícita: el SLUG NO cambia al renombrar. El slug
  // vive en las URLs compartidas (/saga/[id]/rutas/[slug]/editar) y en
  // saga_route_choices.route_slug (la adopción de cada usuario, guardada por
  // slug — ver comentario de adoptRoute arriba). Regenerarlo aquí rompería
  // esos enlaces y desharía en silencio las adopciones existentes de quien ya
  // había elegido esta ruta. Renombrar es cosmético: solo toca `name` y
  // `summary`, nunca `slug`.
  const { error } = await supabase.from("saga_routes").update({ name, summary }).eq("id", routeId);
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  return {};
}

// Reordenar (brecha de spec 2026-07-22, Task 8). saga_routes.position
// gobierna el orden del selector en la ficha (buildRouteList); sin esta
// acción quedaba congelado al orden de creación. Botones arriba/abajo en vez
// de drag & drop: la lista de rutas curadas de una saga es corta y así no
// hace falta ninguna librería nueva ni lógica de puntero, y el resultado es
// accesible por teclado de fábrica (son <button> normales).
export async function moveRoute(routeId: string, sagaId: string, direction: "up" | "down"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${sagaId}`);

  const routes = await getSagaRoutes(supabase, sagaId);
  // computeMovedPositions renumera TODA la lista (no solo el par movido) para
  // no depender de que las posiciones de partida sean únicas — ver el
  // comentario en get-saga-routes.ts.
  const next = computeMovedPositions(routes, routeId, direction);
  if (!next) return; // routeId no encontrado o ya en el extremo: nada que escribir.

  await Promise.all(
    next.map((r) => supabase.from("saga_routes").update({ position: r.position }).eq("id", r.id)),
  );
  revalidateSagaPage(sagaId);
}

// Designar el «Orden de lectura» de una saga (fase 4). Con un itinerario
// designado, la ruta sintética «lectura» deja de ofrecerse: su puesto y su
// etiqueta los ocupa el designado (buildRouteList). Mismo gate duro
// collaborator+ que el resto de este fichero.
export async function setReadingOrder(
  sagaId: string,
  routeId: string | null,
): Promise<{ error?: "emptyRoute" | "forbidden" | "generic" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  if (routeId !== null) {
    // Un itinerario SIN PASOS no puede ocupar el puesto: el flujo normal es
    // crear la fila y editar los pasos después, así que ese estado existe de
    // verdad — y cederle el puesto dejaría la ficha con un chip que no lleva a
    // ninguna parte Y sin la ruta derivada, que es la que sí tiene contenido.
    const { count, error: countError } = await supabase
      .from("saga_route_entries")
      .select("route_id", { count: "exact", head: true })
      .eq("route_id", routeId);
    if (countError) return { error: "generic" };
    if ((count ?? 0) === 0) return { error: "emptyRoute" };
  }

  // Limpiar SIEMPRE primero. El unique parcial `(saga_id) where
  // is_reading_order` rechaza una segunda fila en true, así que designar antes
  // de desdesignar da 23505. Las dos escrituras no son atómicas: el peor caso
  // es quedarse sin designado (estado válido, se reintenta), nunca con dos.
  const { error: clearError } = await supabase
    .from("saga_routes")
    .update({ is_reading_order: false })
    .eq("saga_id", sagaId)
    .eq("is_reading_order", true);
  if (clearError) return { error: "generic" };

  if (routeId !== null) {
    // `eq("saga_id", sagaId)` además del id: impide que una petición manipulada
    // designe un itinerario de otra saga.
    const { error } = await supabase
      .from("saga_routes")
      .update({ is_reading_order: true })
      .eq("id", routeId)
      .eq("saga_id", sagaId);
    if (error) return { error: "generic" };
  }

  revalidateSagaPage(sagaId);
  // Y la propia pantalla de gestión: es la que enseña el radio y la chapa. Sin
  // esto, volver a ella la servía con la designación ANTERIOR, y el selector
  // arrancaba con un `current` viejo — el botón de guardar salía deshabilitado
  // sobre lo que el curador acababa de elegir. Dentro de la pantalla no se veía:
  // lo tapaba el `router.refresh()` del propio componente.
  revalidateSagaRoutesPage(sagaId);
  return {};
}

export async function deleteRoute(routeId: string, sagaId: string): Promise<{ error?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${sagaId}`);

  // Hallazgo 4 (revisión Task 8): antes no se comprobaba `error` ni filas
  // afectadas, así que un routeId inválido (o ya borrado por otra pestaña)
  // revalidaba y "tenía éxito" en silencio, sin borrar nada. `.select("id")`
  // hace que Postgrest devuelva las filas borradas, para poder distinguir
  // "0 filas borradas" de un error real — coherente con cómo createRoute ya
  // maneja su propio error.
  const { data, error } = await supabase.from("saga_routes").delete().eq("id", routeId).select("id");
  if (error || !data || data.length === 0) return { error: true };

  revalidateSagaPage(sagaId);
  return {};
}

// Guardado de los PASOS de un itinerario (Task 9): full-replace atómico vía
// RPC save_saga_route (SECURITY DEFINER, gate collaborator+ interno — Task 1).
// Mismo gate duplicado que el resto de este fichero: el de aquí da un error
// legible en la UI antes de llegar a la RPC; el de la RPC es la garantía real.
export async function saveRoute(
  routeId: string,
  sagaId: string,
  entries: RawRouteEntry[],
  descendantIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  const problems = validateRouteDraft(entries, { descendantIds: new Set(descendantIds) });
  if (problems.length > 0) return { error: problems[0] };

  // La otra mitad de la guarda de `setReadingOrder`: no se puede dejar sin
  // pasos al itinerario que ocupa el puesto de «Orden de lectura». Solo se
  // consulta cuando el borrador se queda a cero, así que el guardado normal no
  // paga nada.
  if (entries.length === 0) {
    const { data: row } = await supabase
      .from("saga_routes")
      .select("is_reading_order")
      .eq("id", routeId)
      .maybeSingle();
    if ((row as { is_reading_order: boolean } | null)?.is_reading_order) {
      return { error: "readingOrderEmpty" };
    }
  }

  const { error } = await supabase.rpc("save_saga_route", {
    p_route_id: routeId,
    p_entries: entries.map((e) => ({
      position: e.position,
      item_type: e.itemType,
      item_id: e.itemId,
      child_saga_id: e.childSagaId,
      note: e.note,
    })),
  });
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  return {};
}

// El generador (Task 6, fase 3): construye un itinerario recorriendo la
// curación, en el mismo orden que el mapa. Hasta esta tarea un itinerario se
// empieza en blanco, y por eso hay cero en producción (aparte del que ya
// existe hecho a mano). Crea uno NUEVO; NUNCA pisa uno existente — una saga
// admite varios, y sobrescribir el trabajo de alguien para ahorrarse un
// nombre no compensa.
//
// Composición, no mecanismo nuevo: la fila se inserta con `insertRouteRow`,
// la misma función de bajo nivel que usa createRoute (cálculo de `position`,
// desvío del slug reservado) — antes estaba duplicada aquí, ver el
// comentario de `insertRouteRow` (hallazgo 4 de la revisión). El guardado de
// los pasos es literalmente `saveRoute`: la misma RPC `save_saga_route`,
// pasando antes por el mismo `validateRouteDraft`.
export async function generateRoute(sagaId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  // getSagaDetail ya trae `orderSagas`/`orderMemberships` (los insumos exactos
  // de createCuratedOrder) y `groups` (para el desempate por título) — la
  // MISMA fuente que usa el mapa derivado (fase 3). No se recalcula el orden
  // por otra vía: si divergiera del mapa, el itinerario generado y el mapa
  // contarían la saga distinto, que es justo lo que esta fase existe para
  // eliminar.
  const detail = await getSagaDetail(supabase, sagaId);
  if (!detail) return { error: "generic" };

  const titleByKey = new Map(
    detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m.title]),
  );
  const mainOrder = createCuratedOrder(detail.orderSagas, detail.orderMemberships, (k) => titleByKey.get(k) ?? "");
  // `curatedOrder` deduplica por clave (el `new Set(...)` interno de
  // createCuratedOrder): una obra miembro de dos sagas del subárbol solo
  // aparece una vez, lo que exige validateRouteDraft más abajo.
  const keys = mainOrder(sagaId);

  // Si no hay nada curado, no se crea nada — ni la fila ni sus pasos. La
  // lección de la #181 (un botón que promete y no cumple) y de la #198 (una
  // pantalla vacía sin explicar es peor que no estar): mejor decir por qué
  // que dejar un itinerario fantasma con cero pasos.
  if (keys.length === 0) return { error: "empty" };

  const t = await getTranslations("sagaEditor");
  const name = t("itineraryGenerateName");

  const { id: insertedId, error: insertError } = await insertRouteRow(supabase, sagaId, name, null);
  if (insertError || !insertedId) return { error: insertError ?? "generic" };

  // Los pasos son obras (childSagaId: null), en el mismo orden que el mapa;
  // `note` siempre null (un generado es un punto de partida, no una curación
  // ya anotada).
  const entries: RawRouteEntry[] = keys.map((key, i) => {
    const sep = key.indexOf(":");
    return {
      position: i + 1,
      itemType: key.slice(0, sep) as ItemType,
      itemId: key.slice(sep + 1),
      childSagaId: null,
      note: null,
    };
  });

  // Guardado de los pasos: literalmente saveRoute, no una reimplementación de
  // la RPC ni de validateRouteDraft.
  const result = await saveRoute(insertedId, sagaId, entries, detail.childRefs.map((c) => c.id));

  // Hallazgo 1 (revisión Task 6): las dos escrituras (la fila y sus pasos) NO
  // son atómicas. Si saveRoute falla tras haber creado la fila, sin este
  // borrado queda un itinerario "Orden curado" con cero pasos y su slug
  // consumido para siempre — exactamente el fantasma que la guarda de arriba
  // (keys.length === 0) evita para el caso "no hay nada curado", pero que no
  // cubre un fallo que llega DESPUÉS del insert (p. ej. la RPC caída). Mejor
  // esfuerzo, no transacción distribuida: si el borrado también fallara, no
  // hay nada más que hacer aquí — se devuelve el error original de saveRoute
  // de todos modos, sin enmascararlo.
  if (result.error) {
    await supabase.from("saga_routes").delete().eq("id", insertedId);
  }
  return result;
}
