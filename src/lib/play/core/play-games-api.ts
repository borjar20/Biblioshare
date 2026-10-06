import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { PlayGamesApi, PlayGameRow } from "./sync";
import { startSavedSession, type SavedSession } from "./db";
import { isSavedAuthCurrent, verifiedSavedAuth } from "./saved-auth";

type PlayGameInsert = Database["public"]["Tables"]["play_games"]["Insert"];

// Adaptador estrecho sobre supabase-js: lo único que el ejecutor necesita.
// RLS filtra por owner en el select; el owner_id se añade aquí al subir.
export function createPlayGamesApi(ownerId: string): PlayGamesApi {
  const client = createClient();
  let prepared: Promise<SavedSession | null> | undefined;
  const prepareSession = () => prepared ??= (async () => {
    const context = await verifiedSavedAuth(client);
    if (!context || context.identity !== ownerId) return null;
    return startSavedSession(ownerId, context.sessionId);
  })();
  const currentAuth = async () => {
    const session = await prepareSession();
    return session?.sessionId ? isSavedAuthCurrent(client, { identity: ownerId, sessionId: session.sessionId }) : false;
  };
  return {
    prepareSession,
    async selectAll() {
      // Guarda de identidad (clase #680): esta identity la inyecta quien llama
      // (requestSavedSync la recibe del caller). Una pestaña
      // rancia renderizada como cuenta A, con otra pestaña ya en cuenta B, sigue
      // teniendo `client` autenticado como B — sin este chequeo, el select
      // trae filas de B y el ejecutor las escribiría en el espejo local bajo
      // identity A (y podría borrar/descartar cosas de A creyendo que son suyas).
      // RLS ya protege el upsert/delete en el servidor; esto protege el espejo
      // local, que no tiene RLS. getUser() valida contra el servidor (no solo
      // lee el JWT local). prepareSession valida el token capturado una vez;
      // currentAuth comprueba además la sesión antes/después del snapshot.
      if (!await currentAuth()) return { error: true };
      const { data, error } = await client
        .from("play_games")
        .select("id, tool_id, started_at, finished_at, saved_at, summary, events");
      if (error || data === null || !await currentAuth()) return { error: true };
      return { rows: data as unknown as PlayGameRow[] };
    },
    async upsert(rows: PlayGameRow[]) {
      if (!await currentAuth()) return { error: true };
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
      if (!await currentAuth()) return { error: true };
      // El filtro de owner mantiene el alcance aunque Auth cambie entre el
      // chequeo local y el envío de esta petición; RLS continúa aplicándose.
      const { error } = await client.from("play_games").delete().eq("owner_id", ownerId).in("id", ids);
      return { error: error !== null };
    },
  };
}
