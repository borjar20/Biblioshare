"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";
import { notifyClub } from "@/lib/clubs/activities/notify-club";
import type { ItemType } from "@/lib/catalog/types";
import type { RoundState } from "./types";

const MAX_PROMPT_LENGTH = 500; // espejo del CHECK club_rounds_prompt_len

export async function getRoundState(clubId: string): Promise<RoundState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_club_round_state", { p_club_id: clubId })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null; // no eres miembro, o el club no existe

  // El nombre del titular pide una segunda consulta: la RPC devuelve el id, y
  // el estado 02 de la maqueta dice «Esta semana le toca a Marta», no un uuid.
  // El del autor es el mismo caso para el estado 03 («{name} propuso la
  // ronda»): si coinciden (titular == autor, el camino normal), se reusa la
  // consulta ya hecha en vez de duplicarla.
  let holderName: string | null = null;
  if (data.holder_id) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("user_id", data.holder_id)
      .maybeSingle();
    holderName = perfil?.display_name ?? perfil?.username ?? null;
  }
  let authorName: string | null = null;
  if (data.round_author) {
    if (data.round_author === data.holder_id) {
      authorName = holderName;
    } else {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", data.round_author)
        .maybeSingle();
      authorName = perfil?.display_name ?? perfil?.username ?? null;
    }
  }

  return {
    periodKey: data.period_key,
    dayIndex: data.day_index,
    holderId: data.holder_id,
    holderName,
    round: data.round_id
      ? {
          id: data.round_id,
          authorId: data.round_author,
          authorName,
          prompt: data.round_prompt,
          itemType: data.round_item_type,
          itemId: data.round_item_id,
        }
      : null,
    housePrompt: data.house_prompt,
  };
}

/** Resultado de `proposeRound`. Los dos fallos de dominio de `ensure_club_round`
 *  (no eres el titular / alguien ya abrió la ronda) viajan como valor, no como
 *  `throw`: Next.js redacta el `message` de los errores lanzados desde una
 *  server action en build de producción (confirmado en Task 4 -- ver
 *  create-error-handler.js, `shouldFormatError = NODE_ENV === 'development'`,
 *  compartido con el mismo pipeline de flight que serializa el resultado de
 *  la acción). Un `catch (e) { String(e).includes(...) }` en el cliente
 *  nunca vería el texto real fuera de dev. Lo inesperado sigue lanzando. */
export type ProposeRoundResult =
  | { ok: true }
  | { ok: false; reason: "round_already_open" | "not_your_turn" };

export async function proposeRound(
  clubId: string,
  prompt: string,
  item: { itemType: ItemType; itemId: string } | null,
): Promise<ProposeRoundResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("not_authenticated");
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("prompt_required");
  if (trimmed.length > MAX_PROMPT_LENGTH) throw new Error("prompt_too_long");

  const supabase = await createClient();
  // El periodo NO se envía: lo calcula la RPC. La RPC también verifica que
  // quien llama es el titular -- validarlo aquí sería decorativo.
  //
  // ensure_club_round puede fallar con dos errores distintos, los dos 42501:
  // "not_your_turn" (no eres el titular) y "round_already_open" (llegaste
  // tarde: ya hay ronda de este periodo escrita por otra persona, tu texto
  // no se ha guardado). Los dos son resultado, no throw -- ver el comentario
  // de ProposeRoundResult. Cualquier otro error de la RPC sí se relanza tal
  // cual, igual que el resto de src/lib/clubs/.
  const { data: roundId, error } = await supabase.rpc("ensure_club_round", {
    p_club_id: clubId,
    p_prompt: trimmed,
    p_item_type: item?.itemType,
    p_item_id: item?.itemId,
  });
  if (error) {
    if (error.message === "round_already_open" || error.message === "not_your_turn") {
      return { ok: false, reason: error.message };
    }
    throw error;
  }

  await notifyClub(supabase, clubId, user.id, "club_round_proposed", roundId);
  revalidateClubPages();
  return { ok: true };
}

/** Materializa la consigna de la casa del periodo actual y devuelve su id.
 *  Se llama justo antes de la PRIMERA respuesta: hasta que alguien contesta,
 *  una ronda de la casa no tiene fila (§2.4 de la spec). Idempotente. */
export async function ensureHouseRound(clubId: string): Promise<string> {
  const supabase = await createClient();
  // Los tres parámetros restantes son opcionales con default null en SQL: se
  // omiten en vez de mandarlos explícitos a null (el Args generado los tipa
  // como `string | undefined`, no `| null`).
  const { data: roundId, error } = await supabase.rpc("ensure_club_round", {
    p_club_id: clubId,
  });
  if (error) throw error;
  revalidateClubPages();
  return roundId;
}
