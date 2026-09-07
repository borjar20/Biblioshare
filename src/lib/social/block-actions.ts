"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidateFeed, revalidateProfilePages, revalidateSocialBurrows } from "@/lib/reactivity/revalidate";
import { createClient } from "@/lib/supabase/server";

function revalidateSocialBoundary(): void {
  revalidateProfilePages();
  revalidateFeed();
  revalidateSocialBurrows();
}

export async function blockUser(targetUserId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.id === targetUserId) throw new Error("No puedes bloquearte a ti mismo");

  const { error } = await supabase.from("user_blocks").insert({
    blocker_id: user.id,
    blocked_id: targetUserId,
  });
  if (error && error.code !== "23505") throw error;

  revalidateSocialBoundary();
}

export async function unblockUser(targetUserId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId);
  if (error) throw error;

  revalidateSocialBoundary();
}
