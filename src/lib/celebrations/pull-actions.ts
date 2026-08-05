"use server";

import { createClient } from "@/lib/supabase/server";
import type { CelebrationEvent, CelebrationPayload } from "./types";
import { CELEBRATIONS } from "./registry";

// Drena las celebraciones no mostradas del usuario y las devuelve, sellándolas
// como mostradas en la misma sentencia (RPC atómica) — recargar no las repite y
// dos pestañas no animan la misma dos veces. Lo llama el CelebrationProvider al
// montar y tras las mutaciones de dominio.
export async function pullPendingCelebrations(): Promise<CelebrationPayload[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("pull_pending_celebrations");
  if (error) {
    console.error("pullPendingCelebrations", error);
    return [];
  }

  return (data ?? [])
    .filter((row): row is typeof row & { event_type: CelebrationEvent } =>
      Boolean(CELEBRATIONS[row.event_type as CelebrationEvent]),
    )
    .map((row) => ({
      // El payload jsonb ya trae milestone/date/clubId; event_type manda sobre
      // lo que hubiera en el jsonb para no fiarnos de datos guardados.
      ...(row.payload as Record<string, unknown>),
      event: row.event_type,
    }));
}
