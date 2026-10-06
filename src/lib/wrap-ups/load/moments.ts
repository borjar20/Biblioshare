// Momentos y compañía del wrap-up (spec 2026-10-06 §3 bloques C y D, §4 privacidad).
// Solo contenido PÚBLICO y sin spoiler: lo que entra aquí puede acabar en una imagen.
// Lo corre el cron con service role (se salta RLS): TODA consulta filtra por su columna de dueño.
import type { ItemType } from "@/lib/catalog/types";
import { addDaysISO } from "@/lib/stats/dates";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { ItemRef, WrapUpInputs } from "../types";
import type { WrapUpWindow } from "../windows";
import { madridToday } from "../windows";
import type { WrapUpClient } from "./core";

export type MomentFacts = Pick<WrapUpInputs, "bestRated" | "phrase" | "experience" | "together" | "experienceDays">;
export type RatedPassRow = {
  item_type: ItemType; item_id: string; rating: number; review: string | null;
  is_public: boolean; review_is_spoiler: boolean; finished_on?: string | null;
};
export type PhraseCandidate = { source: "note" | "quote" | "margin"; body: string; createdAt: string; item: ItemRef | null; isFavorite: boolean };

const MAX_PHRASE = 280;
const RANK: Record<PhraseCandidate["source"], number> = { quote: 2, note: 1, margin: 0 };

export function pickBestRated(rows: RatedPassRow[], finished: ItemRef[]): MomentFacts["bestRated"] {
  const byKey = new Map(finished.map((f) => [`${f.type}:${f.id}`, f]));
  let best: { row: RatedPassRow; item: ItemRef } | null = null;
  for (const row of rows) {
    const item = byKey.get(`${row.item_type}:${row.item_id}`);
    if (!item) continue;
    // Mayor nota; empate → la terminada más tarde.
    const later = best !== null && row.rating === best.row.rating && (row.finished_on ?? "") > (best.row.finished_on ?? "");
    if (!best || row.rating > best.row.rating || later) best = { row, item };
  }
  if (!best) return null;
  const review = best.row.is_public && !best.row.review_is_spoiler ? best.row.review : null;
  return { item: best.item, rating: best.row.rating, review };
}

export function pickPhrase(cands: PhraseCandidate[]): MomentFacts["phrase"] {
  const sorted = [...cands].sort((x, y) =>
    Number(y.isFavorite) - Number(x.isFavorite) || RANK[y.source] - RANK[x.source] || y.createdAt.localeCompare(x.createdAt));
  const top = sorted[0];
  if (!top) return null;
  const body = top.body.length > MAX_PHRASE ? `${top.body.slice(0, MAX_PHRASE - 1)}…` : top.body;
  return { source: top.source, body, item: top.item };
}

type NoteRow = { kind: string; body: string; created_at: string; is_favorite: boolean; item_type: ItemType; item_id: string };
type MarginRow = { body: string; created_at: string; item_type: ItemType; item_id: string };
type ExperienceRow = { id: string; title: string; starts_on: string | null; ends_on: string | null };

export async function loadMoments(client: WrapUpClient, userId: string, w: WrapUpWindow, finished: ItemRef[]): Promise<MomentFacts> {
  const [rated, notes, margins, experiencesQ, joints, clubPosts] = await Promise.all([
    readAllRows<RatedPassRow>((from, to) => client.from("passes")
      .select("item_type, item_id, rating, review, is_public, review_is_spoiler, finished_on")
      .eq("user_id", userId).eq("status", "completed").not("rating", "is", null)
      .gte("finished_on", w.start).lt("finished_on", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: RatedPassRow[] | null; error?: unknown }>),
    // created_at es timestamptz y la ventana son fechas: se compara contra medianoche UTC
    // (desfase máximo de 2 h en los bordes, aceptable para escoger una frase).
    readAllRows<NoteRow>((from, to) => client.from("notes")
      .select("kind, body, created_at, is_favorite, item_type, item_id")
      .eq("user_id", userId).eq("is_public", true).eq("is_spoiler", false).in("kind", ["note", "quote"])
      .gte("created_at", w.start).lt("created_at", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: NoteRow[] | null; error?: unknown }>),
    // Mismo desfase de ≤ 2 h en los bordes que en notes.
    readAllRows<MarginRow>((from, to) => client.from("margin_notes")
      .select("body, created_at, item_type, item_id")
      .eq("author_id", userId).eq("audience", "followers").eq("is_spoiler", false)
      .gte("created_at", w.start).lt("created_at", w.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: MarginRow[] | null; error?: unknown }>),
    // Experiencias: pocas por usuario y ventana (no pasan del tope de filas).
    client.from("experiences").select("id, title, starts_on, ends_on")
      .eq("creator_id", userId).eq("audience", "profile").eq("state", "lived")
      .gte("starts_on", w.start).lt("starts_on", w.endExclusive).order("starts_on", { ascending: false }),
    readAllRows<{ viewing_id: string }>((from, to) => client.from("joint_viewing_members")
      .select("viewing_id, joint_viewings!inner(watched_on)")
      .eq("user_id", userId).eq("status", "accepted")
      .gte("joint_viewings.watched_on", w.start).lt("joint_viewings.watched_on", w.endExclusive)
      .order("viewing_id").range(from, to) as unknown as PromiseLike<{ data: { viewing_id: string }[] | null; error?: unknown }>),
    readAllRows<{ created_at: string }>((from, to) => client.from("club_posts").select("created_at")
      .eq("author_id", userId)
      .gte("created_at", w.start).lt("created_at", w.endExclusive)
      .order("id").range(from, to)),
  ]);
  if (experiencesQ.error) throw experiencesQ.error;

  const byKey = new Map(finished.map((f) => [`${f.type}:${f.id}`, f]));
  const itemOf = (t: ItemType, id: string) => byKey.get(`${t}:${id}`) ?? null;
  const cands: PhraseCandidate[] = [
    ...notes.map((n) => ({ source: n.kind === "quote" ? "quote" as const : "note" as const, body: n.body, createdAt: n.created_at, item: itemOf(n.item_type, n.item_id), isFavorite: n.is_favorite })),
    ...margins.map((m) => ({ source: "margin" as const, body: m.body, createdAt: m.created_at, item: itemOf(m.item_type, m.item_id), isFavorite: false })),
  ];

  const xp = (experiencesQ.data ?? []) as ExperienceRow[];
  const xpDays = new Set<string>();
  for (const e of xp) {
    if (!e.starts_on) continue;
    // Días entre starts_on y coalesce(ends_on, starts_on), recortados a la ventana.
    const upto = !e.ends_on ? e.starts_on : e.ends_on < w.end ? e.ends_on : w.end;
    for (let d = e.starts_on < w.start ? w.start : e.starts_on; d <= upto; d = addDaysISO(d, 1)) xpDays.add(d);
  }
  const clubDays = new Set(clubPosts.map((p) => madridToday(new Date(p.created_at))));

  return {
    bestRated: pickBestRated(rated, finished),
    phrase: pickPhrase(cands),
    experience: xp[0] ? { experienceId: xp[0].id, title: xp[0].title, date: xp[0].starts_on } : null,
    together: { jointViewings: joints.length, clubDays: clubDays.size },
    experienceDays: xpDays.size,
  };
}
