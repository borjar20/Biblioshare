# Feed patrón C — PR 1 (armazón + valoración/reseña + episodios) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las tarjetas «valoró» / «marcó un episodio» del feed ocupen la mitad, digan sin ambigüedad si se valoró la serie o episodios y muestren la nota de cada episodio del día.

**Architecture:** Tres piezas nuevas en `src/components/social/feed-card/` (`FeedCardShell`, `FeedWorkRow`, `FeedMiniList`) que fijan el patrón C; `ReviewCard` se reescribe sobre ellas. `getFeed` añade `episodes` (temporada, episodio, título, nota) al post `watched` reutilizando la consulta `dayWatches` que ya existe.

**Tech Stack:** Next.js 16 (App Router), React 19, next-intl, Tailwind, Supabase JS, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-feed-patron-c-design.md`. Este plan cubre **solo la PR 1**; las PRs 2 (hito, visionado conjunto, pensamiento) y 3 (avances, colección, club) tendrán su propio plan cuando esta esté integrada, porque consumen la API de las piezas que aquí se fijan.

## Global Constraints

- Rama: `feat/feed-patron-c` (ya creada, con la spec commiteada).
- Node 22 vía fnm (el shell trae v20 y rompe vitest): en bash, `eval "$(fnm env --shell bash)" && fnm use 22` antes de `npx`.
- Sin cambio de esquema. Sin `use cache` nuevo: el feed usa el cliente de la petición (regla #437).
- Copia de UI en español, en `messages/es.json` namespace `feed`. Ningún literal de UI en los componentes.
- Patrón C: cabecera fina (avatar 22 px · quién · verbo · hora · icono de comentarios · menú), fila de obra (portada 30 px, título serif 15 px, datos mono 10,5 px, valor a la derecha), contenido debajo solo si existe. Sin caja interior `bg-surface-muted` ni fila de pie `PostSummary` en esta tarjeta.
- Variantes que se mantienen: `hideActor` (perfil: sin avatar ni nombre, verbo con mayúscula inicial), `showInteractions=false` (cabecera de `/post/[id]`: sin icono de comentarios, reseña entera sin recortar).
- Mini-listas: máximo 3 filas y «+N más».
- `PostSummary` NO se borra (lo usa `ExperienceFeedCard`).

---

### Task 1: `episodes` del día en el post `watched`

**Files:**
- Modify: `src/lib/social/feed.ts` (tipo `FeedEvent` ~l.114-117; consulta `dayWatches` ~l.585-616; draft `watched` ~l.733-752)
- Test: `src/lib/social/feed.test.ts` (test «un 'watched' es el día de una serie…», ~l.145)

**Interfaces:**
- Produces: `FeedEvent.episodes?: FeedEpisode[] | null` y `export type FeedEpisode = { season: number; episode: number; title: string | null; rating: number | null }`. Ordenados por `(season, episode)`, sin duplicados. Solo en posts `watched`; ausente en el resto. **Se elimina `episodeCount`** (su único lector es `review-card.tsx`, que pasa a usar `episodes.length` en la Task 3).

- [ ] **Step 1: Escribir los tests que fallan**

Sustituir el test existente «un 'watched' es el día de una serie…» por estos dos (mismo `describe`):

```ts
  test("un 'watched' es el día de una serie: episodio del que cuelga y la nota de cada episodio del día", async () => {
    // Fase 4 de series: un post por serie y día (autopost-watched.ts), colgado
    // del primer episodio; la tarjeta lista los del MISMO autor, serie y día,
    // cada uno con SU nota (spec 2026-10-05-feed-patron-c).
    const ep = (id: string, episode: number, watchedOn: string, rating: number | null = null) => ({
      id, user_id: FAKE_ACTOR_ID, series_id: FAKE_SERIES_ID, season_number: 2, episode_number: episode,
      rating, review: null, watched_on: watchedOn,
    });
    const sb = fakeSupabase({
      posts: [post("p1", "2026-09-23T21:00:00+00:00", {
        kind: "watched", source_kind: "episode_watch", source_id: "w1",
        anchor_type: "series", anchor_id: FAKE_SERIES_ID,
      })],
      episodes: [
        ep("w3", 6, "2026-09-23"),
        ep("w1", 4, "2026-09-23", 4),
        ep("w2", 5, "2026-09-23", 8),
        ep("w0", 3, "2026-09-22", 10),
      ],
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.kind).toBe("watched");
    expect(e.episode).toEqual({ season: 2, episode: 4, title: null });
    expect(e.episodes).toEqual([
      { season: 2, episode: 4, title: null, rating: 4 },
      { season: 2, episode: 5, title: null, rating: 8 },
      { season: 2, episode: 6, title: null, rating: null },
    ]);
  });

  test("un episodio marcado dos veces el mismo día cuenta una vez, y gana la marca con nota", async () => {
    const ep = (id: string, episode: number, rating: number | null) => ({
      id, user_id: FAKE_ACTOR_ID, series_id: FAKE_SERIES_ID, season_number: 1, episode_number: episode,
      rating, review: null, watched_on: "2026-09-23",
    });
    const sb = fakeSupabase({
      posts: [post("p1", "2026-09-23T21:00:00+00:00", {
        kind: "watched", source_kind: "episode_watch", source_id: "w1",
        anchor_type: "series", anchor_id: FAKE_SERIES_ID,
      })],
      episodes: [ep("w1", 1, null), ep("w1b", 1, 6), ep("w2", 2, null)],
    });
    const [e] = personEvents((await getFeed(sb.client, VIEWER, {})).events);
    expect(e.episodes).toEqual([
      { season: 1, episode: 1, title: null, rating: 6 },
      { season: 1, episode: 2, title: null, rating: null },
    ]);
  });
```

- [ ] **Step 2: Comprobar que fallan**

Run: `npx vitest run src/lib/social/feed.test.ts -t "watched"`
Expected: FAIL — `e.episodes` es `undefined`.

- [ ] **Step 3: Implementar**

En el tipo `FeedEvent`, sustituir el bloque de `episodeCount` por:

```ts
  // Solo posts `watched`: los episodios de esa serie que el autor marcó ese
  // mismo día (el post es el día, colgado del primero), cada uno con SU nota,
  // ordenados y sin duplicados. Ausente en el resto.
  episodes?: FeedEpisode[] | null;
```

y, junto a los demás tipos exportados del fichero:

```ts
export type FeedEpisode = { season: number; episode: number; title: string | null; rating: number | null };
```

En la consulta `dayWatches`, ampliar el `select` y el tipo del fallback:

```ts
          .select("user_id, series_id, watched_on, season_number, episode_number, rating")
```
```ts
      : Promise.resolve({
          data: [] as {
            user_id: string; series_id: string; watched_on: string;
            season_number: number; episode_number: number; rating: number | null;
          }[],
          error: null,
        }),
```

Sustituir la construcción de `episodesPerDay` (el `Map<string, number>` y su bucle) por una que agrupa episodios. Debe ir **después** de `titleByEpisode`, porque lo usa:

```ts
  const titleByEpisode = new Map(
    (episodeTitles ?? []).map((e) => [`${e.series_id}:${e.season_number}:${e.episode_number}`, e.title]),
  );
  // Episodios de cada (autor, serie, día), uno por (temporada, episodio): si se
  // marcó dos veces, gana la marca con nota.
  const episodesByDay = new Map<string, Map<string, FeedEpisode>>();
  for (const w of dayWatches ?? []) {
    const dayKey = `${w.user_id}:${w.series_id}:${w.watched_on}`;
    const epKey = `${w.season_number}:${w.episode_number}`;
    const day = episodesByDay.get(dayKey) ?? new Map<string, FeedEpisode>();
    const prev = day.get(epKey);
    if (!prev || (prev.rating == null && w.rating != null)) {
      day.set(epKey, {
        season: w.season_number,
        episode: w.episode_number,
        title: titleByEpisode.get(`${w.series_id}:${w.season_number}:${w.episode_number}`) ?? null,
        rating: w.rating,
      });
    }
    episodesByDay.set(dayKey, day);
  }
  const episodesForDay = (key: string): FeedEpisode[] =>
    [...(episodesByDay.get(key)?.values() ?? [])].sort((a, b) => a.season - b.season || a.episode - b.episode);
```

(Borrar la declaración original de `titleByEpisode` que había justo debajo, para no duplicarla.)

En el draft `watched`, sustituir `episodeCount: …` por:

```ts
        episodes: ep ? episodesForDay(`${ep.user_id}:${ep.series_id}:${ep.watched_on}`) : null,
```

- [ ] **Step 4: Comprobar que pasan, y que nada más lee `episodeCount`**

Run: `npx vitest run src/lib/social/feed.test.ts`
Expected: PASS (todo el fichero).

Run: `npx tsc --noEmit`
Expected: un único error, en `src/components/social/review-card.tsx` (`episodeCount` no existe). Se arregla en la Task 3. Cualquier otro error: corregirlo aquí.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/feed.ts src/lib/social/feed.test.ts
git commit -m "feat(feed): el post diario de una serie trae cada episodio con su nota"
```

---

### Task 2: Piezas del patrón C (`FeedCardShell`, `FeedWorkRow`, `FeedMiniList`)

**Files:**
- Create: `src/components/social/feed-card/feed-card-shell.tsx`
- Create: `src/components/social/feed-card/feed-work-row.tsx`
- Create: `src/components/social/feed-card/feed-mini-list.tsx`
- Modify: `messages/es.json` (namespace `feed`, clave nueva `card`)
- Test: `src/components/social/feed-card/feed-card.test.tsx`

**Interfaces:**
- Produces:
  - `FeedCardShell({ actor, verb, eventDate, postId, reactionCount, commentCount, viewerCanDelete, hideActor?, showInteractions?, children })`. `actor: { username: string; displayName: string | null; avatarUrl: string | null }`, `verb: ReactNode`, `postId: string | null | undefined`, `viewerCanDelete: boolean | undefined`. Devuelve `null` si el post se borró. Gestiona `useDeletePost`, `PostDeleteMenu` y `PostDeleteError`.
  - `FeedWorkRow({ itemType, itemId, coverUrl, title, facts, trailing?, size?, children? })`. `title: string`, `facts: string`, `size: "md" | "sm"` (30 px / 24 px de portada), `children` va bajo los datos, dentro de la columna de texto.
  - `FeedMiniList({ rows, max? })` con `rows: FeedMiniListRow[]`, `FeedMiniListRow = { key: string; label: string; text: ReactNode; value: ReactNode }`, `max` por defecto 3.
  - Claves i18n `feed.card.moreItems` y `feed.card.noRating`.

- [ ] **Step 1: Añadir la copia**

En `messages/es.json`, dentro de `"feed"` (por ejemplo justo después del bloque `"verbs"`), añadir:

```json
    "card": {
      "finished": "{itemType, select, series {terminó la serie} other {terminó}}",
      "rated": "{itemType, select, series {valoró la serie} other {terminó y valoró}}",
      "reviewed": "{itemType, select, series {reseñó la serie} other {reseñó}}",
      "episodes": "{rated, select, yes {valoró} other {vio}} {count, plural, one {un episodio} other {# episodios}}",
      "episodeOf": "de {title}",
      "moreItems": "+{count} más",
      "noRating": "Sin nota"
    },
```

(`finished`/`rated`/`reviewed`/`episodes`/`episodeOf` los usa la Task 3; se añaden aquí para tocar el JSON una sola vez.)

- [ ] **Step 2: Escribir los tests que fallan**

`src/components/social/feed-card/feed-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/social/post-actions", () => ({ deletePost: vi.fn() }));

import { FeedCardShell } from "./feed-card-shell";
import { FeedWorkRow } from "./feed-work-row";
import { FeedMiniList } from "./feed-mini-list";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const actor = { username: "maxteryo", displayName: null, avatarUrl: null };
const shell = (over: Partial<Parameters<typeof FeedCardShell>[0]> = {}) => (
  <FeedCardShell
    actor={actor}
    verb="valoró la serie"
    eventDate={new Date().toISOString()}
    postId="p1"
    reactionCount={0}
    commentCount={0}
    viewerCanDelete={false}
    {...over}
  >
    <p>cuerpo</p>
  </FeedCardShell>
);

describe("FeedCardShell", () => {
  it("cabecera en una línea: quién y verbo, y el icono de comentarios lleva al post", () => {
    const { container } = wrap(shell());
    expect(container.textContent).toContain("maxteryo valoró la serie");
    expect(screen.getByRole("link", { name: "Comentar" }).getAttribute("href")).toBe("/post/p1");
    expect(screen.getByText("cuerpo")).toBeTruthy();
  });

  it("con comentarios, el icono los cuenta", () => {
    wrap(shell({ commentCount: 2, reactionCount: 1 }));
    expect(screen.getByRole("link", { name: "2 comentarios" })).toBeTruthy();
  });

  it("en /post/[id] (showInteractions=false) no hay icono de comentarios", () => {
    wrap(shell({ showInteractions: false }));
    expect(screen.queryByRole("link", { name: "Comentar" })).toBeNull();
  });

  it("en el perfil (hideActor) no sale el nombre", () => {
    const { container } = wrap(shell({ hideActor: true }));
    expect(container.textContent).not.toContain("maxteryo");
    expect(container.textContent).toContain("valoró la serie");
  });
});

describe("FeedWorkRow", () => {
  it("título y datos enlazan a la obra; el valor va a la derecha", () => {
    wrap(
      <FeedWorkRow itemType="series" itemId="loki" coverUrl={null} title="Loki" facts="Serie · 2021" trailing={<span>nota</span>} />,
    );
    expect(screen.getByRole("link", { name: "Loki" }).getAttribute("href")).toContain("loki");
    expect(screen.getByText("Serie · 2021")).toBeTruthy();
    expect(screen.getByText("nota")).toBeTruthy();
  });
});

describe("FeedMiniList", () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `S1E${n}`, text: `Ep ${n}`, value: null }));

  it("pinta como mucho 3 filas y «+N más»", () => {
    const { container } = wrap(<FeedMiniList rows={rows} />);
    expect(container.textContent).toContain("S1E3");
    expect(container.textContent).not.toContain("S1E4");
    expect(container.textContent).toContain("+2 más");
  });

  it("sin sobrante no dice «más»", () => {
    const { container } = wrap(<FeedMiniList rows={rows.slice(0, 3)} />);
    expect(container.textContent).not.toContain("más");
  });
});
```

- [ ] **Step 3: Comprobar que fallan**

Run: `npx vitest run src/components/social/feed-card/feed-card.test.tsx`
Expected: FAIL — no se pueden resolver `./feed-card-shell`, `./feed-work-row` ni `./feed-mini-list`.

- [ ] **Step 4: Implementar las tres piezas**

`src/components/social/feed-card/feed-card-shell.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TimeAgo } from "@/components/ui/time-ago";
import { CommentIcon, HeartIcon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/social/user-avatar";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "../post-delete-menu";

// Armazón del patrón C (spec 2026-10-05-feed-patron-c): cabecera fina en una
// línea —avatar 22 px · quién · verbo · hora · icono de comentarios · menú— y
// debajo el cuerpo de cada tarjeta. Sin caja interior ni fila de pie: el icono
// de la cabecera ES el enlace al hilo (/post/[id]), como en el hito.
//
// `hideActor` (Actividad del perfil): sin avatar ni nombre; el verbo arranca en
// mayúscula. `showInteractions=false` (cabecera de /post/[id]): sin icono, el
// hilo va debajo de la página.
export type FeedCardActor = { username: string; displayName: string | null; avatarUrl: string | null };

export function FeedCardShell({
  actor,
  verb,
  eventDate,
  postId,
  reactionCount,
  commentCount,
  viewerCanDelete,
  hideActor = false,
  showInteractions = true,
  children,
}: {
  actor: FeedCardActor;
  verb: ReactNode;
  eventDate: string;
  postId: string | null | undefined;
  reactionCount: number;
  commentCount: number;
  viewerCanDelete: boolean | undefined;
  hideActor?: boolean;
  showInteractions?: boolean;
  children: ReactNode;
}) {
  const { deleted, error, pending, requestDelete } = useDeletePost(postId);
  if (deleted) return null;
  const name = actor.displayName || actor.username;

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-2">
        {!hideActor && <UserAvatar name={name} avatarUrl={actor.avatarUrl} size={22} />}
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
          {!hideActor && (
            <>
              <Link href={`/u/${actor.username}`} className="font-semibold hover:underline">
                {name}
              </Link>{" "}
            </>
          )}
          <span className={`text-muted-foreground${hideActor ? " inline-block first-letter:uppercase" : ""}`}>
            {verb}
          </span>
        </p>
        <TimeAgo iso={eventDate} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
        {showInteractions && postId && (
          <FeedThreadLink postId={postId} reactionCount={reactionCount} commentCount={commentCount} />
        )}
        {viewerCanDelete && postId && <PostDeleteMenu onDelete={requestDelete} pending={pending} />}
      </div>
      {children}
      {error && <PostDeleteError />}
    </article>
  );
}

// Sin ceros ni «Ver hilo» (#1227, propuesta 2): un icono que lleva a
// /post/[id] y, si hay actividad, los contadores.
function FeedThreadLink({
  postId,
  reactionCount,
  commentCount,
}: {
  postId: string;
  reactionCount: number;
  commentCount: number;
}) {
  const t = useTranslations("social");
  return (
    <Link
      href={`/post/${postId}`}
      aria-label={commentCount > 0 ? t("commentsCount", { count: commentCount }) : t("postComment")}
      className="flex shrink-0 items-center gap-2.5 px-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {reactionCount > 0 && (
        <span className="flex items-center gap-1 text-accent">
          <HeartIcon className="h-3.5 w-3.5" />
          {reactionCount}
        </span>
      )}
      <span className="flex items-center gap-1">
        <CommentIcon className="h-4 w-4" />
        {commentCount > 0 && commentCount}
      </span>
    </Link>
  );
}
```

`src/components/social/feed-card/feed-work-row.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { SpineCover } from "../spine-cover";

// Fila de obra del patrón C: portada pequeña · lo que pasó como título (serif)
// · datos en mono · el valor a la derecha (nota, %, botón). `children` va bajo
// los datos, en la misma columna (p. ej. la mini-lista de episodios).
const COVER = { md: 30, sm: 24 } as const;

export function FeedWorkRow({
  itemType,
  itemId,
  coverUrl,
  title,
  facts,
  trailing,
  size = "md",
  children,
}: {
  itemType: ItemType;
  itemId: string;
  coverUrl: string | null;
  title: string;
  facts: string;
  trailing?: ReactNode;
  size?: keyof typeof COVER;
  children?: ReactNode;
}) {
  const href = itemHref(itemType, itemId);
  const px = COVER[size];
  return (
    <div className={`flex gap-2.5 ${children ? "items-start" : "items-center"}`}>
      <Link href={href} className="shrink-0" style={{ width: px }} tabIndex={-1} aria-hidden>
        <SpineCover coverUrl={coverUrl} title={title} sizes={`${px}px`} className="aspect-[2/3] w-full" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className={`block font-serif leading-tight font-semibold hover:underline ${size === "md" ? "text-[15px]" : "text-[13.5px]"}`}
        >
          {title}
        </Link>
        {facts && <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">{facts}</p>}
        {children}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
```

`src/components/social/feed-card/feed-mini-list.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Mini-lista del patrón C: filas compactas «etiqueta mono · texto · valor».
// La usan los episodios del día (y, en las PRs 2-3, avances y miembros).
// Muestra `max` filas y, si sobran, «+N más».
export type FeedMiniListRow = { key: string; label: string; text: ReactNode; value: ReactNode };

export function FeedMiniList({ rows, max = 3 }: { rows: FeedMiniListRow[]; max?: number }) {
  const t = useTranslations("feed");
  const hidden = rows.length - max;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {rows.slice(0, max).map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-11 shrink-0 font-mono text-[10.5px] text-muted-foreground">{r.label}</span>
          <span className="min-w-0 flex-1 truncate">{r.text}</span>
          {r.value != null && <span className="shrink-0">{r.value}</span>}
        </li>
      ))}
      {hidden > 0 && <li className="text-[11.5px] text-muted-foreground">{t("card.moreItems", { count: hidden })}</li>}
    </ul>
  );
}
```

- [ ] **Step 5: Comprobar que pasan**

Run: `npx vitest run src/components/social/feed-card/feed-card.test.tsx`
Expected: PASS (7 tests). Si `getByRole("link", { name: "Loki" })` encuentra dos enlaces, es que la portada ha perdido `aria-hidden`: revisarlo.

- [ ] **Step 6: Commit**

```bash
git add src/components/social/feed-card messages/es.json
git commit -m "feat(feed): piezas del patrón C — cabecera fina, fila de obra y mini-lista"
```

---

### Task 3: `ReviewCard` sobre el patrón C

**Files:**
- Modify (reescribir): `src/components/social/review-card.tsx`
- Modify: `messages/es.json` (borrar `feed.review.moreEpisodes`)
- Test: `src/components/social/review-joint-cards.test.tsx` (bloque `describe("ReviewCard")`)

**Interfaces:**
- Consumes: `FeedCardShell`, `FeedWorkRow`, `FeedMiniList`/`FeedMiniListRow` (Task 2); `FeedEvent.episodes`, `FeedEpisode` (Task 1); claves `feed.card.*`.
- Produces: `ReviewCard` con las mismas props de hoy (`event`, `viewerLoggedIn`, `hideActor?`, `knownUsernames`, `showInteractions?`). `feed-item.tsx` no cambia.

Reglas de la tarjeta:
- **Ruta episodio** si `event.episode != null`. Lista `eps = event.episodes ?? [{ ...event.episode, rating: event.rating }]` (el fallback cubre las previews legadas de `shared-activity.ts`, que no traen `episodes`).
  - Verbo: `t("card.episodes", { rated: eps.some(e => e.rating != null) ? "yes" : "no", count: eps.length })`.
  - 1 episodio: título `S2E3 · Título` (o `S2E3` sin título), datos `de Loki`, a la derecha su nota (`RatingDots size="lg"`) si la tiene.
  - Varios: título = la serie, datos = `Serie`, y debajo `FeedMiniList` con `S#E#` · título · nota (`RatingDots size="sm"`) o «—» con `aria-label` «Sin nota».
- **Ruta obra** en otro caso. Verbo: `t(\`card.${v}\`, { itemType })` con `v = verb === "rated" || verb === "reviewed" ? verb : "finished"`. Datos: tipo · subtítulo · año (no libros) · días · páginas. A la derecha la nota (`size="lg"`).
- Reseña: en el feed, `ClampedExcerpt` (4 líneas + «Seguir leyendo») **debajo** de la fila; en `/post/[id]` el texto entero, sin recorte. Las dos detrás de `SpoilerGate` si `reviewIsSpoiler`.

- [ ] **Step 1: Escribir los tests que fallan**

En `review-joint-cards.test.tsx`, sustituir los tests 2 y 5 del `describe("ReviewCard")` (los que miden `box.contains(text)`) y añadir los de series. El bloque queda:

```tsx
describe("ReviewCard", () => {
  it("una sola etiqueta: el verbo, sin chip «Reseña» ni estado «Finalizado»", () => {
    const { container } = wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("reseñó");
    expect(container.textContent).not.toMatch(/Reseña|Finalizado|Visto/);
    expect(container.textContent).toContain("Película · 2014");
  });

  it("en el feed la reseña va recortada a 4 líneas, sin caja interior ni pie «Comentar»", () => {
    const { container } = wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.getByText(/Top 3 peores apocalipsis/).className).toContain("line-clamp-4");
    expect(container.querySelector(".bg-surface-muted")).toBeNull();
    expect(screen.getByRole("link", { name: "Comentar" }).textContent).toBe("");
  });

  it("«Seguir leyendo» lleva al post cuando el servidor cortó el extracto", () => {
    wrap(<ReviewCard event={review({ reviewExcerpt: "Muy larga…" })} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.getByRole("link", { name: "Seguir leyendo" }).getAttribute("href")).toBe("/post/p1");
  });

  it("una reseña corta no ofrece «Seguir leyendo»", () => {
    wrap(<ReviewCard event={review({ reviewExcerpt: "Pues eso." })} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.queryByRole("link", { name: "Seguir leyendo" })).toBeNull();
  });

  it("en /post/[id] (sin interacciones) el texto va entero, sin recortar ni icono de comentarios", () => {
    wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} showInteractions={false} />);
    expect(screen.getByText(/Top 3 peores apocalipsis/).className).not.toContain("line-clamp");
    expect(screen.queryByRole("link", { name: "Comentar" })).toBeNull();
  });

  it("valorar la serie entera dice «valoró la serie»", () => {
    const { container } = wrap(
      <ReviewCard
        event={review({ verb: "rated", itemType: "series", itemId: "loki", itemTitle: "Loki", itemYear: 2021, reviewExcerpt: null, rating: 7 })}
        viewerLoggedIn
        knownUsernames={[]}
      />,
    );
    expect(container.textContent).toContain("valoró la serie");
    expect(container.textContent).toContain("Serie · 2021");
  });

  const watched = (episodes: FeedEpisode[]) =>
    makeFeedEvent({
      kind: "watched",
      verb: episodes[0].rating != null ? "rated" : "watchedEpisode",
      itemType: "series",
      itemId: "loki",
      itemTitle: "Loki",
      rating: episodes[0].rating,
      episode: { season: episodes[0].season, episode: episodes[0].episode, title: episodes[0].title },
      episodes,
    });
  const ep = (episode: number, rating: number | null, title: string | null = null): FeedEpisode => ({ season: 2, episode, title, rating });

  it("un episodio valorado: el episodio es el título y la serie va en los datos", () => {
    const { container } = wrap(<ReviewCard event={watched([ep(3, 4, "1893")])} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("valoró un episodio");
    expect(screen.getByRole("link", { name: "S2E3 · 1893" })).toBeTruthy();
    expect(container.textContent).toContain("de Loki");
  });

  it("varios episodios: cada uno con su nota, «Sin nota» si no la tiene y «+N más» pasado el tercero", () => {
    const { container } = wrap(
      <ReviewCard event={watched([ep(3, 4, "1893"), ep(4, 8), ep(5, null), ep(6, 6)])} viewerLoggedIn knownUsernames={[]} />,
    );
    expect(container.textContent).toContain("valoró 4 episodios");
    expect(screen.getByRole("link", { name: "Loki" })).toBeTruthy();
    expect(container.textContent).toContain("S2E4");
    expect(screen.getByLabelText("Sin nota")).toBeTruthy();
    expect(container.textContent).not.toContain("S2E6");
    expect(container.textContent).toContain("+1 más");
  });

  it("episodios sin ninguna nota dicen «vio», no «valoró»", () => {
    const { container } = wrap(<ReviewCard event={watched([ep(3, null), ep(4, null)])} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("vio 2 episodios");
    expect(container.textContent).not.toContain("valoró");
  });
});
```

Y en los imports del fichero:

```tsx
import type { FeedEpisode, JointCardMember } from "@/lib/social/feed";
```

- [ ] **Step 2: Comprobar que fallan**

Run: `npx vitest run src/components/social/review-joint-cards.test.tsx -t "ReviewCard"`
Expected: FAIL en «sin caja interior…», «valoró la serie», «un episodio valorado…», «varios episodios…» y «episodios sin ninguna nota…».

- [ ] **Step 3: Reescribir `review-card.tsx`**

Sustituir el fichero entero por:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEpisode, FeedEvent } from "@/lib/social/feed";
import { RatingDots } from "@/components/ui/rating-dots";
import { MentionText } from "@/components/social/mention-text";
import { SpoilerGate } from "@/components/social/spoiler-gate";
import { FeedCardShell } from "./feed-card/feed-card-shell";
import { FeedWorkRow } from "./feed-card/feed-work-row";
import { FeedMiniList } from "./feed-card/feed-mini-list";

