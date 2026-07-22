"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";

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

// Curación de itinerarios (spec 2026-07-22, Task 8). Al contrario que la
// adopción de arriba, crear/borrar SÍ es curación: gate collaborator+ en el
// server action, además del de RLS que ya lleva la tabla (política "saga
// routes writable by collaborators"). Los dos, nunca solo uno.
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

export async function deleteRoute(routeId: string, sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${sagaId}`);

  await supabase.from("saga_routes").delete().eq("id", routeId);
  revalidateSagaPage(sagaId);
}
