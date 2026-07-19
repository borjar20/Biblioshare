"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";

// Seguimiento explícito de sagas (spec §1.4/§4.2). RLS solo-dueño; el insert
// duplicado (doble click) choca con la PK y se ignora.
export async function followSaga(sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("saga_follows").insert({ user_id: user.id, saga_id: sagaId });
  revalidateSagaPage(sagaId);
}

export async function unfollowSaga(sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("saga_follows")
    .delete()
    .eq("user_id", user.id)
    .eq("saga_id", sagaId);
  revalidateSagaPage(sagaId);
}