// Tarjeta de valoración/reseña (finished/watched y los legados rated/reviewed/
// watchedEpisode) con el patrón C (spec 2026-10-05-feed-patron-c): lo que se
// valoró es el título y la nota va a la derecha.
//
// Dos rutas que el verbo nombra sin ambigüedad:
// - OBRA (libro, peli o la serie entera): «terminó», «terminó y valoró»,
//   «valoró la serie», «reseñó»…
// - EPISODIOS (post diario `watched`): «valoró/vio N episodios». Con uno solo,
//   el episodio es el título («S2E3 · 1893», «de Loki»); con varios, la serie
//   es el título y debajo cada episodio con SU nota. Antes el post llevaba
//   solo la nota del primero junto a «+3 episodios» y parecía la de todos.
//
// La reseña: en el feed, bajo la fila, recortada a 4 líneas con «Seguir
// leyendo»; en la cabecera de /post/[id] (`showInteractions=false`), entera.
export function ReviewCard({
  event,
  hideActor = false,
  knownUsernames,
  showInteractions = true,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (extracto + comentarios). */
  knownUsernames: string[];
  /** `false` en la cabecera de /post/[id]: el hilo lo pinta PostThread aparte. */
  showInteractions?: boolean;
}) {
  const t = useTranslations("feed");
  const workType = t("workType", { itemType: event.itemType });

  let verb: string;
  let row: React.ReactNode;
  if (event.episode) {
    // Las previews legadas (shared-activity) no traen `episodes`: un episodio.
    const eps: FeedEpisode[] = event.episodes ?? [{ ...event.episode, rating: event.rating }];
    verb = t("card.episodes", { rated: eps.some((e) => e.rating != null) ? "yes" : "no", count: eps.length });
    if (eps.length === 1) {
      const [only] = eps;
      row = (
        <FeedWorkRow
          itemType={event.itemType}
          itemId={event.itemId}
          coverUrl={event.itemCoverUrl}
          title={[episodeCode(only), only.title].filter(Boolean).join(" · ")}
          facts={t("card.episodeOf", { title: event.itemTitle })}
          trailing={only.rating != null ? <RatingDots value={only.rating} size="lg" itemType={event.itemType} /> : null}
        />
      );
    } else {
      row = (
        <FeedWorkRow
          itemType={event.itemType}
          itemId={event.itemId}
          coverUrl={event.itemCoverUrl}
          title={event.itemTitle}
          facts={workType}
        >
          <FeedMiniList
            rows={eps.map((e) => ({
              key: episodeCode(e),
              label: episodeCode(e),
              text: e.title ?? "",
              value:
                e.rating != null ? (
                  <RatingDots value={e.rating} size="sm" itemType={event.itemType} />
                ) : (
                  <span aria-label={t("card.noRating")} className="font-mono text-[10.5px] text-muted-foreground">—</span>
                ),
            }))}
          />
        </FeedWorkRow>
      );
    }
  } else {
    const v = event.verb === "rated" || event.verb === "reviewed" ? event.verb : "finished";
    verb = t(`card.${v}`, { itemType: event.itemType });
    const facts = [
      workType,
      event.itemSubtitle,
      event.itemType !== "book" && event.itemYear != null ? String(event.itemYear) : null,
      event.reviewMeta?.readingDays != null ? t("review.metaDays", { count: event.reviewMeta.readingDays }) : null,
      event.reviewMeta?.totalPages != null ? t("review.metaPages", { count: event.reviewMeta.totalPages }) : null,
    ].filter(Boolean).join(" · ");
    row = (
      <FeedWorkRow
        itemType={event.itemType}
        itemId={event.itemId}
        coverUrl={event.itemCoverUrl}
        title={event.itemTitle}
        facts={facts}
        trailing={event.rating != null ? <RatingDots value={event.rating} size="lg" itemType={event.itemType} /> : null}
      />
    );
  }

  const gate = (node: React.ReactNode) => (event.reviewIsSpoiler ? <SpoilerGate>{node}</SpoilerGate> : node);
  // `whitespace-pre-line`: los saltos de línea de la reseña son del autor.
  const excerpt =
    event.reviewExcerpt &&
    (showInteractions ? (
      <div>
        {gate(
          <ClampedExcerpt
            text={event.reviewExcerpt}
            knownUsernames={knownUsernames}
            postHref={event.postId ? `/post/${event.postId}` : null}
          />,
        )}
      </div>
    ) : (
      gate(
        <p className="border-l-2 border-accent pl-3.5 font-serif text-[14px] leading-relaxed whitespace-pre-line break-words">
          <MentionText text={event.reviewExcerpt} knownUsernames={knownUsernames} />
        </p>,
      )
    ));

  return (
    <FeedCardShell
      actor={{ username: event.actorUsername, displayName: event.actorDisplayName, avatarUrl: event.actorAvatarUrl }}
      verb={verb}
      eventDate={event.eventDate}
      postId={event.postId}
      reactionCount={event.reactionCount}
      commentCount={event.commentCount}
      viewerCanDelete={event.viewerCanDelete}
      hideActor={hideActor}
      showInteractions={showInteractions}
    >
      {row}
      {excerpt}
    </FeedCardShell>
  );
}

