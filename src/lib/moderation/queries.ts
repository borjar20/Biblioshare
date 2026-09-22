import "server-only";
import { getCurrentUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { HistoryRow, ModerationKind, ModerationPage } from "./contracts";

/** Session-scoped: never put administrative evidence in a shared cache. */
export async function getModerationPage<T>(kind: ModerationKind, status: string, query: string, offset: number): Promise<ModerationPage<T>> {
  if (await getCurrentUserRole() !== "admin") throw new Error("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_moderation_list", {
    p_kind: kind, p_status: status, p_query: query.slice(0, 200), p_offset: offset,
  });
  if (error) throw new Error("moderation_load_failed");
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.items)) {
    throw new Error("moderation_invalid_response");
  }
  let items = data.items as unknown as T[];
  if (kind === "history") {
    const rows = items as unknown as HistoryRow[];
    const ids = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, username, display_name").in("user_id", ids);
      const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name || `@${profile.username}`]));
      items = rows.map((row) => ({ ...row, actor_name: names.get(row.actor_id) ?? null })) as unknown as T[];
    }
  }
  return { items, has_more: data.has_more === true };
}
