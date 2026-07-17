import type { createClient } from "@/lib/supabase/server";
import { parsePosition } from "@/lib/library/position";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MIN_PACE_SAMPLES = 3;
const MAX_SAMPLES = 20;

type SessionRow = {
  pass_id: string;
  session_date: string;
  duration_minutes: number | null;
  position: unknown;
};

type Sample = { value: number; date: string };

function mostRecentAverage(samples: Sample[]): { rate: number; sampleCount: number } | null {
  if (samples.length < MIN_PACE_SAMPLES) return null;
  const recent = samples.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SAMPLES);
  const rate = recent.reduce((sum, s) => sum + s.value, 0) / recent.length;
  return { rate, sampleCount: recent.length };
}

// Agrupado por PASE, no por obra: cada relectura empieza su propio cursor de
// página en 0 (§Tarea 9, hub) — agrupar por obra mezclaría el final de una
// lectura anterior con el arranque de la siguiente y produciría deltas
// negativos o falsos.
function groupByPass(rows: SessionRow[]): Map<string, SessionRow[]> {
  const byPass = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const list = byPass.get(row.pass_id) ?? [];
    list.push(row);
    byPass.set(row.pass_id, list);
  }
  return byPass;
}

export type BookPace = { pagesPerMinute: number; sampleCount: number } | null;

// Pages/minute rate derived from the user's own progress_sessions: each
// session that logs both a duration and a page reached, with a known prior
// page, produces one sample. Aggregated from the most recent samples across
// all their books — see docs/REQUIREMENTS.md §7.22 (transparency: the
// formula is shown to the user, not a hidden model).
export async function getBookPace(
  supabase: SupabaseServerClient,
  userId: string
): Promise<BookPace> {
  // Las sesiones cuelgan del pase (pass_id, §Tarea 9, hub); item_type ya no
  // se resuelve vía library_entries sino uniendo con el propio pase.
  const { data, error } = await supabase
    .from("progress_sessions")
    .select("pass_id, session_date, duration_minutes, position, passes!inner(item_type)")
    .eq("user_id", userId)
    .eq("passes.item_type", "book")
    .order("session_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const samples: Sample[] = [];
  for (const sessions of groupByPass((data ?? []) as SessionRow[]).values()) {
    let lastKnownPage: number | null = null;
    for (const session of sessions) {
      const position = parsePosition("book", session.position);
      const page = "page" in position ? position.page : undefined;

      if (
        page !== undefined &&
        lastKnownPage !== null &&
        page > lastKnownPage &&
        session.duration_minutes &&
        session.duration_minutes > 0
      ) {
        samples.push({
          value: (page - lastKnownPage) / session.duration_minutes,
          date: session.session_date,
        });
      }
      if (page !== undefined) lastKnownPage = page;
    }
  }

  const result = mostRecentAverage(samples);
  return result ? { pagesPerMinute: result.rate, sampleCount: result.sampleCount } : null;
}