function episodeCode(e: { season: number; episode: number }): string {
  return `S${e.season}E${e.episode}`;
}

// Extracto de la reseña en el feed (R2): 4 líneas como mucho. «Seguir leyendo»
// sale si el recorte visual esconde algo o si el servidor ya lo cortó
// (`excerpt()` termina en «…»). El recorte se mide en el navegador con un
// ResizeObserver, que además avisa en su primera observación; sin él (SSR,
// jsdom) solo cuenta el «…».
function ClampedExcerpt({
  text,
  knownUsernames,
  postHref,
}: {
  text: string;
  knownUsernames: string[];
  postHref: string | null;
}) {
  const t = useTranslations("feed");
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setClamped(el.scrollHeight > el.clientHeight + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  const truncated = clamped || text.endsWith("…");
  return (
    <>
      <p
        ref={ref}
        className="line-clamp-4 font-serif text-[13.5px] leading-normal whitespace-pre-line break-words text-foreground"
      >
        <MentionText text={text} knownUsernames={knownUsernames} />
      </p>
      {truncated && postHref && (
        <Link href={postHref} className="mt-1 inline-block text-[11.5px] font-medium text-accent hover:underline">
          {t("review.readMore")}
        </Link>
      )}
    </>
  );
}
```

En `messages/es.json`, borrar `"moreEpisodes": …` de `feed.review` (y la coma que quede colgando en `metaPages`).

- [ ] **Step 4: Comprobar que pasan, junto a todo lo que toca el feed**

Run: `npx vitest run src/components/social src/lib/social`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint src/components/social/review-card.tsx src/components/social/feed-card src/lib/social/feed.ts`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/social/review-card.tsx src/components/social/review-joint-cards.test.tsx messages/es.json
git commit -m "feat(feed): tarjeta de valoración con el patrón C — serie o episodios, cada uno con su nota"
```

---

### Task 4: e2e, verificación visual, doc e issues

**Files:**
- Modify (solo si fallan): `e2e/feed-tarjetas-por-tipo.spec.ts`, `e2e/social-interaction-targets.spec.ts`, `e2e/posts.spec.ts`
- Modify: `docs/requirements/decisiones.md` (entrada nueva al final)

- [ ] **Step 1: Correr los e2e del feed contra un `next dev` lanzado a mano**

Matar cualquier `next dev` previo del puerto 3000 (`Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`, `Stop-Process -Id <pid>`). Lanzar `npm run dev` en segundo plano y esperar a que responda (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`). El webServer automático de Playwright agota los 120 s.

