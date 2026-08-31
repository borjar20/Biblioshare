import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { MirrorApi } from "./sync";
import type { PlayPlayerRow } from "./players-sync";

type PlayPlayerInsert = Database["public"]["Tables"]["play_players"]["Insert"];

// Adaptador estrecho sobre supabase-js, calcado de play-games-api.ts: misma
// guarda de sesión viva en selectAll (I1, clase #680) y updated_at fresco en
// el upsert (M2).
export function createPlayPlayersApi(ownerId: string): MirrorApi<PlayPlayerRow> {
  const client = createClient();
  return {
    async selectAll() {
      const { data: userData } = await client.auth.getUser();
      if (userData.user?.id !== ownerId) return { error: true };
      const { data, error } = await client.from("play_players").select("id, name");
      if (error || data === null) return { error: true };
      return { rows: data as PlayPlayerRow[] };
    },
    async upsert(rows) {
      const now = new Date().toISOString();
      const { error } = await client
        .from("play_players")
        .upsert(rows.map((row) => ({ ...row, owner_id: ownerId, updated_at: now })) as PlayPlayerInsert[]);
      return { error: error !== null };
    },
    async remove(ids) {
      const { error } = await client.from("play_players").delete().in("id", ids);
      return { error: error !== null };
    },
  };
}
