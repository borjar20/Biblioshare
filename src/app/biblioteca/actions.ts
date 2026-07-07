"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MediaStatus } from "@/lib/library/types";

export async function updateStatus(entryId: string, status: MediaStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("library_entries")
    .update({ status })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/biblioteca");
}

export async function removeFromLibrary(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("library_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/biblioteca");
}
