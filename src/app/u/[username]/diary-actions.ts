"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDiaryEntries } from "@/lib/diary/get-diary-entries";
import type { DiaryEntry } from "@/lib/diary/types";

export async function listDiaryEntries(
  libraryEntryId: string
): Promise<DiaryEntry[]> {
  const supabase = await createClient();
  return getDiaryEntries(supabase, libraryEntryId);
}

export type AddDiaryEntryState = {
  error?: "invalidRating" | "generic";
};

export async function addDiaryEntry(
  libraryEntryId: string,
  _prevState: AddDiaryEntryState,
  formData: FormData
): Promise<AddDiaryEntryState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const finishedOn = String(formData.get("finishedOn") ?? "");
  const ratingRaw = String(formData.get("rating") ?? "").trim();
  const review = String(formData.get("review") ?? "").trim();

  let rating: number | null = null;
  if (ratingRaw) {
    rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return { error: "invalidRating" };
    }
  }

  const { error } = await supabase.from("diary_entries").insert({
    library_entry_id: libraryEntryId,
    user_id: user.id,
    finished_on: finishedOn || undefined,
    rating,
    review: review || null,
  });

  if (error) return { error: "generic" };

  revalidatePath("/u/[username]", "page");
  return {};
}

export async function deleteDiaryEntry(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("diary_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/u/[username]", "page");
}
