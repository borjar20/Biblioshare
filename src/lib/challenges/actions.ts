"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { ChallengeCriteria } from "./types";
import { revalidateProfilePages } from "@/lib/reactivity/revalidate";

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 80;

export type ChallengeFormState = {
  error?: "invalidName" | "invalidTarget" | "invalidDates" | "generic";
};

// Shared parse/validate for create and update. Returns the DB row payload or an
// error state — the client sends untrusted FormData (§ server-action security),
// so nothing here is taken on trust: name length, a positive target, a valid
// date window, and a whitelisted item_type are all re-checked server-side.
function parseForm(
  formData: FormData
): { error: ChallengeFormState } | { row: {
  name: string;
  item_type: ItemType | null;
  target_count: number;
  criteria: ChallengeCriteria;
  start_date: string;
  end_date: string;
} } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > MAX_NAME) return { error: { error: "invalidName" } };

  const target = Number(String(formData.get("targetCount") ?? "").trim());
  if (!Number.isInteger(target) || target < 1) return { error: { error: "invalidTarget" } };

  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate < startDate) {
    return { error: { error: "invalidDates" } };
  }

  const typeRaw = String(formData.get("itemType") ?? "").trim();
  const itemType = ITEM_TYPES.includes(typeRaw as ItemType) ? (typeRaw as ItemType) : null;

  const genre = String(formData.get("genre") ?? "").trim();
  const sagaId = String(formData.get("sagaId") ?? "").trim();
  const criteria: ChallengeCriteria = {
    ...(genre && { genre }),
    ...(sagaId && { sagaId }),
  };

  return {
    row: {
      name,
      item_type: itemType,
      target_count: target,
      criteria,
      start_date: startDate,
      end_date: endDate,
    },
  };
}

export async function createChallenge(
  _prevState: ChallengeFormState,
  formData: FormData
): Promise<ChallengeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed.error;

  const { error } = await supabase
    .from("challenges")
    .insert({ user_id: user.id, ...parsed.row });

  if (error) return { error: "generic" };

  revalidateProfilePages();
  return {};
}

export async function updateChallenge(
  challengeId: string,
  _prevState: ChallengeFormState,
  formData: FormData
): Promise<ChallengeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed.error;

  const { error } = await supabase
    .from("challenges")
    .update(parsed.row)
    .eq("id", challengeId)
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidateProfilePages();
  return {};
}

// Archiving keeps the challenge and its history but drops it from the active
// list (§7.10). Toggle so the same button can restore it.
export async function setChallengeArchived(
  challengeId: string,
  archived: boolean
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("challenges")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", challengeId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateProfilePages();
}

export async function deleteChallenge(challengeId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("challenges")
    .delete()
    .eq("id", challengeId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateProfilePages();
}
