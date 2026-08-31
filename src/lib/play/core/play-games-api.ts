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
      // Guarda de identidad (clase #680): esta identity la inyecta quien llama
      // (requestSavedSync la recibe del caller), sin releer sesión. Una pestaña
      // rancia renderizada como cuenta A, con otra pestaña ya en cuenta B, sigue
      // teniendo `client` autenticado como B — sin este chequeo, el select
      // trae filas de B y el ejecutor las escribiría en el espejo local bajo
      // identity A (y podría borrar/descartar cosas de A creyendo que son suyas).
      // RLS ya protege el upsert/delete en el servidor; esto protege el espejo
      // local, que no tiene RLS. getUser() valida contra el servidor (no solo
      // lee el JWT local) — una llamada extra por pasada, aceptable.
      const { data: userData } = await client.auth.getUser();
      if (userData.user?.id !== ownerId) return { error: true };
      const { data, error } = await client
        .from("play_games")
        .select("id, tool_id, started_at, finished_at, saved_at, summary, events");
      if (error || data === null) return { error: true };
      return { rows: data as unknown as PlayGameRow[] };
    },
    async upsert(rows: PlayGameRow[]) {
      // events/summary son JSON opaco para el ejecutor (PlayEvent[]/SavedGameSummary
      // en su tipo real); el cast al Insert generado es el mismo trato que
      // selectAll hace a la inversa. updated_at explícito: sin trigger que lo
      // toque, un re-push tras un pull dejaría la columna con la fecha del
      // insert original (M2).
      const now = new Date().toISOString();
      const { error } = await client
        .from("play_games")
        .upsert(
          rows.map((row) => ({ ...row, owner_id: ownerId, updated_at: now })) as unknown as PlayGameInsert[],
        );
      return { error: error !== null };
    },
    async remove(ids: string[]) {
      const { error } = await client.from("play_games").delete().in("id", ids);
      return { error: error !== null };
    },
  };
}
