"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";

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
