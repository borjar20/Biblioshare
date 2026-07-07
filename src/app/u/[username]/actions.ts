"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfileVisibility(
  username: string,
  isPublic: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ is_public: isPublic })
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath(`/u/${username}`);
}
