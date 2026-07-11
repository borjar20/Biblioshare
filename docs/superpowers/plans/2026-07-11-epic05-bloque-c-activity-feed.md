# EPIC-05 Bloque C — Feed de actividad personal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Siguiendo" tab to the home page showing recent activity (finished/rated/reviewed/progressed/watched-episode/added-to-library) from accepted follows, with inline reactions/comments on review-bearing events, item-type + "solo reseñas" filters, and cursor-based "Cargar más" pagination.

**Architecture:** On-read fan-out (SD-1, no new schema) — a single domain function queries four existing source tables (`library_entries`, `progress_sessions`, `diary_entries`, `episode_watches`) filtered to accepted follows, normalizes them to one `FeedEvent` type, merge-sorts by date, and reuses Bloque B's `getInteractionSummary`/`ReviewInteractions` for the events that have a real reaction/comment target. Filters are server-side query params (matching the existing `library-filters.tsx` pattern); pagination is a client-accumulated list fed by a data-returning server action (a new pattern for this codebase — justified because feed pagination is genuinely open-ended, unlike Bloque B's capped comment prefetch).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres/Auth/RLS, next-intl, TypeScript, Tailwind.

## Global Constraints

- No new database schema, no migration, no RLS changes — the feed relies entirely on the already-verified RLS of its four source tables (via `can_view_profile`/`can_view_target`), per SD-1's explicit decision.
- Verb derivation ("most specific wins"), applied symmetrically to `diary_entries` and `episode_watches`: `reviewed` (has `review` text) > `rated` (has `rating`, no review) > floor verb (`finished` for diary, `watchedEpisode` for episodes). `library_entries` new rows are always `added`; `progress_sessions` rows are always `progressed`.
- Reactions/comments (via `ReviewInteractions`) are eligible on *any* `diary_entries`- or `episode_watches`-sourced event, regardless of which of the three sub-verbs it resolved to — not just `reviewed` events. Only `added` and `progressed` events have no valid target.
- Filters (`itemType`, `reviewsOnly`) are server-side query params (`?tab=following&itemType=book&reviewsOnly=1`) applied as SQL conditions per source query — not client-side predicates. Changing a filter is a fresh navigation that resets the accumulated "Cargar más" buffer.
- Pagination page size: 20. "Cargar más" button, not infinite scroll.
- Run `npx tsc --noEmit` and `npx eslint <touched files>` after every task that touches `.ts`/`.tsx` files — both must stay clean (pre-existing unrelated warnings in `android/`, `src/app/importar/actions.ts`, `src/components/edit-profile-form.tsx` are fine to leave).
- Windows/PowerShell environment — use the Bash tool (Git Bash) for `grep`/`node`/`curl`-style commands, not native PowerShell cmdlets.
- Working directory for this plan is the git worktree at `.claude/worktrees/epic05-bloque-b` (branch `worktree-epic05-bloque-b`) — the same worktree Bloque B was built in, now merged into `main` and continuing with Bloque C on the same branch.

---

### Task 1: Domain — `src/lib/social/feed.ts`

**Files:**
- Create: `src/lib/social/feed.ts`

**Interfaces:**
- Consumes: `getInteractionSummary(supabase, targetType, targetIds)` from `src/lib/social/interactions.ts` (Bloque B); `InteractionComment` type from the same file; `ItemType` from `src/lib/catalog/types`.
- Produces: `type FeedVerb`, `type FeedEvent`, `type FeedPage = { events: FeedEvent[]; nextCursor: string | null }`, `type FeedOptions = { cursor?: string; pageSize?: number; itemType?: ItemType; reviewsOnly?: boolean }`, `function getFeed(supabase, viewerId: string, options?: FeedOptions): Promise<FeedPage>`. Consumed by Task 2 (`feed-actions.ts`) and Task 7 (`page.tsx`).

