import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { PlayGamesApi, PlayGameRow } from "./sync";

type PlayGameInsert = Database["public"]["Tables"]["play_games"]["Insert"];

// Adaptador estrecho sobre supabase-js: lo único que el ejecutor necesita.
// RLS filtra por owner en el select; el owner_id se añade aquí al subir.
export function createPlayGamesApi(ownerId: string): PlayGamesApi {
  const client = createClient();
  return {
    async selectAll() {
      const { data, error } = await client
        .from("play_games")
        .select("id, tool_id, started_at, finished_at, saved_at, summary, events");
      if (error || data === null) return { error: true };
      return { rows: data as unknown as PlayGameRow[] };
    },
    async upsert(rows: PlayGameRow[]) {
      // events/summary son JSON opaco para el ejecutor (PlayEvent[]/SavedGameSummary
      // en su tipo real); el cast al Insert generado es el mismo trato que
      // selectAll hace a la inversa.
      const { error } = await client
        .from("play_games")
        .upsert(rows.map((row) => ({ ...row, owner_id: ownerId })) as unknown as PlayGameInsert[]);
      return { error: error !== null };
    },
    async remove(ids: string[]) {
      const { error } = await client.from("play_games").delete().in("id", ids);
      return { error: error !== null };
    },
  };
}
