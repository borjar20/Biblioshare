import "server-only";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { CulturalRelease, ReleaseSourceStatus } from "./types";
import { groupReleaseWorks, releaseCatalogId, type ReleaseFilters, type ReleaseWork } from "./presentation";
import { authenticatedReleaseClient, chunks, readAllRows, requireReleaseAdmin, type ReleaseClient } from "./data";

export type { ReleaseFilters, ReleaseWork } from "./presentation";

async function readReleases(supabase: ReleaseClient): Promise<CulturalRelease[]> {
  return readAllRows(() => supabase.from("cultural_releases").select("*").in("status", ["published", "cancelled"]).order("id"));
}

/** Resolve already-existing catalog identities; a read never registers a new work. */
async function linkExistingCatalog(supabase: ReleaseClient, rows: CulturalRelease[]): Promise<CulturalRelease[]> {
  const byMovie = new Map<number, string>();
  const bySeries = new Map<number, string>();
  for (const kind of ["movie", "series"] as const) {
    const ids = [...new Set(rows.filter((row) => row.item_type === kind && row.tmdb_id).map((row) => row.tmdb_id!))];
    for (const group of chunks(ids)) {
      const { data, error } = await supabase.from(kind === "movie" ? "movies" : "series").select("id, tmdb_id").in("tmdb_id", group);
      if (error) throw error;
      const map = kind === "movie" ? byMovie : bySeries;
      for (const row of data ?? []) if (row.tmdb_id !== null) map.set(row.tmdb_id, row.id);
    }
  }
  return rows.map((row) => ({ ...row,
    movie_id: row.item_type === "movie" ? row.movie_id ?? (row.tmdb_id ? byMovie.get(row.tmdb_id) ?? null : null) : null,
    series_id: row.item_type === "series" ? row.series_id ?? (row.tmdb_id ? bySeries.get(row.tmdb_id) ?? null : null) : null,
  }));
}

export async function getPublicReleases(filters: ReleaseFilters = {}): Promise<ReleaseWork[]> {
  const supabase = createPublicClient();
  return groupReleaseWorks(await linkExistingCatalog(supabase, await readReleases(supabase)), filters);
}

export async function getReleaseSourceStatus(): Promise<ReleaseSourceStatus[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("release_sync_state").select("source, last_attempt_at, last_success_at, last_error").order("source");
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, last_error: row.last_error ? "source_review_failed" : null }));
}

export async function getReleaseById(id: string): Promise<CulturalRelease | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("cultural_releases").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await linkExistingCatalog(supabase, [data]))[0];
}

async function personalInterestKeys(supabase: ReleaseClient, userId: string): Promise<Set<string>> {
  const [passes, follows] = await Promise.all([
    readAllRows(() => supabase.from("passes").select("id, item_type, item_id, status").eq("user_id", userId).eq("is_active", true).order("id")),
    readAllRows(() => supabase.from("saga_follows").select("saga_id").eq("user_id", userId).order("saga_id")),
  ]);
  const keys = new Set(passes.filter((pass) => pass.status === "planned" || (pass.item_type === "series" && pass.status !== "dropped"))
    .map((pass) => `${pass.item_type}:${pass.item_id}`));
  const sagaIds = new Set(follows.map((follow) => follow.saga_id));
  let frontier = [...sagaIds];
  // The domain caps saga depth at four. Paginate each frontier, avoiding response and URL caps.
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: string[] = [];
    for (const group of chunks(frontier)) {
      const children = await readAllRows(() => supabase.from("sagas").select("id").in("parent_saga_id", group).order("id"));
      for (const child of children) if (!sagaIds.has(child.id)) { sagaIds.add(child.id); next.push(child.id); }
    }
    frontier = next;
  }
  for (const group of chunks([...sagaIds])) {
    const members = await readAllRows(() => supabase.from("saga_items").select("id, item_type, item_id").in("saga_id", group).order("id"));
    for (const member of members) keys.add(`${member.item_type}:${member.item_id}`);
  }
  return keys;
}

export async function getPersonalReleases(userId: string, filters: ReleaseFilters = {}): Promise<ReleaseWork[]> {
  const supabase = await authenticatedReleaseClient(userId);
  const [rows, keys, subscriptions] = await Promise.all([
    readReleases(supabase).then((rows) => linkExistingCatalog(supabase, rows)), personalInterestKeys(supabase, userId),
    readAllRows(() => supabase.from("release_subscriptions").select("release_id").eq("user_id", userId).eq("active", true).order("release_id")),
  ]);
  const subscriptionIds = new Set(subscriptions.map((row) => row.release_id));
  const interested = rows.filter((row) => subscriptionIds.has(row.id) || (releaseCatalogId(row) && keys.has(`${row.item_type}:${releaseCatalogId(row)}`)));
  const result = groupReleaseWorks(interested, filters);
  // Subscribed cancellations and past announcements stay manageable until consent is withdrawn.
  const included = new Set(result.flatMap((work) => work.releases.map((row) => row.id)));
  const historical = interested.filter((row) => subscriptionIds.has(row.id) && !included.has(row.id));
  if (historical.length) {
    const prior = groupReleaseWorks(historical, { ...filters, from: "1400-01-01", to: undefined, limit: undefined });
    for (const work of prior) {
      const existing = result.find((entry) => entry.workKey === work.workKey);
      if (existing) existing.releases.push(...work.releases); else result.push(work);
    }
  }
  return result;
}

export async function getReleaseUserState(userId: string, releaseIds: string[]): Promise<Record<string, { subscribed: boolean; inLibrary: boolean }>> {
  const supabase = await authenticatedReleaseClient(userId);
  const state: Record<string, { subscribed: boolean; inLibrary: boolean }> = {};
  const passRows = await readAllRows(() => supabase.from("passes").select("id, item_type, item_id").eq("user_id", userId).eq("is_active", true).order("id"));
  const passes = new Set(passRows.map((row) => `${row.item_type}:${row.item_id}`));
  for (const group of chunks([...new Set(releaseIds)])) {
    const [releases, subscriptions] = await Promise.all([
      readAllRows(() => supabase.from("cultural_releases").select("*").in("id", group).order("id")),
      readAllRows(() => supabase.from("release_subscriptions").select("release_id, active").eq("user_id", userId).in("release_id", group).order("release_id")),
    ]);
    const active = new Set(subscriptions.filter((row) => row.active).map((row) => row.release_id));
    for (const row of await linkExistingCatalog(supabase, releases)) {
      state[row.id] = { subscribed: active.has(row.id), inLibrary: !!releaseCatalogId(row) && passes.has(`${row.item_type}:${releaseCatalogId(row)}`) };
    }
  }
  return state;
}

export async function getAdminReleases(): Promise<CulturalRelease[]> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("auth");
  await requireReleaseAdmin(supabase, user.id);
  return readAllRows(() => supabase.from("cultural_releases").select("*").eq("source", "editorial").order("updated_at", { ascending: false }).order("id"));
}