- [ ] **Step 1: Write `src/lib/social/feed.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getInteractionSummary, type InteractionComment } from "./interactions";

// Feed de actividad personal (EPIC-05, Bloque C, SD-1). On-read fan-out sobre
// cuatro tablas fuente ya existentes — sin tabla nueva. La RLS de cada fuente
// (can_view_profile) ya resuelve la visibilidad "seguidor aceptado"; el feed
// no necesita lógica de visibilidad propia, solo filtra por seguidos.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FeedVerb =
  | "added"
  | "progressed"
  | "finished"
  | "rated"
  | "reviewed"
  | "watchedEpisode";

export type FeedEvent = {
  id: string; // `${sourceTable}:${rowId}`
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  verb: FeedVerb;
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  eventDate: string;
  rating: number | null;
  reviewExcerpt: string | null;
  episode: { season: number; episode: number; title: string | null } | null;
  progress: { durationMinutes: number | null; note: string | null } | null;
  interactionTarget: { targetType: "diary_entry" | "episode_watch"; targetId: string } | null;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

export type FeedPage = {
  events: FeedEvent[];
  nextCursor: string | null;
};

export type FeedOptions = {
  cursor?: string;
  pageSize?: number;
  itemType?: ItemType;
  reviewsOnly?: boolean;
};

const DEFAULT_PAGE_SIZE = 20;
const REVIEW_EXCERPT_LENGTH = 200;

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= REVIEW_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, REVIEW_EXCERPT_LENGTH).trimEnd() + "…";
}

function verbForReviewable(rating: number | null, review: string | null, floor: FeedVerb): FeedVerb {
  if (review) return "reviewed";
  if (rating != null) return "rated";
  return floor;
}

export async function getFeed(
  supabase: SupabaseServerClient,
  viewerId: string,
  options: FeedOptions = {},
): Promise<FeedPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const { data: followRows, error: followError } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", viewerId)
    .eq("status", "accepted");
  if (followError) throw followError;

  const followedIds = (followRows ?? []).map((f) => f.followee_id);
  if (followedIds.length === 0) return { events: [], nextCursor: null };

  // Si se filtra por tipo de ítem, resolvemos primero qué library_entries de
  // los seguidos son de ese tipo — diary_entries/progress_sessions no tienen
  // item_type propio, solo llegan a él vía library_entry_id.
  let libraryEntryIdsForType: string[] | null = null;
  if (options.itemType) {
    const { data: typedEntries, error: typedError } = await supabase
      .from("library_entries")
      .select("id")
      .in("user_id", followedIds)
      .eq("item_type", options.itemType);
    if (typedError) throw typedError;
    libraryEntryIdsForType = (typedEntries ?? []).map((e) => e.id);
  }
  // Si el filtro de tipo no dejó ningún library_entry, diary/progress no
  // pueden aportar nada — se evita el .in([]) ambiguo saltándose la query.
  const typeFilterExcludesAll =
    options.itemType !== undefined && (libraryEntryIdsForType?.length ?? 0) === 0;

  const includeAdded = !options.reviewsOnly && !typeFilterExcludesAll;
  const includeProgressed = !options.reviewsOnly && !typeFilterExcludesAll;
  const includeDiary = !typeFilterExcludesAll;
  const includeEpisodes =
    (options.itemType === undefined || options.itemType === "series") &&
    !typeFilterExcludesAll;

  const [addedResult, progressedResult, diaryResult, episodeResult] = await Promise.all([
    includeAdded
      ? (() => {
          let q = supabase
            .from("library_entries")
            .select("id, user_id, item_type, item_id, created_at")
            .in("user_id", followedIds)
            .order("created_at", { ascending: false })
            .limit(pageSize);
          if (options.itemType) q = q.eq("item_type", options.itemType);
          if (options.cursor) q = q.lt("created_at", options.cursor);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeProgressed
      ? (() => {
          let q = supabase
            .from("progress_sessions")
            .select("id, user_id, library_entry_id, session_date, duration_minutes, note")
            .in("user_id", followedIds)
            .order("session_date", { ascending: false })
            .limit(pageSize);
          if (libraryEntryIdsForType) q = q.in("library_entry_id", libraryEntryIdsForType);
          if (options.cursor) q = q.lt("session_date", options.cursor);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeDiary
      ? (() => {
          let q = supabase
            .from("diary_entries")
            .select("id, user_id, library_entry_id, finished_on, rating, review")
            .in("user_id", followedIds)
            .order("finished_on", { ascending: false })
            .limit(pageSize);
          if (libraryEntryIdsForType) q = q.in("library_entry_id", libraryEntryIdsForType);
          if (options.reviewsOnly) q = q.not("review", "is", null);
          if (options.cursor) q = q.lt("finished_on", options.cursor);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeEpisodes
      ? (() => {
          let q = supabase
            .from("episode_watches")
            .select(
              "id, user_id, series_id, season_number, episode_number, rating, review, watched_on",
            )
            .in("user_id", followedIds)
            .order("watched_on", { ascending: false })
            .limit(pageSize);
          if (options.reviewsOnly) q = q.not("review", "is", null);
          if (options.cursor) q = q.lt("watched_on", options.cursor);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (addedResult.error) throw addedResult.error;
  if (progressedResult.error) throw progressedResult.error;
  if (diaryResult.error) throw diaryResult.error;
  if (episodeResult.error) throw episodeResult.error;

  const addedRows = addedResult.data ?? [];
  const progressedRows = progressedResult.data ?? [];
  const diaryRows = diaryResult.data ?? [];
  const episodeRows = episodeResult.data ?? [];

  // "Se agotaron todas las fuentes" se mide sobre el fetch bruto de cada
  // query de arriba (antes del merge/corte de más abajo), no sobre cuántas
  // filas de cada fuente sobreviven al corte a pageSize.
  const allExhausted =
    addedRows.length < pageSize &&
    progressedRows.length < pageSize &&
    diaryRows.length < pageSize &&
    episodeRows.length < pageSize;

  // library_entries de progress_sessions/diary_entries → item_type/item_id.
  const libraryEntryIds = [
    ...new Set([
      ...progressedRows.map((r) => r.library_entry_id),
      ...diaryRows.map((r) => r.library_entry_id),
    ]),
  ];
  const { data: libraryEntries, error: libError } = libraryEntryIds.length
    ? await supabase
        .from("library_entries")
        .select("id, item_type, item_id")
        .in("id", libraryEntryIds)
    : { data: [] as { id: string; item_type: ItemType; item_id: string }[], error: null };
  if (libError) throw libError;
  const itemByLibraryEntry = new Map(
    (libraryEntries ?? []).map((e) => [
      e.id,
      { itemType: e.item_type as ItemType, itemId: e.item_id },
    ]),
  );

  // Catálogo (título/portada) por tipo, mismo patrón batch que
  // get-library-items.ts.
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of addedRows) idsByType[r.item_type].add(r.item_id);
  for (const r of progressedRows) {
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (it) idsByType[it.itemType].add(it.itemId);
  }
  for (const r of diaryRows) {
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (it) idsByType[it.itemType].add(it.itemId);
  }
  for (const r of episodeRows) idsByType.series.add(r.series_id);

  const [books, movies, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title, cover_url").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    idsByType.movie.size
      ? supabase.from("movies").select("id, title, cover_url").in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    idsByType.series.size
      ? supabase.from("series").select("id, title, cover_url").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
  ]);
  const catalogByKey = new Map<string, { title: string; coverUrl: string | null }>();
  for (const r of books.data ?? [])
    catalogByKey.set(`book:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of movies.data ?? [])
    catalogByKey.set(`movie:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of series.data ?? [])
    catalogByKey.set(`series:${r.id}`, { title: r.title, coverUrl: r.cover_url });

  // Título de episodio, best-effort (si no está en series_episodes aún, se
  // omite sin romper el evento).
  const episodeSeriesIds = [...new Set(episodeRows.map((r) => r.series_id))];
  const { data: episodeTitles } = episodeSeriesIds.length
    ? await supabase
        .from("series_episodes")
        .select("series_id, season_number, episode_number, title")
        .in("series_id", episodeSeriesIds)
    : { data: [] as { series_id: string; season_number: number; episode_number: number; title: string | null }[] };
  const titleByEpisode = new Map(
    (episodeTitles ?? []).map((e) => [
      `${e.series_id}:${e.season_number}:${e.episode_number}`,
      e.title,
    ]),
  );

  // Identidades de actor.
  const actorIds = [
    ...new Set([
      ...addedRows.map((r) => r.user_id),
      ...progressedRows.map((r) => r.user_id),
      ...diaryRows.map((r) => r.user_id),
      ...episodeRows.map((r) => r.user_id),
    ]),
  ];
  const { data: actors } = actorIds.length
    ? await supabase
        .from("profile_identities")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", actorIds)
    : { data: [] as { user_id: string | null; username: string | null; display_name: string | null; avatar_url: string | null }[] };
  const actorById = new Map(
    (actors ?? [])
      .filter(
        (a): a is typeof a & { user_id: string; username: string } =>
          a.user_id != null && a.username != null,
      )
      .map((a) => [a.user_id, a]),
  );

  const events: FeedEvent[] = [];

  for (const r of addedRows) {
    const actor = actorById.get(r.user_id);
    const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
    if (!actor || !catalog) continue;
    events.push({
      id: `library_entries:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "added",
      itemType: r.item_type,
      itemId: r.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      eventDate: r.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of progressedRows) {
    const actor = actorById.get(r.user_id);
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (!actor || !it) continue;
    const catalog = catalogByKey.get(`${it.itemType}:${it.itemId}`);
    if (!catalog) continue;
    events.push({
      id: `progress_sessions:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "progressed",
      itemType: it.itemType,
      itemId: it.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      eventDate: r.session_date,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: { durationMinutes: r.duration_minutes, note: r.note },
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of diaryRows) {
    const actor = actorById.get(r.user_id);
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (!actor || !it) continue;
    const catalog = catalogByKey.get(`${it.itemType}:${it.itemId}`);
    if (!catalog) continue;
    events.push({
      id: `diary_entries:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(r.rating, r.review, "finished"),
      itemType: it.itemType,
      itemId: it.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      eventDate: r.finished_on,
      rating: r.rating,
      reviewExcerpt: excerpt(r.review),
      episode: null,
      progress: null,
      interactionTarget: { targetType: "diary_entry", targetId: r.id },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of episodeRows) {
    const actor = actorById.get(r.user_id);
    const catalog = catalogByKey.get(`series:${r.series_id}`);
    if (!actor || !catalog) continue;
    events.push({
      id: `episode_watches:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(r.rating, r.review, "watchedEpisode"),
      itemType: "series",
      itemId: r.series_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      eventDate: r.watched_on,
      rating: r.rating,
      reviewExcerpt: excerpt(r.review),
      episode: {
        season: r.season_number,
        episode: r.episode_number,
        title:
          titleByEpisode.get(`${r.series_id}:${r.season_number}:${r.episode_number}`) ?? null,
      },
      progress: null,
      interactionTarget: { targetType: "episode_watch", targetId: r.id },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  events.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0));
  const page = events.slice(0, pageSize);

  // Interacciones de Bloque B, batch por tipo, solo para los eventos de esta
  // página que tienen target real.
  const diaryTargetIds = page
    .filter((e) => e.interactionTarget?.targetType === "diary_entry")
    .map((e) => e.interactionTarget!.targetId);
  const episodeTargetIds = page
    .filter((e) => e.interactionTarget?.targetType === "episode_watch")
    .map((e) => e.interactionTarget!.targetId);
  const [diarySummaries, episodeSummaries] = await Promise.all([
    getInteractionSummary(supabase, "diary_entry", diaryTargetIds),
    getInteractionSummary(supabase, "episode_watch", episodeTargetIds),
  ]);
  for (const e of page) {
    if (!e.interactionTarget) continue;
    const summaries =
      e.interactionTarget.targetType === "diary_entry" ? diarySummaries : episodeSummaries;
    const s = summaries.get(e.interactionTarget.targetId);
    if (s) {
      e.reactionCount = s.reactionCount;
      e.viewerReacted = s.viewerReacted;
      e.commentCount = s.commentCount;
      e.comments = s.comments;
    }
  }

  const nextCursor = allExhausted
    ? null
    : page.length > 0
      ? page[page.length - 1].eventDate
      : null;

  return { events: page, nextCursor };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/feed.ts
git commit -m "feat: add getFeed domain function for EPIC-05 Bloque C (SD-1)"
```

---

### Task 2: `src/lib/social/feed-actions.ts` — pagination server action

**Files:**
- Create: `src/lib/social/feed-actions.ts`

**Interfaces:**
- Consumes: `getFeed`, `type FeedPage` from `src/lib/social/feed.ts` (Task 1).
- Produces: `"use server"` function `loadMoreFeed(cursor: string | null, itemType?: ItemType, reviewsOnly?: boolean): Promise<FeedPage>`. Consumed by Task 6 (`FeedList`).

- [ ] **Step 1: Write `src/lib/social/feed-actions.ts`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getFeed, type FeedPage } from "./feed";
import type { ItemType } from "@/lib/catalog/types";

// Única mutación... en realidad una LECTURA vía server action, no una
// mutación — necesario porque la paginación del feed es abierta (a
// diferencia del prefetch capado de comentarios de Bloque B, que evitó
// deliberadamente este patrón). "Cargar más" en el cliente llama a esto con
// el cursor acumulado.
export async function loadMoreFeed(
  cursor: string | null,
  itemType?: ItemType,
  reviewsOnly?: boolean,
): Promise<FeedPage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { events: [], nextCursor: null };

  return getFeed(supabase, user.id, {
    cursor: cursor ?? undefined,
    itemType,
    reviewsOnly,
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/feed-actions.ts
git commit -m "feat: add loadMoreFeed server action for feed pagination"
```

---

### Task 3: `HomeTabs` component + i18n tab labels

**Files:**
- Create: `src/components/home/home-tabs.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `<HomeTabs labels={{ panel, following }} panel={ReactNode} following={ReactNode} />`. Consumed by Task 7 (`page.tsx`).

- [ ] **Step 1: Write `src/components/home/home-tabs.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TabId = "panel" | "following";
const VALID_TABS: readonly string[] = ["panel", "following"];
const ORDER: TabId[] = ["panel", "following"];

// Tab switcher del home (EPIC-05, Bloque C). Mismo mecanismo ?tab= que
// item-detail-tabs.tsx (Bloque B): slots pre-renderizados en el servidor,
// el cliente solo elige cuál mostrar y sincroniza la URL. Al volver a
// "panel" se limpian los filtros del feed (itemType/reviewsOnly) — no tiene
// sentido arrastrarlos fuera de la pestaña Siguiendo.
export function HomeTabs({
  labels,
  panel,
  following,
}: {
  labels: Record<TabId, string>;
  panel: ReactNode;
  following: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: TabId =
    urlTab && VALID_TABS.includes(urlTab) ? (urlTab as TabId) : "panel";
  const [tab, setTab] = useState<TabId>(initialTab);
  const slots: Record<TabId, ReactNode> = { panel, following };

  function selectTab(id: TabId) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "panel") {
      params.delete("tab");
      params.delete("itemType");
      params.delete("reviewsOnly");
    } else {
      params.set("tab", id);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 border-b border-border">
        {ORDER.map((id) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`-mb-px border-b-2 px-1 pb-3 font-mono text-xs tracking-wider uppercase transition-colors ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>
      {slots[tab]}
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys**

In `messages/es.json`, inside the `"home"` object, add a `"tabs"` sub-object (check the object's existing keys first — insert alongside `"welcome"`/`"tagline"`/`"cta"` without disturbing them):

```json
    "tabs": {
      "panel": "Panel",
      "following": "Siguiendo"
    },
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/home/home-tabs.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/home-tabs.tsx messages/es.json
git commit -m "feat: add HomeTabs component with ?tab= deep-linking"
```

---

### Task 4: `FeedCard` component

**Files:**
- Create: `src/components/social/feed-card.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `FeedEvent` type from `src/lib/social/feed.ts` (Task 1); `ReviewInteractions` from `src/components/social/review-interactions.tsx` (Bloque B); `UserAvatar` from `src/components/social/user-avatar.tsx`; `RatingDots` from `src/components/ui/rating-dots.tsx`; `MEDIA_ACCENT` from `src/lib/catalog/media-accent.ts`; `itemHref` from `src/lib/catalog/item-href.ts`.
- Produces: `<FeedCard event={FeedEvent} viewerLoggedIn={boolean} />`. Consumed by Task 6 (`FeedList`).

- [ ] **Step 1: Write `src/components/social/feed-card.tsx`**

This must be a **client** component (not `async`/server, unlike `CommunityPanel`'s cards) — `FeedList` (Task 6) is itself a client component holding cursor state, and events loaded via "Cargar más" arrive as plain data through a server action, not as pre-rendered server JSX. A server component can't be imported and rendered from inside a client component's own render tree.

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";

export function FeedCard({
  event,
  viewerLoggedIn,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const format = useFormatter();
  const accent = MEDIA_ACCENT[event.itemType];

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <UserAvatar
          name={event.actorDisplayName || event.actorUsername}
          avatarUrl={event.actorAvatarUrl}
          size={36}
        />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              <Link
                href={`/u/${event.actorUsername}`}
                className="font-medium hover:underline"
              >
                {event.actorDisplayName || event.actorUsername}
              </Link>{" "}
              <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {format.dateTime(new Date(event.eventDate), {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          <Link
            href={itemHref(event.itemType, event.itemId)}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted p-2 transition-colors hover:border-accent"
          >
            {event.itemCoverUrl && (
              <Image
                src={event.itemCoverUrl}
                alt={event.itemTitle}
                width={40}
                height={56}
                className="rounded object-cover"
              />
            )}
            <div className="flex flex-col">
              <span className={`text-sm font-medium ${accent.text}`}>{event.itemTitle}</span>
              {event.episode && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {`S${event.episode.season}E${event.episode.episode}`}
                  {event.episode.title ? ` · ${event.episode.title}` : ""}
                </span>
              )}
              {event.progress?.durationMinutes != null && (
                <span className="text-xs text-muted-foreground">
                  {t("minutesLogged", { count: event.progress.durationMinutes })}
                </span>
              )}
            </div>
          </Link>

          {event.rating !== null && (
            <RatingDots value={event.rating / 2} fillClassName={accent.bg} />
          )}
          {event.reviewExcerpt && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {event.reviewExcerpt}
            </p>
          )}

          {event.interactionTarget && (
            <ReviewInteractions
              targetType={event.interactionTarget.targetType}
              targetId={event.interactionTarget.targetId}
              reactionCount={event.reactionCount}
              viewerReacted={event.viewerReacted}
              commentCount={event.commentCount}
              comments={event.comments}
              viewerLoggedIn={viewerLoggedIn}
            />
          )}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Add i18n keys**

In `messages/es.json`, add a new top-level `"feed"` namespace (place it near the `"social"`/`"notifications"` namespaces for discoverability):

```json
  "feed": {
    "verbs": {
      "added": "añadió a su biblioteca",
      "progressed": "avanzó en",
      "finished": "terminó",
      "rated": "valoró",
      "reviewed": "reseñó",
      "watchedEpisode": "marcó un episodio de"
    },
    "minutesLogged": "{count, plural, one {1 minuto registrado} other {# minutos registrados}}"
  },
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/social/feed-card.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/feed-card.tsx messages/es.json
git commit -m "feat: add FeedCard component"
```

---

### Task 5: `FeedFilters` component

**Files:**
- Create: `src/components/social/feed-filters.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `<FeedFilters itemType={ItemType | undefined} reviewsOnly={boolean | undefined} />` (server component). Consumed by Task 7 (`page.tsx`).

- [ ] **Step 1: Write `src/components/social/feed-filters.tsx`**

Mirrors `src/app/u/[username]/library-filters.tsx`'s established server-side, `<Link>`-driven filter pattern (see that file for the precedent this follows).

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";

const TYPES: ItemType[] = ["book", "movie", "series"];

function pillClass(active: boolean) {
  return `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

export async function FeedFilters({
  itemType,
  reviewsOnly,
}: {
  itemType?: ItemType;
  reviewsOnly?: boolean;
}) {
  const t = await getTranslations();

  function buildHref(next: { type?: ItemType; reviewsOnly?: boolean }) {
    const params = new URLSearchParams();
    params.set("tab", "following");
    const nextType = "type" in next ? next.type : itemType;
    const nextReviewsOnly = "reviewsOnly" in next ? next.reviewsOnly : reviewsOnly;
    if (nextType) params.set("itemType", nextType);
    if (nextReviewsOnly) params.set("reviewsOnly", "1");
    return `/?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={buildHref({ type: undefined })} className={pillClass(!itemType)}>
        {t("library.filters.allTypes")}
      </Link>
      {TYPES.map((type) => (
        <Link key={type} href={buildHref({ type })} className={pillClass(itemType === type)}>
          {t(`search.types.${type}`)}
        </Link>
      ))}
      <Link
        href={buildHref({ reviewsOnly: !reviewsOnly })}
        className={pillClass(Boolean(reviewsOnly))}
      >
        {t("feed.filters.reviewsOnly")}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys**

In `messages/es.json`, inside the `"feed"` namespace added in Task 4, add a `"filters"` sub-object:

```json
    "filters": {
      "reviewsOnly": "Solo reseñas"
    },
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/social/feed-filters.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/feed-filters.tsx messages/es.json
git commit -m "feat: add FeedFilters component (server-side, URL-driven)"
```

---

### Task 6: `FeedList` component

**Files:**
- Create: `src/components/social/feed-list.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `FeedCard` from `src/components/social/feed-card.tsx` (Task 4); `loadMoreFeed` from `src/lib/social/feed-actions.ts` (Task 2); `FeedEvent`, `FeedPage` types from `src/lib/social/feed.ts` (Task 1).
- Produces: `<FeedList initialEvents={FeedEvent[]} initialCursor={string | null} itemType={ItemType | undefined} reviewsOnly={boolean | undefined} viewerLoggedIn={boolean} />`. Consumed by Task 7 (`page.tsx`).

- [ ] **Step 1: Write `src/components/social/feed-list.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { loadMoreFeed } from "@/lib/social/feed-actions";
import { FeedCard } from "./feed-card";

// Lista del feed con paginación "Cargar más" (EPIC-05, Bloque C). Mantiene
// el cursor y los eventos acumulados en estado cliente; cada clic pide la
// siguiente página al servidor con los mismos filtros ya aplicados por la
// navegación inicial (itemType/reviewsOnly viven en la URL, no aquí).
export function FeedList({
  initialEvents,
  initialCursor,
  itemType,
  reviewsOnly,
  viewerLoggedIn,
}: {
  initialEvents: FeedEvent[];
  initialCursor: string | null;
  itemType?: ItemType;
  reviewsOnly?: boolean;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  function loadMore() {
    startTransition(async () => {
      const page = await loadMoreFeed(cursor, itemType, reviewsOnly);
      setEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    });
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
        <Link href="/usuarios" className="text-sm font-medium text-accent hover:underline">
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => (
        <FeedCard key={event.id} event={event} viewerLoggedIn={viewerLoggedIn} />
      ))}
      {cursor && (
        <button
          type="button"
          disabled={isPending}
          onClick={loadMore}
          className="self-center rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys**

In `messages/es.json`, inside the `"feed"` namespace, add:

```json
    "empty": "Todavía no hay actividad de las cuentas que sigues.",
    "emptyCta": "Buscar gente a quien seguir",
    "loadMore": "Cargar más",
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/social/feed-list.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/feed-list.tsx messages/es.json
git commit -m "feat: add FeedList component with Cargar más pagination"
```

---

### Task 7: Wire into `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `HomeTabs` (Task 3), `FeedFilters` (Task 5), `FeedList` (Task 6), `getFeed` (Task 1).

- [ ] **Step 1: Rewrite `src/app/page.tsx`**

The logged-out branch (lines 33-53 of the current file) is unchanged. Replace everything from the `searchParams` destructuring through the end of the function:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { getFeed } from "@/lib/social/feed";
import { NowConsuming } from "@/components/now-consuming";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { AnnualStats } from "@/components/stats/annual-stats";
import { GoalsForm } from "@/components/stats/goals-form";
import { HomeTabs } from "@/components/home/home-tabs";
import { FeedFilters } from "@/components/social/feed-filters";
import { FeedList } from "@/components/social/feed-list";
import { AppLogoIcon, SparklesIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";

const MONTH_RE = /^\d{4}-\d{2}$/;
const ITEM_TYPES: readonly string[] = ["book", "movie", "series"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    tab?: string;
    itemType?: string;
    reviewsOnly?: string;
  }>;
}) {
  const {
    month: monthParam,
    tab: tabParam,
    itemType: itemTypeParam,
    reviewsOnly: reviewsOnlyParam,
  } = await searchParams;
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-surface shadow-sm">
            <AppLogoIcon className="h-10 w-10 text-accent" />
          </div>
          <SparklesIcon className="absolute -right-2 -top-2 h-6 w-6 text-accent" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("common.appName")}
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          {t("home.tagline")}
        </p>
        <Link href="/signup" className={buttonVariants("primary", "px-6")}>
          {t("home.cta")}
        </Link>
      </div>
    );
  }

  const activeTab = tabParam === "following" ? "following" : "panel";
  const itemType = ITEM_TYPES.includes(itemTypeParam ?? "")
    ? (itemTypeParam as ItemType)
    : undefined;
  const reviewsOnly = reviewsOnlyParam === "1";

  const profile = await getOwnProfile(supabase, user.id);

  let panelContent: ReactNode;
  let followingContent: ReactNode;

  if (activeTab === "panel") {
    const [inProgress, weekly, streaks, calendar, annual] = await Promise.all([
      getLibraryItems(supabase, user.id, { status: "in_progress" }),
      getWeeklyActivity(supabase, user.id),
      getStreaks(supabase, user.id),
      getMonthCalendar(
        supabase,
        user.id,
        MONTH_RE.test(monthParam ?? "")
          ? (monthParam as string)
          : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      ),
      getAnnualCompleted(supabase, user.id, new Date().getFullYear()),
    ]);

    panelContent = (
      <div className="grid gap-8">
        <div className="grid gap-4 rounded-lg border border-border bg-surface p-4">
          <NowConsuming items={inProgress} linkToSession />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <WeeklyStrip
              days={weekly}
              dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
            />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <StreakCard streaks={streaks} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <MonthCalendar initialCalendar={calendar} basePath="/" />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <AnnualStats
              annual={annual}
              annualGoals={
                profile?.annualGoals ?? { book: null, movie: null, series: null }
              }
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <GoalsForm
            dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
            annualGoals={
              profile?.annualGoals ?? { book: null, movie: null, series: null }
            }
          />
        </div>
      </div>
    );
    followingContent = null;
  } else {
    const feedPage = await getFeed(supabase, user.id, {
      itemType,
      reviewsOnly,
      pageSize: 20,
    });

    followingContent = (
      <div className="flex flex-col gap-4">
        <FeedFilters itemType={itemType} reviewsOnly={reviewsOnly} />
        <FeedList
          initialEvents={feedPage.events}
          initialCursor={feedPage.nextCursor}
          itemType={itemType}
          reviewsOnly={reviewsOnly}
          viewerLoggedIn={true}
        />
      </div>
    );
    panelContent = null;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-10 w-1 shrink-0 rounded-full bg-accent"
        />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("home.welcome")}
          </h1>
          <p className="text-sm text-muted-foreground">@{profile?.username}</p>
        </div>
      </div>

      <HomeTabs
        labels={{ panel: t("home.tabs.panel"), following: t("home.tabs.following") }}
        panel={panelContent}
        following={followingContent}
      />
    </div>
  );
}
```

Note the per-tab conditional fetching: unlike `ItemDetailTabs` (which always fetches every slot's data since an item page's slots share context and are all cheap together), Home's two tabs have disjoint, individually expensive datasets (5 dashboard queries vs. the feed's 4-source fan-out) — so only the active tab's data is fetched per request. Switching tabs via `HomeTabs`' `router.replace` is a client-side navigation that re-executes this Server Component for the new `searchParams`, fetching only what the newly-active tab needs.

- [ ] **Step 2: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/app/page.tsx
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire Siguiendo feed tab into the home page"
```

---

### Task 8: Manual E2E verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Check port 3000 isn't already in use by an unrelated process first (`netstat -ano | grep :3000` or similar); use a different port if needed, and only kill a process you started yourself when done.

- [ ] **Step 2: Browser E2E checklist**

Using the seeded `devtest` account and, if needed, a second disposable test user (see `docs/TESTING.md`), with `devtest` following at least one other account that has varied activity (a finished/rated/reviewed diary entry, a progress session, a new library add, a watched episode):

1. Load `/` as `devtest` — confirm it defaults to the Panel tab (existing dashboard, unchanged).
2. Click "Siguiendo" — confirm the URL becomes `?tab=following`, the feed loads, and each event shows the correct verb text for its actual data (a plain finish shows "terminó", a rated-no-review shows "valoró", a reviewed one shows "reseñó" plus the review excerpt, a progress session shows "avanzó en" with duration if present, a new library add shows the added verb, a watched episode shows the episode verb with season/episode).
3. On a `reviewed`/`rated`/`finished` (diary-sourced) or any episode-sourced event, confirm `ReviewInteractions` renders and the like/comment flow works (reuse of Bloque B — should already work, this just confirms correct wiring: right `targetType`/`targetId` reaching the component).
4. On an `added`/`progressed` event, confirm there's no reaction/comment row (no valid target).
5. Click a Libro/Película/Serie filter chip — confirm the URL updates (`?tab=following&itemType=book`), the page reloads with a filtered feed, and only that item type appears.
6. Toggle "Solo reseñas" — confirm the URL updates (`&reviewsOnly=1`) and only `reviewed`-verb events remain.
7. If more than 20 combined events exist across the followed accounts, click "Cargar más" and confirm additional events append without a full page reload, and that filters stay applied across the load-more call.
8. Log in as an account following nobody (or unfollow everyone temporarily) and confirm the empty state renders with a working link to `/usuarios`.
9. Confirm no console errors throughout.

Fix anything that doesn't match before proceeding. Stop the dev server when done.

- [ ] **Step 3: Clean up any test data created during verification**

If you created disposable activity (extra diary entries, follows, etc.) purely to populate the feed for this check, remove it afterward and confirm `devtest`'s own state is unchanged from before verification.

---

### Task 9: Update docs

**Files:**
- Modify: `docs/requirements/social-epic.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Update `docs/requirements/social-epic.md`**

Mark `E5.C1`–`E5.C3` as done (`- [x]`) in the Bloque C section, and add a status note at the top of that section matching the style used for Bloques A/B/D (built + verified, no schema change, browser E2E confirmed verb derivation/filters/pagination/inline reactions/empty state). Note the filter-approach deviation from the original sketch (server-side query params instead of client-side predicates, decided during implementation planning to match the existing `library-filters.tsx` convention).

- [ ] **Step 2: Update `docs/REQUIREMENTS.md`**

Add a dated row to the §9 decision table (same style as the existing EPIC-05 Bloque A/B/D rows) documenting SD-1's implementation: on-read fan-out across the four source tables, zero new schema, the verb-derivation rule, reuse of Bloque B's `ReviewInteractions`/`getInteractionSummary` for review-bearing events, and the filter-pattern alignment with `library-filters.tsx`.

- [ ] **Step 3: Commit**

```bash
git add docs/requirements/social-epic.md docs/REQUIREMENTS.md
git commit -m "docs: mark EPIC-05 Bloque C done (feed verified, no schema change)"
```
