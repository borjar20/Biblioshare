"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";

// Novedades por club: posts y actividades creados por OTRA persona después de la
// última vez que abriste ese club. Lo tuyo propio no es novedad para ti.
//
// Va por RPC (club_unread_counts) y no con queries sueltas porque son dos
// recuentos por cada club del que eres miembro: en TypeScript serían N+1
// consultas, y en SQL es una.
export async function getClubUnreadCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return new Map();

  const { data, error } = await supabase.rpc("club_unread_counts");
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [row.club_id as string, row.unread as number]),
  );
}

// Marcar un club como leído hasta ahora. Se llama al abrir su feed.
export async function markClubRead(clubId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return;

  // upsert: la primera vez inserta, después actualiza. La RLS de club_reads solo
  // deja tocar tu propia fila.
  const { error } = await supabase.from("club_reads").upsert(
    {
      user_id: user.id,
      club_id: clubId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,club_id" },
  );
  if (error) throw error;
}
