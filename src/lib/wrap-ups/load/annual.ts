// Hechos exclusivos del anual (spec 2026-10-06 §3, stories 11-15).
// Lo corre el cron con service role (se salta RLS): TODA consulta por usuario filtra por user_id.
import type { ItemType } from "@/lib/catalog/types";
import { isPetClass, type PetStage } from "@/lib/pet/classes";
import { MIN_WORKS } from "@/lib/stats/get-rated-facets";
import { chunkIds } from "@/lib/supabase/in-chunks";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { ItemRef, OwnPet, WrapUpInputs } from "../types";
import type { WrapUpWindow } from "../windows";
import { isCountableSession, type WrapUpClient } from "./core";

const DAY = 86_400_000;
type SessionRow = { session_date: string; duration_minutes: number | null };
type ClosedRow = { item_type: ItemType; item_id: string; started_on: string | null; finished_on: string; status: string };
type BattleRow = { reward: unknown; result: { outcome?: string } | null };

export function buildMonths(year: number, sessions: SessionRow[], finishedOn: string[]) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, minutes: 0, works: 0 }));
  for (const s of sessions) {
    const m = months[Number(s.session_date.slice(5, 7)) - 1];
    if (m && s.session_date.startsWith(String(year))) m.minutes += s.duration_minutes ?? 0;
  }
  for (const f of finishedOn) {
    const m = months[Number(f.slice(5, 7)) - 1];
    if (m && f.startsWith(String(year))) m.works += 1;
  }
  return months;
}

export function fastestFinish(rows: { item_type: ItemType; item_id: string; started_on: string | null; finished_on: string }[], finished: ItemRef[]) {
  const byKey = new Map(finished.map((f) => [`${f.type}:${f.id}`, f]));
  let best: { item: ItemRef; days: number } | null = null;
  for (const r of rows) {
    // Sin started_on no compite: los pases importados no lo traen (trampa #729, data-model §3).
    if (!r.started_on) continue;
    const item = byKey.get(`${r.item_type}:${r.item_id}`);
    if (!item) continue;
    const days = Math.max(1, Math.round((Date.parse(r.finished_on) - Date.parse(r.started_on)) / DAY) + 1);
    if (!best || days < best.days) best = { item, days };
  }
  return best;
}

export async function loadOwnPet(client: WrapUpClient, userId: string): Promise<OwnPet | null> {
  // pet_state guarda la etapa como last_stage (text sin CHECK): se valida al leerla.
  const { data, error } = await client.from("pet_state").select("name, class, last_stage").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data || !isPetClass(data.class)) return null;
  const stage = data.last_stage as PetStage;
  if (stage !== "acorn" && stage !== "young" && stage !== "adult" && stage !== "veteran") return null;
  return { name: data.name, petClass: data.class, stage };
}

export async function loadAnnual(client: WrapUpClient, userId: string, w: WrapUpWindow, finished: ItemRef[]): Promise<NonNullable<WrapUpInputs["annual"]>> {
  const year = Number(w.start.slice(0, 4));
  const [allSess, closedRows, added, battleRows] = await Promise.all([
    readAllRows<SessionRow & { passes: unknown }>((from, to) => client.from("progress_sessions").select("id, pass_id, session_date, duration_minutes, passes(item_type)").eq("user_id", userId)
      .gte("session_date", w.start).lt("session_date", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: (SessionRow & { passes: unknown })[] | null; error?: unknown }>),
    readAllRows<ClosedRow>((from, to) => client.from("passes").select("item_type, item_id, started_on, finished_on, status").eq("user_id", userId)
      .in("status", ["completed", "dropped"]).gte("finished_on", w.start).lt("finished_on", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: ClosedRow[] | null; error?: unknown }>),
    // created_at es timestamptz y la ventana son fechas: desfase de ≤ 2 h en los bordes (como en moments).
    client.from("passes").select("id", { count: "exact", head: true }).eq("user_id", userId)
      .gte("created_at", w.start).lt("created_at", w.endExclusive),
    readAllRows<BattleRow>((from, to) => client.from("pet_battles").select("reward, result").eq("user_id", userId).eq("kind", "adventure")
      .eq("status", "resolved").gte("resolved_at", w.start).lt("resolved_at", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: BattleRow[] | null; error?: unknown }>),
  ]);
  if (added.error) throw added.error;

  // Series: sus minutos salen de episode_watches, no de sesiones antiguas (misma regla que core).
  const sess = allSess.filter((s) => isCountableSession(s as never));
  const completed = closedRows.filter((r) => r.status === "completed");
  const months = buildMonths(year, sess, completed.map((r) => r.finished_on));
  const busiest = months.reduce((a, b) => (b.minutes > a.minutes ? b : a), months[0]);
  const longest = sess.reduce<number | null>((m, s) => (s.duration_minutes && (m == null || s.duration_minutes > m) ? s.duration_minutes : m), null);
  const won = battleRows.filter((b) => b.result?.outcome === "win");

  return {
    months,
    records: { busiestMonth: busiest && busiest.minutes > 0 ? { month: busiest.month, minutes: busiest.minutes } : null,
               fastest: fastestFinish(completed, finished), longestSessionMinutes: longest },
    creators: await loadCreators(client, finished),
    pile: { added: added.count ?? 0, removed: closedRows.length },
    petYear: { adventuresWon: won.length, loot: won.filter((b) => b.reward != null).length },
  };
}

async function loadCreators(client: WrapUpClient, finished: ItemRef[]) {
  const counts = new Map<string, number>();
  const spec = [["book", "books", "author"], ["movie", "movies", "director"], ["series", "series", "creator"]] as const;
  for (const [type, table, col] of spec) {
    const ids = [...new Set(finished.filter((f) => f.type === type).map((f) => f.id))];
    for (const chunk of chunkIds(ids)) {
      const { data, error } = await client.from(table).select(`id, ${col}`).in("id", chunk);
      if (error) throw error;
      for (const r of (data ?? []) as unknown as Record<string, string | null>[]) {
        const name = r[col]?.trim();
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return [...counts].filter(([, n]) => n >= MIN_WORKS).map(([name, works]) => ({ name, works }))
    .sort((a, b) => b.works - a.works || a.name.localeCompare(b.name, "es"));
}
