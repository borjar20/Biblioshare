# Feed — Tarjetas por tipo de evento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada verbo del feed su propia tarjeta — Colección (lista vertical), Avances (timeline por obra con posición y nota pública), Reseña (hero con estrellas) — con reacción por ítem/paso/reseña.

**Architecture:** El feed sigue siendo fan-out on-read. `FeedList` despacha por **verbo** a tres componentes nuevos. La capa de datos amplía `FeedEvent` con la posición de sesión, el % (vía `books.total_pages`), la nota pública (tabla `notes`, tras una política RLS aditiva) y la meta de reseña. La agrupación de `progressed` cambia de día a **obra + ventana de 7 días**.

**Tech Stack:** Next.js (App Router, RSC), Supabase (Postgres + RLS), next-intl, Vitest, Playwright, Tailwind.

## Global Constraints

- **Rama apilada:** `feat/feed-tarjetas-por-tipo` sobre `feat/inicio-feed-agrupado` (PR #300, sin fusionar). No fusionar esta antes que #300; rebase sobre `main` cuando #300 entre.
- **Node v22 para tooling.** El shell abre v20 y rompe Vitest/tsc. `fnm exec --using=22 <cmd>`. Si `fnm exec … npx` da "program not found", invocar el bin JS directo: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit`, `fnm exec --using=22 node node_modules/vitest/vitest.mjs run <spec>`, `fnm exec --using=22 node node_modules/@playwright/test/cli.js test <filtro>`.
- **Migraciones: dev primero (`supabase-dev`), prod al fusionar (`supabase-prod`).** Verificar contra objetos reales (`pg_policies`), NO contra `list_migrations`.
- **Estado vivo = `passes`.** Nunca `library_entries`/`diary_entries`.
- **Privacidad (dura):** la nota **privada** (`progress_sessions.note`) NUNCA se sirve. Solo `notes.body` con `is_public = true` de un perfil visible. La posición pasa a pública (D-B3 de la spec).
- **Un solo `next dev` en :3000.** `test:e2e` reutiliza el que haya.
- **Migración de nombres:** siguiente fecha lógica libre. La última en `supabase/migrations/` es `20260813_feed_targets_can_view.sql` → usar `20260814_...`.
- **Copy en `messages/es.json`** (único locale), vía `i18n-keeper`.
- **Definición de «hecho»** (AGENTS.md): esquema → `data-model.md`; forma → `decisiones.md` (append); pendientes → issues.

Spec: `docs/superpowers/specs/2026-07-29-feed-tarjetas-por-tipo-design.md`.

---

## Estructura de ficheros

**Crear:**
- `supabase/migrations/20260814_notes_public_select.sql` — política SELECT aditiva para notas públicas visibles.
- `src/components/social/spine-cover.tsx` — portada o lomo tipográfico de fallback.
- `src/components/social/collection-card.tsx` — variante A (`added`).
- `src/components/social/progress-timeline-card.tsx` — variante B (`progressed`).
- `src/components/social/spoiler-gate.tsx` — oculta un contenido hasta el clic.
- `src/components/social/review-card.tsx` — variante C (`finished`/`reviewed`/episodios).
- `src/components/social/feed-item.tsx` — despacho por verbo.

**Modificar:**
- `src/lib/social/group-feed-entries.ts` — clave `progressed` por obra + ventana.
- `src/lib/social/group-feed-entries.test.ts` — tests de la ventana.
- `src/lib/social/feed.ts` — servir `position`/`percent`/nota pública (progressed) y `readingDays`/`totalPages` (reseña); tipos de `FeedEvent`.
- `src/components/social/feed-list.tsx` — usar `FeedItem` (despacho por verbo).
- `messages/es.json` — claves nuevas.

**Borrar (Task 8, cuando los 3 nuevos cubran singleton+grupo):**
- `src/components/social/feed-card.tsx`, `src/components/social/feed-group-card.tsx`.

---

## Task 1: Migración — política SELECT de notas públicas

**Files:**
- Create: `supabase/migrations/20260814_notes_public_select.sql`

**Interfaces:**
- Produce: una fila de `notes` con `is_public = true` de un usuario cuyo perfil el viewer puede ver es legible por el viewer. Habilita servir la nota pública en el feed (Task 3).

- [ ] **Step 1: Confirmar el estado de partida en dev**

`mcp__supabase-dev__execute_sql`:
```sql
select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='notes' and cmd='SELECT';
```
Esperado: una sola política `own notes select` (`auth.uid() = user_id`). (Verificado 2026-07-29.)

- [ ] **Step 2: Escribir la migración**

`supabase/migrations/20260814_notes_public_select.sql`:
```sql
-- El feed de tarjetas por tipo (2026-07-29) muestra la nota de un avance SOLO si
-- su fila en `notes` es pública. Hoy `notes` solo tiene `own notes select`
-- (auth.uid() = user_id), así que el viewer no puede leer notas públicas ajenas.
-- Política SELECT ADITIVA (las políticas se combinan con OR): una nota pública es
-- legible por quien puede ver el perfil de su autor — misma puerta de visibilidad
-- (`can_view_profile`) que ya usa el feed para las sesiones y reseñas. La nota
-- privada sigue oculta a todos menos su dueño.
create policy "public notes select"
  on public.notes
  for select
  to authenticated
  using (is_public = true and public.can_view_profile(user_id));
```

- [ ] **Step 3: Aplicar en dev**

`mcp__supabase-dev__apply_migration`, `name: "notes_public_select"`, el SQL de arriba.

- [ ] **Step 4: Verificar contra el objeto real**

```sql
select policyname, qual from pg_policies where schemaname='public' and tablename='notes' and policyname='public notes select';
```
Esperado: una fila con `is_public = true AND can_view_profile(user_id)`.

- [ ] **Step 5: Advisors de seguridad**

`mcp__supabase-dev__get_advisors` `type: security`. Esperado: sin hallazgos nuevos sobre `notes`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260814_notes_public_select.sql
git commit -m "feat(db): notas publicas legibles por perfiles visibles (feed de avances)"
```

---

## Task 2: Agrupación de `progressed` por obra + ventana de 7 días

**Files:**
- Modify: `src/lib/social/group-feed-entries.ts:23-28`
- Test: `src/lib/social/group-feed-entries.test.ts`

**Interfaces:**
- Consume: `FeedEvent`, `FeedEntry` (sin cambios de forma).
- Produce: `progressed` de la misma obra dentro de una ventana de 7 días naturales se agrupa en un `person-group`; sesiones fuera de la ventana quedan en otra tarjeta. `added` intacto (actor+día). Constante `PROGRESS_WINDOW_DAYS = 7`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/lib/social/group-feed-entries.test.ts` (reusa los helpers `ev`/`person` ya existentes en el fichero):
```ts
it("agrupa progressed de la misma obra dentro de 7 días", () => {
  const entries = [
    person(ev({ id: "progress_sessions:a", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
    person(ev({ id: "progress_sessions:b", verb: "progressed", actorId: "x", eventDate: "2026-07-25", itemId: "b1" })),
    person(ev({ id: "progress_sessions:c", verb: "progressed", actorId: "x", eventDate: "2026-07-23", itemId: "b1" })),
  ];
  const out = groupPersonEntries(entries);
  expect(out).toHaveLength(1);
  expect(out[0].source).toBe("person-group");
  if (out[0].source === "person-group") expect(out[0].items).toHaveLength(3);
});

it("NO agrupa progressed de la misma obra separados >7 días", () => {
  const entries = [
    person(ev({ id: "progress_sessions:a", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
    person(ev({ id: "progress_sessions:b", verb: "progressed", actorId: "x", eventDate: "2026-07-10", itemId: "b1" })),
  ];
  const out = groupPersonEntries(entries);
  expect(out).toHaveLength(2);
  expect(out.every((e) => e.source === "person")).toBe(true);
});
```
Mantener el test previo de `progressed` por obra intacto salvo que ahora dos sesiones del mismo día siguen agrupando (sigue cumpliéndose).

- [ ] **Step 2: Ejecutar, ver fallar**

Run: `fnm exec --using=22 node node_modules/vitest/vitest.mjs run src/lib/social/group-feed-entries.test.ts`
Esperado: FALLA (hoy la clave incluye el día, así que sesiones de días distintos NO agrupan).

- [ ] **Step 3: Implementar la ventana**

En `src/lib/social/group-feed-entries.ts`, sustituir `groupKey` y añadir la constante y un helper de bucket por ventana. Como una ventana deslizante no es una clave pura, se agrupa `progressed` por `actor+obra` y luego se **parte** cada bucket en sub-grupos de ≤7 días:

```ts
export const PROGRESS_WINDOW_DAYS = 7;

function day(iso: string): string {
  return iso.slice(0, 10);
}

// Días naturales entre dos fechas ISO (fecha-only o timestamp), sin usar Date
// (Date.now/new Date argless están prohibidos y aquí no hacen falta): se comparan
// los días como enteros epoch/86400.
function dayNumber(iso: string): number {
  const [y, m, d] = day(iso).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// added → actor+día (sin cambios). progressed → actor+obra (la ventana se aplica
// después, partiendo el bucket por huecos > PROGRESS_WINDOW_DAYS).
function groupKey(e: FeedEvent): string {
  if (e.verb === "added") return `added:${e.actorId}:${day(e.eventDate)}`;
  return `progressed:${e.actorId}:${e.itemType}:${e.itemId}`;
}
```
> `Date.UTC(...)` con argumentos explícitos SÍ está permitido (lo prohibido es `Date.now()`/`new Date()` sin args). Sirve solo para restar días.

Y en `groupPersonEntries`, tras rellenar `buckets`, partir los buckets de `progressed` por la ventana antes de emitir. Reescribir el bucle de emisión así:

```ts
  const result: FeedEntry[] = [...passthrough];
  for (const [key, items] of buckets) {
    // Cada bucket ya es de un solo verbo (el prefijo de la clave lo garantiza).
    // Los de progressed se parten en sub-grupos cuya distancia entre sesiones
    // consecutivas no supere PROGRESS_WINDOW_DAYS; added es un único sub-grupo.
    const isProgressed = key.startsWith("progressed:");
    const sorted = [...items].sort((a, b) =>
      a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1,
    );
    const chunks: FeedEvent[][] = [];
    for (const ev of sorted) {
      const last = chunks[chunks.length - 1];
      if (
        isProgressed &&
        last &&
        dayNumber(last[last.length - 1].eventDate) - dayNumber(ev.eventDate) > PROGRESS_WINDOW_DAYS
      ) {
        chunks.push([ev]); // hueco mayor que la ventana → nuevo sub-grupo
      } else if (last && (isProgressed || key.startsWith("added:"))) {
        last.push(ev);
      } else {
        chunks.push([ev]);
      }
    }
    for (const chunk of chunks) {
      if (chunk.length === 1) {
        const e = chunk[0];
        result.push({ source: "person", id: e.id, eventDate: e.eventDate, event: e });
        continue;
      }
      const newest = chunk[0]; // ya ordenado desc
      result.push({
        source: "person-group",
        id: `group:${key}:${newest.id}`,
        eventDate: newest.eventDate,
        verb: newest.verb as PersonGroupEntry["verb"],
        actor: {
          id: newest.actorId,
          username: newest.actorUsername,
          displayName: newest.actorDisplayName,
          avatarUrl: newest.actorAvatarUrl,
        },
        items: chunk,
      });
    }
  }
```
Mantener el `result.sort(...)` final por `eventDate` desc y el import de tipos. Borrar el bloque de emisión anterior.

- [ ] **Step 4: Ejecutar los tests**

Run: `fnm exec --using=22 node node_modules/vitest/vitest.mjs run src/lib/social/group-feed-entries.test.ts`
Esperado: PASS (los previos + los 2 nuevos).

- [ ] **Step 5: tsc**

Run: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit`
Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/group-feed-entries.ts src/lib/social/group-feed-entries.test.ts
git commit -m "feat(feed): progressed agrupa por obra en ventana de 7 dias (timeline)"
```

---

## Task 3: `feed.ts` sirve posición, %, y nota pública en `progressed`

**Files:**
- Modify: `src/lib/social/feed.ts` (tipo `FeedEvent` L54; select progressed L241-242; push progressed L472-501; select books L368; batch nuevo a `notes`)

**Interfaces:**
- Consume: la política RLS de Task 1.
- Produce: `FeedEvent.progress` amplía a `{ durationMinutes: number | null; page: number | null; percent: number | null; note: { body: string; isSpoiler: boolean } | null }`.

- [ ] **Step 1: Ampliar el tipo `FeedEvent.progress`**

`src/lib/social/feed.ts:54`, sustituir:
```ts
  progress: { durationMinutes: number | null } | null;
```
por:
```ts
  progress: {
    durationMinutes: number | null;
    page: number | null;      // position.page de la sesión (libros)
    percent: number | null;   // page / books.total_pages * 100, si ambos existen
    note: { body: string; isSpoiler: boolean } | null; // nota PÚBLICA (notes.is_public)
  } | null;
```

- [ ] **Step 2: Pedir `position` en el select de sesiones**

`feed.ts:242`, cambiar el select de `progress_sessions` para incluir `position` (y ya trae `id`):
```ts
            .select(
              "id, user_id, pass_id, session_date, duration_minutes, created_at, position, passes!inner(item_type, item_id)"
            )
```

- [ ] **Step 3: Pedir `total_pages` en el select de libros**

`feed.ts:368`, cambiar:
```ts
      ? supabase.from("books").select("id, title, author, cover_url").in("id", [...idsByType.book])
```
por:
```ts
      ? supabase.from("books").select("id, title, author, cover_url, total_pages").in("id", [...idsByType.book])
```
Y donde se construye `catalogByKey` para libros, guardar también `totalPages: r.total_pages` (ampliar el tipo del Map con `totalPages?: number | null`). Movies/series no tienen y quedan `null`.

- [ ] **Step 4: Batch de notas públicas por `session_id`**

Tras obtener `progressedRows`, añadir un fetch batch (mismo patrón que el resto de `getFeed`). Los `progressedRows[i].id` son los `session_id`:
```ts
  const sessionIds = progressedRows.map((r) => r.id);
  const { data: publicNotes, error: notesError } = sessionIds.length
    ? await supabase
        .from("notes")
        .select("session_id, body, is_spoiler")
        .in("session_id", sessionIds)
        .eq("is_public", true) // defensa en profundidad + coherencia en el feed propio
        .order("created_at", { ascending: false })
    : { data: [] as { session_id: string | null; body: string | null; is_spoiler: boolean | null }[], error: null };
  if (notesError) throw notesError;
  // Una nota por sesión: la más reciente pública (el order desc + first-wins).
  const noteBySession = new Map<string, { body: string; isSpoiler: boolean }>();
  for (const n of publicNotes ?? []) {
    if (!n.session_id || n.body == null || noteBySession.has(n.session_id)) continue;
    noteBySession.set(n.session_id, { body: n.body, isSpoiler: n.is_spoiler ?? false });
  }
```

- [ ] **Step 5: Rellenar `progress` en el push de `progressed`**

En el bucle `for (const r of progressedRows)` (push ~L497), sustituir:
```ts
      progress: { durationMinutes: r.duration_minutes },
```
por:
```ts
      progress: (() => {
        const pos = (r.position ?? {}) as { page?: number };
        const page = typeof pos.page === "number" ? pos.page : null;
        const catalog = catalogByKey.get(`${it.itemType}:${it.itemId}`);
        const total = catalog?.totalPages ?? null;
        const percent = page != null && total ? Math.min(100, Math.round((page / total) * 100)) : null;
        return {
          durationMinutes: r.duration_minutes,
          page,
          percent,
          note: noteBySession.get(r.id) ?? null,
        };
      })(),
```
> `it` y `catalog` ya están en scope en ese bucle (se resuelven arriba). Si `catalog` se declara con otro nombre, usar el existente.

- [ ] **Step 6: Verificar que ningún otro sitio rompe por el tipo ampliado**

Run: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit`
Esperado: PASS (los consumidores actuales de `progress` solo leen `durationMinutes`; los campos nuevos son aditivos). Si algún test de `feed` fija la forma de `progress`, actualizarlo al shape nuevo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/feed.ts
git commit -m "feat(feed): progressed sirve pagina, %, y nota publica (honra is_public)"
```

---

## Task 4: `feed.ts` sirve la meta de reseña (días, páginas)

**Files:**
- Modify: `src/lib/social/feed.ts` (tipo `FeedEvent`; select finished L264-265; push diary ~L515-538)

**Interfaces:**
- Produce: `FeedEvent` gana `reviewMeta: { readingDays: number | null; totalPages: number | null } | null` (solo en eventos `finished`/`rated`/`reviewed`).

- [ ] **Step 1: Ampliar el tipo**

En `FeedEvent`, añadir:
```ts
  reviewMeta: { readingDays: number | null; totalPages: number | null } | null;
```
Poner `reviewMeta: null` en TODOS los `events.push({...})` que hoy no lo llevan (added, progressed, episodios) para que el tipo cierre. (tsc te dirá cuáles.)

- [ ] **Step 2: Pedir `started_on` en el select de finished**

`feed.ts:265`, cambiar:
```ts
            .select("id, user_id, item_type, item_id, finished_on, rating")
```
por:
```ts
            .select("id, user_id, item_type, item_id, finished_on, started_on, rating")
```

- [ ] **Step 3: Rellenar `reviewMeta` en el push de diary**

En el bucle `for (const r of diaryRows)`, en el `events.push({...})`, añadir:
```ts
      reviewMeta: {
        readingDays:
          r.started_on && r.finished_on
            ? Math.max(1, Math.round((Date.parse(r.finished_on) - Date.parse(r.started_on)) / 86_400_000) + 1)
            : null,
        totalPages: catalogByKey.get(`${r.item_type}:${r.item_id}`)?.totalPages ?? null,
      },
```
> `Date.parse(<string>)` con argumento explícito está permitido (lo prohibido es `Date.now()`/`new Date()` sin args). `+1` para contar inclusive (empezar y terminar el mismo día = 1 día).

- [ ] **Step 4: tsc**

Run: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/feed.ts
git commit -m "feat(feed): finished sirve dias de lectura y paginas para la tarjeta de resena"
```

---

## Task 5: `SpineCover` + `CollectionCard` (variante A)

**Files:**
- Create: `src/components/social/spine-cover.tsx`
- Create: `src/components/social/collection-card.tsx`

**Interfaces:**
- Consume: `PersonGroupEntry`, `FeedEvent`, `QuickAddButton`, `quickAddManyToLibrary`, `ReviewInteractions`, `itemHref`.
- Produce: `SpineCover({ coverUrl, title, width })`; `CollectionCard({ entry, viewerLoggedIn })` para `added` (1..N).

- [ ] **Step 1: `SpineCover`**

`src/components/social/spine-cover.tsx`:
```tsx
import Image from "next/image";

// Portada real o, si falta, un "lomo" tipográfico (título en serif sobre surface-2)
// — el mockup exige que las portadas nunca queden vacías.
export function SpineCover({
  coverUrl,
  title,
  className = "",
}: {
  coverUrl: string | null;
  title: string;
  className?: string;
}) {
  if (coverUrl) {
    return (
      <div className={`relative overflow-hidden rounded bg-surface-muted shadow-cover ${className}`}>
        <Image src={coverUrl} alt={title} fill sizes="60px" className="object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`grid place-content-center overflow-hidden rounded border border-border bg-surface-muted p-1.5 text-center ${className}`}
    >
      <span className="line-clamp-4 font-serif text-[10px] leading-tight font-semibold text-foreground">
        {title}
      </span>
    </div>
  );
}
```
> Verificar que `bg-surface-muted` existe (lo usa `feed-card.tsx`). El fallback usa aspecto por la clase que le pase el consumidor (`aspect-[2/3]`).

- [ ] **Step 2: `CollectionCard`**

`src/components/social/collection-card.tsx` — misma cabecera/estilo que `FeedGroupCard`, pero lista vertical con autor, `SpineCover`, reacción por ítem y `QuickAddButton`, badge "Colección":
```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { QuickAddButton } from "@/components/library/quick-add-button";
import { quickAddManyToLibrary } from "@/lib/library/quick-add-actions";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";

export function CollectionCard({
  entry,
  viewerLoggedIn,
}: {
  entry: PersonGroupEntry; // verb === "added"
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = entry.actor.displayName || entry.actor.username;

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={30} />
        <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
          <span className="text-muted-foreground">{t("grouped.addedCount", { count: entry.items.length })}</span>
        </p>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
          {t("kind.collection")}
        </span>
      </div>

      <div className="flex flex-col">
        {entry.items.map((item) => (
          <div key={item.id} className="flex gap-3 border-t border-border py-3 first:border-t-0">
            <Link href={itemHref(item.itemType, item.itemId)} className="w-[46px] shrink-0">
              <SpineCover coverUrl={item.itemCoverUrl} title={item.itemTitle} className="aspect-[2/3] w-[46px]" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={itemHref(item.itemType, item.itemId)} className="font-serif text-[13.5px] leading-tight font-semibold hover:underline">
                {item.itemTitle}
              </Link>
              {item.itemSubtitle && <span className="text-[11px] text-faint">{item.itemSubtitle}</span>}
              {item.interactionTarget && (
                <ReviewInteractions
                  targetType={item.interactionTarget.targetType}
                  targetId={item.interactionTarget.targetId}
                  reactionCount={item.reactionCount}
                  viewerReacted={item.viewerReacted}
                  commentCount={item.commentCount}
                  comments={item.comments}
                  viewerLoggedIn={viewerLoggedIn}
                />
              )}
            </div>
            <div className="shrink-0 self-start">
              <QuickAddButton itemType={item.itemType} itemId={item.itemId} />
            </div>
          </div>
        ))}
      </div>

      {entry.items.length > 1 && (
        <form action={async () => { await quickAddManyToLibrary(entry.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId }))); }}>
          <button type="submit" className="w-full rounded-lg border border-border py-2 text-[12.5px] font-semibold text-accent hover:bg-surface-muted">
            {t("grouped.saveAllToQueue", { count: entry.items.length })}
          </button>
        </form>
      )}
      <span suppressHydrationWarning className="self-end font-mono text-[10px] text-muted-foreground">{timeAgo(entry.eventDate, tTime)}</span>
    </article>
  );
}
```
> Verificar `text-faint`/`text-muted-foreground` en el theme (usados en `feed-card.tsx`). Si `text-faint` no existe, usar `text-muted-foreground`.

- [ ] **Step 3: tsc**

Run: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit`. Falla por claves i18n inexistentes SOLO en runtime, no en tsc — así que debe compilar. Añadir de momento `feed.kind.collection` a `messages/es.json` (Task 9 completa el resto) para no romper el render en la e2e posterior.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/spine-cover.tsx src/components/social/collection-card.tsx messages/es.json
git commit -m "feat(feed): tarjeta Coleccion (lista vertical, lomo tipografico, add por item)"
```

---

## Task 6: `ProgressTimelineCard` + `SpoilerGate` (variante B)

**Files:**
- Create: `src/components/social/spoiler-gate.tsx`
- Create: `src/components/social/progress-timeline-card.tsx`

**Interfaces:**
- Consume: `PersonGroupEntry` (verb `progressed`), `FeedEvent.progress` (page/percent/note), `ReviewInteractions`.
- Produce: timeline vertical con reacción por paso; nota pública tras `SpoilerGate` si `isSpoiler`.

- [ ] **Step 1: `SpoilerGate`**

`src/components/social/spoiler-gate.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

// Oculta su contenido hasta el clic. Solo UI: el body ya vino del servidor (es
// una nota PÚBLICA), pero si está marcada como spoiler no se pinta de entrada.
export function SpoilerGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("feed");
  const [shown, setShown] = useState(false);
  if (shown) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="w-full rounded-md border border-dashed border-border bg-surface-muted px-3 py-2 text-left font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground"
    >
      {t("progress.showSpoiler")}
    </button>
  );
}
```

- [ ] **Step 2: `ProgressTimelineCard`**

`src/components/social/progress-timeline-card.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { SpoilerGate } from "./spoiler-gate";
import { itemHref } from "@/lib/catalog/item-href";

export function ProgressTimelineCard({
  entry,
  viewerLoggedIn,
}: {
  entry: PersonGroupEntry; // verb === "progressed", items = pasos desc
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = entry.actor.displayName || entry.actor.username;
  const work = entry.items[0];

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={30} />
        <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
          <span className="text-muted-foreground">{t("grouped.progressedIn", { title: "" })}</span>{" "}
          <Link href={itemHref(work.itemType, work.itemId)} className="font-serif font-semibold hover:underline">{work.itemTitle}</Link>
        </p>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
          {t("kind.progress")}
        </span>
      </div>

      <div className="flex flex-col">
        {entry.items.map((step, i) => (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-accent/20" />
              {i < entry.items.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-[12.5px] text-foreground">
                {step.progress?.page != null
                  ? t("progress.reachedPage", { page: step.progress.page })
                  : step.episode
                    ? `S${step.episode.season}E${step.episode.episode}`
                    : t("minutesLogged", { count: step.progress?.durationMinutes ?? 0 })}
                {step.progress?.percent != null && (
                  <span className="ml-1.5 font-mono text-accent">{step.progress.percent}%</span>
                )}
              </p>
              {step.progress?.note && (
                <div className="mt-1.5">
                  {step.progress.note.isSpoiler ? (
                    <SpoilerGate>
                      <p className="border-l-2 border-border pl-3 font-serif text-[12.5px] leading-relaxed text-muted-foreground">{step.progress.note.body}</p>
                    </SpoilerGate>
                  ) : (
                    <p className="border-l-2 border-border pl-3 font-serif text-[12.5px] leading-relaxed text-muted-foreground">{step.progress.note.body}</p>
                  )}
                </div>
              )}
              {step.interactionTarget && (
                <div className="mt-1.5">
                  <ReviewInteractions
                    targetType={step.interactionTarget.targetType}
                    targetId={step.interactionTarget.targetId}
                    reactionCount={step.reactionCount}
                    viewerReacted={step.viewerReacted}
                    commentCount={step.commentCount}
                    comments={step.comments}
                    viewerLoggedIn={viewerLoggedIn}
                  />
                </div>
              )}
              <span suppressHydrationWarning className="mt-1 block font-mono text-[9.5px] text-faint">{timeAgo(step.eventDate, tTime)}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
```
> `ring-accent/20` requiere que `accent` sea color de Tailwind; si el proyecto usa vars CSS y no permite `/20`, usar una clase equivalente ya presente (grep `ring-` en componentes). Verificar `t("minutesLogged")` existe (lo usa `feed-card.tsx`).

- [ ] **Step 3: tsc + añadir claves mínimas a es.json**

Añadir a `messages/es.json`: `feed.kind.progress`, `feed.progress.reachedPage` (`"Llegó a la pág. {page}"`), `feed.progress.showSpoiler` (`"Mostrar spoiler"`). Run tsc → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/spoiler-gate.tsx src/components/social/progress-timeline-card.tsx messages/es.json
git commit -m "feat(feed): tarjeta Avances (timeline con posicion, % y nota publica)"
```

---

## Task 7: `ReviewCard` (variante C)

**Files:**
- Create: `src/components/social/review-card.tsx`

**Interfaces:**
- Consume: `FeedEvent` (verb finished/rated/reviewed/watchedEpisode), `RatingDots`, `ReviewInteractions`, `SpineCover`.
- Produce: `ReviewCard({ event, viewerLoggedIn, hideActor? })`.

- [ ] **Step 1: `ReviewCard`**

`src/components/social/review-card.tsx` (basarse en `feed-card.tsx` para el layout de un evento, pero con hero de reseña, badge "Finalizado", estrellas, meta y UNA fila de reacción):
```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";

export function ReviewCard({
  event,
  viewerLoggedIn,
  hideActor = false,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = event.actorDisplayName || event.actorUsername;
  const meta = [
    event.itemSubtitle,
    event.reviewMeta?.readingDays != null ? t("review.metaDays", { count: event.reviewMeta.readingDays }) : null,
    event.reviewMeta?.totalPages != null ? t("review.metaPages", { count: event.reviewMeta.totalPages }) : null,
    event.episode ? `S${event.episode.season}E${event.episode.episode}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {!hideActor && (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
            {t("kind.review")}
          </span>
        </div>
      )}

      <div className="flex gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <Link href={itemHref(event.itemType, event.itemId)} className="w-[58px] shrink-0">
          <SpineCover coverUrl={event.itemCoverUrl} title={event.itemTitle} className="aspect-[2/3] w-[58px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.06em] uppercase text-green">
            <span className="h-1.5 w-1.5 rounded-full bg-green" />{t("review.finished")}
          </span>
          <Link href={itemHref(event.itemType, event.itemId)} className="mt-1 block font-serif text-[15px] leading-tight font-semibold hover:underline">
            {event.itemTitle}
          </Link>
          {event.rating != null && <div className="mt-2"><RatingDots value={event.rating} /></div>}
          {meta && <p className="mt-1.5 font-mono text-[10px] text-faint">{meta}</p>}
        </div>
      </div>

      {event.reviewExcerpt && (
        <p className="border-l-2 border-accent pl-3.5 font-serif text-[14px] leading-relaxed">{event.reviewExcerpt}</p>
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
      {hideActor && (
        <span suppressHydrationWarning className="self-end font-mono text-[10px] text-muted-foreground">{timeAgo(event.eventDate, tTime)}</span>
      )}
    </article>
  );
}
```
> Verificar en el theme: `text-green`/`bg-green` (el mockup usa un verde para "Finalizado"; grep `green` en `globals.css`/tailwind config — si el token es otro, usarlo). `RatingDots` props: confirmar `value` (lo usa `feed-card.tsx`).

- [ ] **Step 2: tsc + claves mínimas es.json**

Añadir `feed.kind.review`, `feed.review.finished` (`"Finalizado"`), `feed.review.metaDays` (`"{count, plural, one {# día} other {# días}}"`), `feed.review.metaPages` (`"{count} pág."`). Run tsc → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/social/review-card.tsx messages/es.json
git commit -m "feat(feed): tarjeta Resena (hero, estrellas, meta dias/paginas)"
```

---

## Task 8: Despacho por verbo en `FeedList` y baja de los componentes viejos

**Files:**
- Create: `src/components/social/feed-item.tsx`
- Modify: `src/components/social/feed-list.tsx:78-84`
- Delete: `src/components/social/feed-card.tsx`, `src/components/social/feed-group-card.tsx`

**Interfaces:**
- Consume: `FeedEntry` (person/person-group/club), los tres componentes nuevos, `ClubFeedCard`.
- Produce: `FeedItem({ entry, viewerLoggedIn })` que elige por verbo. `FeedList` lo usa para cada entrada.

- [ ] **Step 1: `FeedItem` (despacho por verbo)**

`src/components/social/feed-item.tsx`:
```tsx
import type { FeedEntry } from "@/lib/social/feed";
import { ClubFeedCard } from "./club-feed-card";
import { CollectionCard } from "./collection-card";
import { ProgressTimelineCard } from "./progress-timeline-card";
import { ReviewCard } from "./review-card";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";

export function FeedItem({ entry, viewerLoggedIn }: { entry: FeedEntry; viewerLoggedIn: boolean }) {
  if (entry.source === "club") return <ClubFeedCard event={entry.event} />;

  // Un evento singleton se envuelve como grupo de 1 para las variantes A/B, que
  // ya manejan items.length === 1 (sin pie "Guardar los N", timeline de 1 paso).
  if (entry.source === "person-group") {
    return entry.verb === "added"
      ? <CollectionCard entry={entry} viewerLoggedIn={viewerLoggedIn} />
      : <ProgressTimelineCard entry={entry} viewerLoggedIn={viewerLoggedIn} />;
  }

  // source === "person": elegir por verbo del evento.
  const e = entry.event;
  if (e.verb === "added" || e.verb === "progressed") {
    const asGroup: PersonGroupEntry = {
      source: "person-group",
      id: entry.id,
      eventDate: entry.eventDate,
      verb: e.verb,
      actor: { id: e.actorId, username: e.actorUsername, displayName: e.actorDisplayName, avatarUrl: e.actorAvatarUrl },
      items: [e],
    };
    return e.verb === "added"
      ? <CollectionCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} />
      : <ProgressTimelineCard entry={asGroup} viewerLoggedIn={viewerLoggedIn} />;
  }
  // finished / rated / reviewed / watchedEpisode → Reseña
  return <ReviewCard event={e} viewerLoggedIn={viewerLoggedIn} />;
}
```

- [ ] **Step 2: `FeedList` usa `FeedItem`**

En `src/components/social/feed-list.tsx`, sustituir el `.map(...)` ternario por:
```tsx
      {events.map((entry) => (
        <FeedItem key={entry.id} entry={entry} viewerLoggedIn={viewerLoggedIn} />
      ))}
```
Cambiar imports: quitar `FeedCard`/`ClubFeedCard`, añadir `import { FeedItem } from "./feed-item";`.

- [ ] **Step 3: Buscar otros usos de `FeedCard` antes de borrarlo**

Run: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit` tras borrar, pero antes: `grep -rn "feed-card\|FeedCard\|feed-group-card\|FeedGroupCard" src`. `FeedCard` se usa además en el perfil ("Reseñas recientes", con `hideActor`). Sustituir ESE uso por `ReviewCard` con `hideActor` (misma prop). Migrar cada call-site antes de borrar los ficheros.

- [ ] **Step 4: Borrar los componentes viejos**

```bash
git rm src/components/social/feed-card.tsx src/components/social/feed-group-card.tsx
```

- [ ] **Step 5: tsc + suite**

Run: `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit` → PASS.
Run: `fnm exec --using=22 node node_modules/vitest/vitest.mjs run` → toda la suite verde (si algún test importaba `FeedCard`/`FeedGroupCard`, actualizarlo a `ReviewCard`/`FeedItem`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(feed): despacho por verbo (FeedItem) y baja de FeedCard/FeedGroupCard"
```

---

## Task 9: Claves i18n

**Files:**
- Modify: `messages/es.json`

**Interfaces:**
- Produce claves (algunas ya sembradas en Tasks 5-7; consolidar y verificar): `feed.kind.collection/progress/review`, `feed.progress.reachedPage`, `feed.progress.showSpoiler`, `feed.review.finished`, `feed.review.metaDays`, `feed.review.metaPages`.

- [ ] **Step 1: Consolidar y validar (agente `i18n-keeper`)**

Delegar en `i18n-keeper`: verificar que TODAS las claves usadas por `collection-card`, `progress-timeline-card`, `spoiler-gate`, `review-card` existen en `messages/es.json`, con ICU correcto y placeholders exactos (`count`, `page`). Textos ES:

| Clave | ES |
|---|---|
| `feed.kind.collection` | `Colección` |
| `feed.kind.progress` | `Avances` |
| `feed.kind.review` | `Reseña` |
| `feed.progress.reachedPage` | `Llegó a la pág. {page}` |
| `feed.progress.showSpoiler` | `Mostrar spoiler` |
| `feed.review.finished` | `Finalizado` |
| `feed.review.metaDays` | `{count, plural, one {# día} other {# días}}` |
| `feed.review.metaPages` | `{count} pág.` |

- [ ] **Step 2: Validar JSON + tsc**

`node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"` y `fnm exec --using=22 node node_modules/typescript/bin/tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "i18n: claves de las tarjetas por tipo del feed"
```

---

## Task 10: e2e, QA, prod, docs, issues

**Files:**
- Create: `e2e/feed-tarjetas-por-tipo.spec.ts`
- Modify: `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/requirements/backlog.md`

- [ ] **Step 1: e2e (Playwright, runtime real)**

Escribir `e2e/feed-tarjetas-por-tipo.spec.ts` siguiendo el patrón del suite (login/seed como `e2e/inicio-feed-agrupado.spec.ts`). Casos, SEMBRANDO datos como haga el suite:
1. `added` de un followee → tarjeta Colección con lista vertical, autor y badge "Colección".
2. `progressed` de una obra en varios días → tarjeta Avances (timeline) con "Llegó a la pág. N" y % cuando hay `total_pages`.
3. **Privacidad (crítico):** una sesión con nota **privada** (`notes.is_public = false`) NO muestra su texto en el DOM; una nota **pública** (`is_public = true`) SÍ. Una nota pública **spoiler** está oculta hasta pulsar "Mostrar spoiler".
4. `finished`+reseña → tarjeta Reseña con "Finalizado", estrellas, meta y texto.

Run: `fnm exec --using=22 node node_modules/@playwright/test/cli.js test feed-tarjetas-por-tipo`. Parar el dev server y liberar :3000 al acabar. Si algo no puede correr, decirlo — no fingir PASS.

- [ ] **Step 2: QA (si hay tooling)**

`qa-verifier` para revisar las tres tarjetas en navegador real (móvil y PC). Si sus herramientas no están cableadas (como pasó en #300), la e2e del Step 1 es la verificación de runtime.

- [ ] **Step 3: Migración a PROD**

Con todo verde en dev: aplicar `20260814_notes_public_select.sql` en `supabase-prod` (`mcp__supabase-prod__apply_migration`). Verificar con el `select … from pg_policies` contra prod. **Irreversible-ish: confirmar antes.** (Nota: solo esta feature añade RLS; el enum/función de #300 ya está en prod.)

- [ ] **Step 4: Docs**

- `data-model.md`: `notes` gana la política `public notes select` (`is_public AND can_view_profile`); el feed sirve `progress_sessions.position` y `notes.body` público. Fecha de verificación.
- `decisiones.md` (append): (D-B1) `progressed` agrupa por obra+ventana 7 d; (D-B3) la posición de lectura pasa a pública en el feed y el feed honra `is_public` de `notes` vía nueva política RLS; (D-C1) una sola reacción en la tarjeta de reseña; despacho por verbo.
- `backlog.md`: marcar si hay ítem; si no, no inventar.

- [ ] **Step 5: Issues**

`mcp__github__create_issue`:
1. **Obra con avances partida entre tandas de paginación** (familia #295, específico del timeline por obra): una obra con sesiones a ambos lados del corte de página sale como dos timelines. Repro: obra con muchas sesiones cruzando `pageSize`.
2. Cualquier parcial/sospecha que surja.

- [ ] **Step 6: Commit docs**

```bash
git add docs/requirements/ e2e/
git commit -m "test(e2e)+docs(feed): tarjetas por tipo, privacidad de notas y cierre documental"
```

---

## Self-Review (autor del plan)

- **Cobertura de spec:** D-DISPATCH → Task 8. A → Task 5. B (grouping) → Task 2; B (datos/privacidad) → Task 1+3; B (UI) → Task 6. C → Task 4 (datos) + Task 7 (UI). i18n → Task 9. Migración RLS notas → Task 1 (dev) + Task 10 (prod). Docs/issues → Task 10. ✅
- **Placeholders:** sin TBD; código real inline. Las "notas de verificación" (tokens de color/clases Tailwind, existencia de claves, call-sites de `FeedCard`) son comprobaciones contra el repo real, no placeholders.
- **Consistencia de tipos:** `FeedEvent.progress` ampliado (Task 3) y consumido en Task 6; `reviewMeta` (Task 4) consumido en Task 7; `PersonGroupEntry` reusado; `SpineCover`/`SpoilerGate` definidos antes de usarse. `FeedItem` (Task 8) envuelve singletons como grupo de 1 — `CollectionCard`/`ProgressTimelineCard` soportan `items.length === 1` por construcción.
- **Privacidad:** la nota privada nunca se selecciona (Task 3 filtra `is_public = true` + RLS Task 1); test dedicado en Task 10 Step 1 caso 3.
- **Sin Date prohibido:** se usa `Date.UTC(...)`/`Date.parse(<str>)` con argumentos (permitido), nunca `Date.now()`/`new Date()` sin args.
