"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSharedActivity, type ShareRef } from "@/lib/social/shared-activity";
import type { FeedEvent } from "@/lib/social/feed";

const RECENT_LIMIT = 10;

// getFeed() (Bloque C) filtra por `follows` -- a quién sigues -- así que
// nunca puede devolver las propias filas del viewer, sin importar qué
// viewerId se le pase (su propia query es `follower_id = viewerId`, que
// resuelve a quién sigue viewerId, nunca a viewerId mismo). Para "mi propia
// actividad reciente" se hace una query ligera y propia sobre las 4 tablas
// fuente, y cada fila se re-resuelve vía resolveSharedActivity (Task 3) en
// vez de re-derivar la forma FeedEvent por tercera vez en el proyecto.
export async function loadOwnRecentActivity(): Promise<FeedEvent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [added, progressed, diary, episodes] = await Promise.all([
    supabase
      .from("library_entries")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("progress_sessions")
      .select("id, session_date")
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("diary_entries")
      .select("id, finished_on")
      .eq("user_id", user.id)
      .order("finished_on", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("episode_watches")
      .select("id, watched_on")
      .eq("user_id", user.id)
      .order("watched_on", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  const refs: { ref: ShareRef; date: string }[] = [
    ...(added.data ?? []).map((r) => ({
      ref: { sourceTable: "library_entries" as const, rowId: r.id },
      date: r.created_at,
    })),
    ...(progressed.data ?? []).map((r) => ({
      ref: { sourceTable: "progress_sessions" as const, rowId: r.id },
      date: r.session_date,
    })),
    ...(diary.data ?? []).map((r) => ({
      ref: { sourceTable: "diary_entries" as const, rowId: r.id },
      date: r.finished_on,
    })),
    ...(episodes.data ?? []).map((r) => ({
      ref: { sourceTable: "episode_watches" as const, rowId: r.id },
      date: r.watched_on,
    })),
  ];
  refs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const events = await Promise.all(
    refs.slice(0, RECENT_LIMIT).map((r) => resolveSharedActivity(supabase, r.ref)),
  );
  return events.filter((e): e is FeedEvent => e !== null);
}
