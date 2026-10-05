import { experienceRest } from "./experience-fixtures";

// Fixtures de «notas en el margen». Reutilizan experienceRest, que ya impone la
// guarda de host (solo local o biblioshare-dev) y el service role. Todo lo que se
// crea lleva el prefijo `[QA Margin] ` para poder reconocerlo y barrerlo.
export const MARGIN_QA_PREFIX = "[QA Margin] ";

const returning = { Prefer: "return=representation" };

async function insertOne<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const rows = (await (
    await experienceRest(table, { method: "POST", headers: returning, body: JSON.stringify(row) })
  ).json()) as T[];
  return rows[0];
}

/** Libro QA de 400 páginas, ya «hidratado» para que la ficha no intente traer datos externos. */
export async function marginBook(): Promise<{ id: string }> {
  const now = new Date().toISOString();
  return insertOne<{ id: string }>("books", {
    title: `${MARGIN_QA_PREFIX}Libro ${crypto.randomUUID().slice(0, 8)}`,
    author: "QA Margin",
    total_pages: 400,
    hydrated_at: now,
    editions_synced_at: now,
  });
}

/** Serie QA con T1E1..T1E4 ya emitidos (fechas pasadas) y sincronización cerrada. */
export async function marginSeries(): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const series = await insertOne<{ id: string }>("series", {
    title: `${MARGIN_QA_PREFIX}Serie ${crypto.randomUUID().slice(0, 8)}`,
    total_seasons: 1,
    total_episodes: 4,
    tmdb_status: "Ended",
    hydrated_at: now,
    episodes_synced_at: now,
  });
  const episodes = [1, 2, 3, 4].map((n) => ({
    series_id: series.id,
    season_number: 1,
    episode_number: n,
    title: `${MARGIN_QA_PREFIX}Episodio ${n}`,
    air_date: `2020-01-0${n}`,
  }));
  await experienceRest("series_episodes", { method: "POST", body: JSON.stringify(episodes) });
  return series;
}

/** `followerId` sigue a `followeeId` (aceptado). */
export async function follow(followerId: string, followeeId: string) {
  await experienceRest("follows", {
    method: "POST",
    body: JSON.stringify({ follower_id: followerId, followee_id: followeeId, status: "accepted" }),
  });
}

/**
 * Inserta una nota COMO LA AUTORA (JWT de su sesión, rol authenticated) y SIN
 * RETURNING. Dos motivos, ambos hallazgos de producto (ver informe de la Tarea 10):
 * con service_role la CHECK falla con «permission denied for function
 * margin_anchor_valid», y con `Prefer: return=representation` (el
 * `.select("id").single()` de createMarginNote) la política de select no ve la
 * fila recién insertada y el insert entero se rechaza por RLS.
 */
async function insertNoteAs(author: { email: string; password: string }, row: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (new URL(url).hostname !== "tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("Actor REST requires dev");
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: author.email, password: author.password }),
  });
  if (!auth.ok) throw new Error(`Fixture authentication ${auth.status}`);
  const token = (await auth.json()).access_token as string;
  const res = await fetch(`${url}/rest/v1/margin_notes`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ audience: "followers", ...row }),
  });
  if (!res.ok) throw new Error(`Margin note insert ${res.status}: ${await res.text()}`);
}

/** Nota de libro con ancla de proporción, igual que la construye buildMarginAnchor. */
export async function insertBookNote(
  author: { id: string; email: string; password: string },
  bookId: string,
  page: number,
  pages: number,
  chapter: string,
  body: string,
) {
  await insertNoteAs(author, {
    author_id: author.id,
    item_type: "book",
    item_id: bookId,
    anchor: { kind: "ratio", ratio: Math.round((page / pages) * 1e6) / 1e6, page, pages },
    chapter_label: chapter,
    body,
  });
}

/** Nota de episodio (la ficha no fija episodio; lo hace el panel de episodios). */
export async function insertEpisodeNote(
  author: { id: string; email: string; password: string },
  seriesId: string,
  season: number,
  episode: number,
  body: string,
) {
  await insertNoteAs(author, {
    author_id: author.id,
    item_type: "series",
    item_id: seriesId,
    anchor: { kind: "episode", season, episode },
    body,
  });
}

/** Pase activo de serie (la ficha solo enseña «Mi registro» si la obra está seguida). */
export async function startSeriesPass(userId: string, seriesId: string) {
  await experienceRest("passes", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, item_type: "series", item_id: seriesId, status: "in_progress", is_active: true }),
  });
}

/**
 * Progreso del lector por REST: crea o actualiza su pase. El trigger
 * `margin_open_on_pass` se dispara igual que con una sesión real.
 */
export async function setReaderProgress(
  userId: string,
  bookId: string,
  patch: { page?: number; status?: "in_progress" | "completed" },
) {
  const status = patch.status ?? "in_progress";
  const position = patch.page != null ? { page: patch.page } : {};
  const existing = (await (
    await experienceRest(`passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${bookId}&select=id`)
  ).json()) as { id: string }[];
  if (existing.length) {
    await experienceRest(`passes?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, position }),
    });
  } else {
    await experienceRest("passes", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        item_type: "book",
        item_id: bookId,
        status,
        position,
        is_active: true,
      }),
    });
  }
}

export async function watchEpisode(userId: string, seriesId: string, season: number, episode: number) {
  await experienceRest("episode_watches", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, series_id: seriesId, season_number: season, episode_number: episode }),
  });
}

export async function encountersForReader(readerId: string) {
  return (await (
    await experienceRest(`margin_note_encounters?reader_id=eq.${readerId}&select=id,seen_at`)
  ).json()) as { id: string; seen_at: string | null }[];
}

export async function resetEncountersUnseen(readerId: string) {
  await experienceRest(`margin_note_encounters?reader_id=eq.${readerId}`, {
    method: "PATCH",
    body: JSON.stringify({ seen_at: null }),
  });
}

/**
 * Barre notas (los encuentros caen en cascada), pases, visionados, episodios,
 * posts anclados y por último las obras QA. Solo toca los ids que se le pasan.
 */
export async function clearMarginFixtures(bookIds: string[], seriesIds: string[] = []) {
  const all = [...bookIds, ...seriesIds];
  if (!all.length) return;
  const ids = all.join(",");
  const like = `like.${encodeURIComponent(MARGIN_QA_PREFIX)}*`;
  await experienceRest(`margin_notes?item_id=in.(${ids})`, { method: "DELETE" });
  await experienceRest(`passes?item_id=in.(${ids})`, { method: "DELETE" });
  await experienceRest(`posts?anchor_id=in.(${ids})`, { method: "DELETE" });
  if (seriesIds.length) {
    const s = seriesIds.join(",");
    await experienceRest(`episode_watches?series_id=in.(${s})`, { method: "DELETE" });
    await experienceRest(`series_episodes?series_id=in.(${s})`, { method: "DELETE" });
    await experienceRest(`series?id=in.(${s})&title=${like}`, { method: "DELETE" });
  }
  if (bookIds.length) {
    await experienceRest(`books?id=in.(${bookIds.join(",")})&title=${like}`, { method: "DELETE" });
  }
}
