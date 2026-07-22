"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { computeMovedPositions, getSagaRoutes } from "./get-saga-routes";

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

  const { error } = await supabase.from("saga_routes").insert({
    saga_id: sagaId,
    slug,
    name,
    summary,
    position: ((last as { position: number } | null)?.position ?? 0) + 1,
  });
  if (error) return { error: error.code === "23505" ? "slugTaken" : "generic" };

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