Run: `npx playwright test e2e/feed-tarjetas-por-tipo.spec.ts e2e/social-interaction-targets.spec.ts e2e/posts.spec.ts`
Expected: PASS. Si un selector buscaba el texto «Comentar» del pie o la caja interior de la reseña, cambiarlo al enlace del icono (`getByRole("link", { name: /Comentar|comentarios?/ })`), que tiene el mismo `href` `/post/[id]`. No relajar aserciones de contenido.

- [ ] **Step 2: Verificación visual**

Con el dev server abierto, revisar en el navegador a 375 px de ancho, en claro y en oscuro: Inicio (una valoración de serie, un post de varios episodios, una reseña de libro), la Actividad del perfil (`hideActor`) y `/post/[id]` de una reseña. Comprobar que la cabecera cabe en una línea (el verbo se trunca con «…» antes de empujar la hora) y que la nota grande no rompe la fila. Hacer captura de cada caso para la PR.

- [ ] **Step 3: Decisión en `decisiones.md`**

Añadir al final de `docs/requirements/decisiones.md`:

```markdown
## 2026-10-05 — Feed: patrón C y nota por episodio en el post diario de series

Las tarjetas «valoró» / «marcó un episodio» desperdiciaban alto (tarjeta + caja interior con
portada de 58 px + fila de pie) y no distinguían valorar la serie de valorar un episodio: el post
diario `watched` llevaba solo la nota del PRIMER episodio junto a «+3 episodios», y parecía la de
los cuatro. Se decidió sobre maquetas (spec `2026-10-05-feed-patron-c-design.md`):

- **Patrón C** para todo el feed: cabecera fina de una línea (el icono de comentarios sustituye al
  pie), lo que se valoró/hizo como título, el valor a la derecha, contenido debajo solo si existe.
  Piezas en `src/components/social/feed-card/`. Se migra por PRs: valoración/reseña primero; hito,
  visionado conjunto y pensamiento después; avances, colección y club al final. Experiencias, fuera.
- **Una nota por episodio**: `getFeed` añade `episodes` (temporada, episodio, título, nota) al post
  `watched`, de la misma consulta `dayWatches` que ya contaba los del día (sin consultas nuevas ni
  esquema; cliente de la petición, no se cachea — regla #437). Un episodio marcado dos veces el
  mismo día cuenta una vez y gana la marca con nota. `episodeCount` desaparece.
- **El verbo dice qué se valoró**: «valoró la serie» frente a «valoró/vio N episodios».
```

- [ ] **Step 4: Issues de lo que queda**

Crear tres issues (cuerpo en un fichero temporal del scratchpad; enlazar la spec en cada uno):

```bash
gh issue create --label "area:social,tipo:deuda,P2" --title "Feed patrón C, PR 2: hito, visionado conjunto y pensamiento" --body-file <tmp>
gh issue create --label "area:social,tipo:deuda,P2" --title "Feed patrón C, PR 3: avances, colección y club" --body-file <tmp>
gh issue create --label "area:social,tipo:deuda,P3" --title "Feed: pasar las tarjetas de experiencias al patrón C" --body-file <tmp>
```

Cada cuerpo: qué tarjetas, la fila correspondiente de la tabla «Tarjeta por tarjeta» de la spec, y que las piezas (`FeedCardShell`, `FeedWorkRow`, `FeedMiniList`) ya existen desde la PR 1. La de PR 2 debe avisar de que el visionado conjunto y el club necesitan un `actorSlot` en `FeedCardShell` (varios avatares o un club en lugar del actor).

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/decisiones.md e2e
git commit -m "docs(feed): decisión del patrón C y nota por episodio"
```
