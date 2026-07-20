# Registrar sesión v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la hoja de registrar sesión de página completa a modal interceptado (pantalla completa en móvil, centrado en pc) y rediseñar su contenido para libro y serie según el mockup `Paper - Registrar sesión v2.html`.

**Architecture:** Un slot paralelo `@modal` en el layout raíz con una ruta interceptada `(.)sesion/[passId]` monta la misma hoja que la ruta directa; la carga de datos se extrae a `src/lib/sessions/load-context.ts` y la comparten ambas entradas. `addSession` deja de hacer `redirect()` y devuelve estado, que es lo que permite al modal cerrarse en sitio o encadenar la hoja de cierre de pase.

**Tech Stack:** Next.js 16.2.10 (App Router, parallel + intercepting routes), React 19, TypeScript, Tailwind, next-intl, Supabase, Vitest (lógica pura), Playwright (flujos).

**Spec:** [`2026-07-20-registrar-sesion-v2-design.md`](../specs/2026-07-20-registrar-sesion-v2-design.md)

## Global Constraints

- **Este ciclo NO toca esquema.** Ninguna migración, ningún cambio en `docs/requirements/data-model.md`. Todo lo necesario (`series_episodes.still_url`, `series_episodes.title`) ya está en producción.
- **Serie no lleva duración ni cronómetro** (§7.14). `addSession` ya ignora `durationMinutes` para series en el servidor (`actions.ts:61-62`); eso no se toca.
- **La nota sale de la UI pero el servidor la sigue aceptando.** El bloque `if (note)` de `actions.ts:174-188` **no se borra**: el ciclo de notas lo recableará. Solo desaparecen los campos del formulario.
- **Nada de `setState` dentro de `useEffect`** — la regla `react-hooks/set-state-in-effect` está activa. Para reaccionar a un cambio de props/estado, usar el patrón de ajuste durante el render que ya emplean `close-pass-sheet.tsx:51-56` y `edition-strip.tsx`. Navegar (`router.back()`, `router.push()`) dentro de un efecto **sí** es válido: no es `setState`.
- **Todo el texto visible pasa por next-intl.** Claves nuevas al namespace `session` de `messages/es.json`. No hay literales en JSX.
- **Alias de imports:** `@/*` → `./src/*`.
- **Un solo `next dev`, en el puerto 3000.** `npm run test:e2e` reutiliza el que ya haya; no levantar un segundo.
- Comandos: `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run lint`, `npm run build`.
- **Vitest necesita Node 22**: el shell arranca en 20.9. Activar con `fnm use 22` antes de correr `npm test`.

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `src/lib/sessions/load-context.ts` | **Crear.** Toda la carga de datos de la hoja (pase activo, obra, episodios, edición, total). La consumen las dos entradas. |
| `src/lib/sessions/page-stepper.ts` | **Crear.** Lógica pura del stepper de página: clamp y salto. |
| `src/lib/sessions/episode-grid.ts` | **Crear.** Lógica pura de la rejilla: índice del primer episodio sin ver. |
| `src/app/layout.tsx` | **Modificar.** Añadir el slot `modal`. |
| `src/app/@modal/default.tsx` | **Crear.** Devuelve `null`. |
| `src/app/@modal/(.)sesion/[passId]/page.tsx` | **Crear.** La hoja dentro de `SessionModal`. |
| `src/app/sesion/[passId]/page.tsx` | **Modificar.** Adelgaza a consumir `loadSessionContext`. |
| `src/components/session/session-modal.tsx` | **Crear.** Cáscara `<dialog>`: fullscreen móvil / centrado pc. |
| `src/components/session/session-sheet.tsx` | **Crear.** El formulario (sustituye a `src/app/sesion/[passId]/session-form.tsx`). |
| `src/components/session/session-hero.tsx` | **Crear.** Cabecera con portada y tinte por tipo. |
| `src/components/session/book-progress-field.tsx` | **Crear.** Rail + stepper + duración. |
| `src/components/session/series-episode-grid.tsx` | **Crear.** Tira de temporadas + rejilla con scroll. |
| `src/lib/sessions/actions.ts` | **Modificar.** `addSession` devuelve estado en vez de redirigir. |
| `messages/es.json` | **Modificar.** Claves nuevas del namespace `session`. |
| `e2e/registrar-sesion-v2.spec.ts` | **Crear.** Los 5 escenarios de la spec §7. |

`src/app/sesion/[passId]/session-form.tsx` y `session-timer.tsx` se **mueven** a `src/components/session/`. `session-timer.tsx` se mueve tal cual, sin cambios de lógica.

---

### Task 1: Extraer la carga de datos a `load-context.ts`

Refactor puro con un ensanchado: la proyección de episodios pasa a incluir `title` y `stillUrl`, que `getEpisodeData` **ya devuelve** (`EpisodeRow` en `src/lib/series/get-episode-data.ts:26-37`) y hoy se descartan en `page.tsx:113-119`. Cero queries nuevas.

**Files:**
- Create: `src/lib/sessions/load-context.ts`
- Modify: `src/app/sesion/[passId]/page.tsx:1-135` (sustituir el cuerpo de carga por la llamada)

**Interfaces:**
- Consumes: `getActivePass`, `getEditions`, `primaryEdition`, `ensureSeriesEpisodes`, `getEpisodeData`, `parsePosition` (todos ya existen)
- Produces:
  - `type SessionEpisode = { episode: number; title: string | null; stillUrl: string | null; watched: boolean }`
  - `type SessionSeason = { season: number; episodes: SessionEpisode[] }`
  - `type SessionContext = { passId, itemType: "book" | "series", itemId, title: string, author: string | null, coverUrl: string | null, position: Position, status: MediaStatus, total: number | null, seriesEpisodes?: SessionSeason[] }`
  - `async function loadSessionContext(passId: string): Promise<SessionContext>`

- [ ] **Step 1: Crear `src/lib/sessions/load-context.ts`**

Es el cuerpo de `src/app/sesion/[passId]/page.tsx:39-131` movido literalmente, con la proyección de episodios ensanchada. Los `notFound()`/`redirect()` se conservan dentro: son válidos en una función llamada desde un Server Component.

```ts
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { parsePosition, type Position } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getActivePass } from "@/lib/passes/get-passes";
import { getEditions } from "@/lib/editions/get-editions";
import { primaryEdition } from "@/lib/editions/edition-label";
import { ensureSeriesEpisodes } from "@/lib/library/ensure-series-episodes";
import { getEpisodeData } from "@/lib/series/get-episode-data";

// Un episodio tal como lo pinta la rejilla de la hoja. `title` y `stillUrl`
// salen de series_episodes vía getEpisodeData — no hay query extra: la ficha
// ya los traía y esta proyección los descartaba.
export type SessionEpisode = {
  episode: number;
  title: string | null;
  stillUrl: string | null;
  watched: boolean;
};

export type SessionSeason = {
  season: number;
  episodes: SessionEpisode[];
};

export type SessionContext = {
  passId: string;
  itemType: "book" | "series";
  itemId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  position: Position;
  status: MediaStatus;
  total: number | null;
  seriesEpisodes?: SessionSeason[];
};

// Carga TODO lo que necesita la hoja de registrar sesión. La comparten la ruta
// directa (/sesion/[passId], deep link y recarga) y la ruta interceptada que
// la pinta como modal: ninguna de las dos duplica esta lógica.
export async function loadSessionContext(passId: string): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El pase es el hub (§Tarea 7): la obra vive en el propio pase.
  const { data: passRow } = await supabase
    .from("passes")
    .select("id, item_type, item_id")
    .eq("id", passId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!passRow) notFound();

  // Las sesiones solo tienen sentido en libro y serie (§7.14): una película no
  // tiene progreso incremental.
  if (passRow.item_type === "movie") {
    redirect(itemHref("movie", passRow.item_id));
  }

  const itemType = passRow.item_type as "book" | "series";
  const itemId = passRow.item_id;

  // Confirma que sigue siendo el pase ACTIVO ahora mismo — nunca uno archivado
  // de una relectura anterior (mismo guard que addSession).
  const activePass = await getActivePass(supabase, itemType, itemId, user.id);
  if (!activePass || activePass.id !== passId) notFound();

  const [{ data: book }, { data: series }] = await Promise.all([
    itemType === "book"
      ? supabase
          .from("books")
          .select("title, author, cover_url, total_pages")
          .eq("id", itemId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    itemType === "series"
      ? supabase
          .from("series")
          .select("title, creator, cover_url, total_episodes, total_seasons, tmdb_id")
          .eq("id", itemId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let seriesEpisodes: SessionSeason[] | undefined;
  if (itemType === "series" && series) {
    await ensureSeriesEpisodes(supabase, {
      id: itemId,
      tmdbId: series.tmdb_id,
      totalSeasons: series.total_seasons,
    });
    const episodeData = await getEpisodeData(supabase, itemId, user.id, activePass.id);
    seriesEpisodes = episodeData.seasons.map((season) => ({
      season,
      episodes: (episodeData.bySeasons.get(season) ?? []).map((e) => ({
        episode: e.episode,
        title: e.title,
        stillUrl: e.stillUrl,
        watched: e.own.watched,
      })),
    }));
  }

  // El total sale de la EDICIÓN del pase (o la primaria), no de
  // books.total_pages: bolsillo y tapa dura no tienen las mismas páginas.
  const editions = await getEditions(supabase, itemType, itemId);
  const edition =
    editions.find((e) => e.id === activePass.editionId) ?? primaryEdition(editions);
  const total = edition?.totalUnits ?? book?.total_pages ?? series?.total_episodes ?? null;

  return {
    passId: activePass.id,
    itemType,
    itemId,
    title: book?.title ?? series?.title ?? "",
    author: book?.author ?? series?.creator ?? null,
    coverUrl: book?.cover_url ?? series?.cover_url ?? null,
    position: parsePosition(itemType, activePass.position) as Position,
    status: activePass.status,
    total,
    seriesEpisodes,
  };
}
```

- [ ] **Step 2: Adelgazar `src/app/sesion/[passId]/page.tsx`**

Sustituye todo el cuerpo entre `const { passId } = await params;` y el `return`. Conserva `parseMinutes` y el JSX tal cual, leyendo del contexto.

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { loadSessionContext } from "@/lib/sessions/load-context";
import { SessionForm } from "@/app/sesion/[passId]/session-form";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

// Un parámetro de URL es texto de fuera: se acepta solo si es un entero de
// minutos con sentido. Se topa a 24 h para que un valor absurdo no llegue al
// formulario.
function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;
  const t = await getTranslations("session");
  const tDetail = await getTranslations("detail");

  const ctx = await loadSessionContext(passId);
  const accent = MEDIA_ACCENT[ctx.itemType];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {ctx.itemType === "book" ? t("titleBook") : t("titleSeries")}
      </h1>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          {ctx.coverUrl && (
            <Image src={ctx.coverUrl} alt={ctx.title} fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[14.5px] font-semibold text-foreground">
            {ctx.title}
          </p>
          {ctx.author && (
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{ctx.author}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-medium tracking-wider uppercase ${accent.bgSoft} ${accent.text}`}
        >
          {tDetail(`mediaLabel.${ctx.itemType}`)}
        </span>
      </div>

      <SessionForm
        passId={ctx.passId}
        itemType={ctx.itemType}
        itemId={ctx.itemId}
        position={ctx.position}
        status={ctx.status}
        total={ctx.total}
        seriesEpisodes={ctx.seriesEpisodes}
        initialMinutes={parseMinutes(minutos)}
      />
    </div>
  );
}
```

`SessionForm` sigue esperando `seriesEpisodes?: { season, episodes: { episode, watched }[] }[]`. `SessionSeason` es un supertipo estructural de eso, así que TypeScript lo acepta sin cambios. La tarea 7 sustituirá el componente.

- [ ] **Step 3: Verificar que compila y pasa lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificar en navegador que la página sigue igual**

Con el dev server en el 3000, abrir `/sesion/<passId>` de un libro en curso y comprobar que la hoja renderiza igual que antes (portada, título, formulario). Guardar una sesión y confirmar que sigue redirigiendo a la ficha con el progreso actualizado. **Este es un refactor puro: cualquier diferencia visible es un fallo.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions/load-context.ts "src/app/sesion/[passId]/page.tsx"
git commit -m "refactor(sesion): extraer la carga de datos a loadSessionContext"
```

---

### Task 2: Slot `@modal` y cáscara `SessionModal`

Al acabar esta tarea, navegar a `/sesion/[passId]` desde dentro de la app abre un modal; entrar por URL o recargar sigue dando la página. El contenido del modal es todavía el `SessionForm` de hoy.

**Files:**
- Create: `src/app/@modal/default.tsx`
- Create: `src/app/@modal/(.)sesion/[passId]/page.tsx`
- Create: `src/components/session/session-modal.tsx`
- Modify: `src/app/layout.tsx:38-67`
- Modify: `messages/es.json` (namespace `session`)

**Interfaces:**
- Consumes: `loadSessionContext` (Task 1)
- Produces: `function SessionModal({ children }: { children: React.ReactNode })`

- [ ] **Step 1: Leer la documentación de la versión instalada**

Antes de escribir nada, leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md` y `parallel-routes.md`. **Esta versión de Next tiene cambios de ruptura respecto a lo que puedas recordar**; confirma la convención `(.)` y la necesidad de `default.tsx` contra la doc instalada, no contra la memoria.

- [ ] **Step 2: Crear `src/app/@modal/default.tsx`**

```tsx
// El slot `modal` no pinta nada en las rutas que no intercepta. Sin este
// fichero, Next devuelve 404 al recargar cualquier página con el slot montado.
export default function Default() {
  return null;
}
```

- [ ] **Step 3: Añadir el slot al layout raíz**

En `src/app/layout.tsx`, el slot va **fuera** de `<AppShell>` (no debe heredar el padding de navegación) y **dentro** de `NextIntlClientProvider` (la hoja usa `useTranslations`).

```tsx
export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ServiceWorkerRegister />
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
          {modal}
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Crear `src/components/session/session-modal.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Cáscara del modal de sesión. <dialog> nativo con showModal(): atrapa el foco
// y cierra con Escape sin código propio, igual que ClosePassSheet.
//
// Pantalla completa en móvil, tarjeta centrada en pc (D2 de la spec).
//
// El evento nativo "close" es la ÚNICA vía de salida: lo disparan Escape y
// nuestro propio close(), así que el clic en el backdrop, la tecla y el botón ✕
// acaban todos en el mismo router.back().
export function SessionModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() es una llamada imperativa al DOM, no setState: no choca con
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => router.back()}
      // El backdrop no es un elemento propio: un clic sobre él llega con
      // e.target === el <dialog>. Un clic en el contenido llega con el hijo.
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/50 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-2xl sm:shadow-xl"
    >
      {children}
    </dialog>
  );
}
```

- [ ] **Step 5: Crear la ruta interceptada**

`src/app/@modal/(.)sesion/[passId]/page.tsx`:

```tsx
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { loadSessionContext } from "@/lib/sessions/load-context";
import { SessionModal } from "@/components/session/session-modal";
import { SessionForm } from "@/app/sesion/[passId]/session-form";

function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export default async function SessionModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;
  const t = await getTranslations("session");
  const tDetail = await getTranslations("detail");

  const ctx = await loadSessionContext(passId);
  const accent = MEDIA_ACCENT[ctx.itemType];

  return (
    <SessionModal>
      <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-5">
        <h1 className="text-xl font-semibold tracking-tight">
          {ctx.itemType === "book" ? t("titleBook") : t("titleSeries")}
        </h1>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-surface-muted">
            {ctx.coverUrl && (
              <Image src={ctx.coverUrl} alt={ctx.title} fill sizes="40px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[14.5px] font-semibold text-foreground">
              {ctx.title}
            </p>
            {ctx.author && (
              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{ctx.author}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-medium tracking-wider uppercase ${accent.bgSoft} ${accent.text}`}
          >
            {tDetail(`mediaLabel.${ctx.itemType}`)}
          </span>
        </div>

        <div className="mt-4">
          <SessionForm
            passId={ctx.passId}
            itemType={ctx.itemType}
            itemId={ctx.itemId}
            position={ctx.position}
            status={ctx.status}
            total={ctx.total}
            seriesEpisodes={ctx.seriesEpisodes}
            initialMinutes={parseMinutes(minutos)}
          />
        </div>
      </div>
    </SessionModal>
  );
}
```

Este JSX es provisional: la Task 5 lo sustituye por `<SessionSheet>`, que trae su propio hero, cabecera y footer. Se duplica aquí a propósito para que la tarea sea verificable por sí sola.

- [ ] **Step 6: Verificar en navegador**

Con `next dev` en el 3000:
1. Desde el inicio, pulsar «Registrar» en una obra en curso → **debe abrirse un modal**, con el inicio visible detrás en pc.
2. Pulsar Escape → el modal se cierra y sigues en el inicio.
3. Recargar con el modal abierto (F5) → **debe salir la página completa**, no el modal.
4. Pegar la URL `/sesion/<passId>` en una pestaña nueva → página completa.
5. En móvil (DevTools, 390px) → el modal ocupa la pantalla entera.

- [ ] **Step 7: Commit**

```bash
git add src/app/@modal src/app/layout.tsx src/components/session/session-modal.tsx
git commit -m "feat(sesion): modal por ruta interceptada, con la pagina como deep link"
```

---

### Task 3: `addSession` devuelve estado en vez de redirigir

Esta es la tarea que hace útil al modal: al guardar te quedas donde estabas.

**Files:**
- Modify: `src/lib/sessions/actions.ts:26-28` (el tipo) y `:249-256` (los dos redirects)
- Modify: `src/app/sesion/[passId]/session-form.tsx:36-64` (nueva prop `onSaved` / modo)

**Interfaces:**
- Produces: `type AddSessionState = { error?: "invalidPosition" | "invalidDuration" | "generic"; ok?: boolean; passClosed?: boolean }`
- Produces: `SessionForm` acepta `mode: "modal" | "page"`

- [ ] **Step 1: Ampliar `AddSessionState`**

En `src/lib/sessions/actions.ts`, sustituir el tipo:

```ts
// `ok` marca el guardado con éxito; el cliente decide entonces a dónde ir —
// cerrar el modal y quedarse, o navegar a la ficha si vino por la ruta
// directa. `passClosed` avisa de que la sesión completó el pase: el cliente
// encadena la hoja de cierre en vez de irse (D4 de la spec).
export type AddSessionState = {
  error?: "invalidPosition" | "invalidDuration" | "generic";
  ok?: boolean;
  passClosed?: boolean;
};
```

- [ ] **Step 2: Sustituir los dos redirects finales**

En `src/lib/sessions/actions.ts`, el bloque `:249-256` pasa a ser:

```ts
  if (reachedEnd) {
    await applyTransition(supabase, user.id, itemType, itemId, "completed");
    revalidateReadingLog(itemType, itemId);
    return { ok: true, passClosed: true };
  }

  revalidateReadingLog(itemType, itemId);
  return { ok: true };
```

El `redirect("/login")` de la línea 45 **se queda**: ahí sí es un redirect legítimo. Si `redirect` e `itemHref` quedan sin usar en el fichero, quitar los imports — `npm run lint` lo señalará.

- [ ] **Step 3: Que el formulario navegue según su modo**

En `src/app/sesion/[passId]/session-form.tsx`, añadir la prop `mode` y el efecto de navegación. `itemHref` es una función pura y se puede importar en cliente.

```tsx
import { useRouter } from "next/navigation";
import { itemHref } from "@/lib/catalog/item-href";
```

En el cuerpo del componente, tras el `useActionState`:

```tsx
  const router = useRouter();

  // Navegar NO es setState: un efecto aquí no choca con
  // react-hooks/set-state-in-effect. En modal volvemos atrás (te quedas donde
  // estabas); en la ruta directa no hay a dónde volver, así que vamos a la
  // ficha, que es lo que hacía el redirect del servidor hasta ahora.
  useEffect(() => {
    if (!state.ok) return;
    if (mode === "modal") {
      router.back();
    } else {
      router.push(itemHref(itemType, itemId));
    }
  }, [state, mode, router, itemType, itemId]);
```

Firma actualizada:

```tsx
export function SessionForm({
  passId,
  itemType,
  itemId,
  position,
  status,
  total,
  seriesEpisodes,
  initialMinutes,
  mode,
}: {
  passId: string;
  itemType: "book" | "series";
  itemId: string;
  position: Position;
  status: MediaStatus;
  total: number | null;
  seriesEpisodes?: SeriesSeasonEpisodes[];
  initialMinutes?: number | null;
  /** Dónde vive el formulario: decide a dónde ir tras guardar. */
  mode: "modal" | "page";
}) {
```

- [ ] **Step 4: Pasar el modo desde las dos entradas**

En `src/app/sesion/[passId]/page.tsx`, añadir `mode="page"` al `<SessionForm>`.
En `src/app/@modal/(.)sesion/[passId]/page.tsx`, añadir `mode="modal"`.

- [ ] **Step 5: Verificar en navegador**

1. Desde el inicio, abrir el modal, registrar 20 páginas y guardar → **el modal se cierra y sigues en el inicio**, con el progreso ya actualizado en la tarjeta. Si el progreso no se refresca, **descarta el service worker antes que nada**: desregístralo en DevTools → Application → Service Workers y repite. Es el culpable histórico de este síntoma exacto en este repo.
2. Por la ruta directa `/sesion/<passId>`, guardar → navega a la ficha, como siempre.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sessions/actions.ts "src/app/sesion/[passId]/session-form.tsx" "src/app/sesion/[passId]/page.tsx" "src/app/@modal/(.)sesion/[passId]/page.tsx"
git commit -m "feat(sesion): addSession devuelve estado; el modal cierra en sitio"
```

---

### Task 4: Encadenar la hoja de cierre dentro del modal

**Files:**
- Modify: `src/app/sesion/[passId]/session-form.tsx`

**Interfaces:**
- Consumes: `AddSessionState.passClosed` (Task 3); `ClosePassSheet` de `@/components/detail/close-pass-sheet` — props `{ passId, itemType, itemId, open, onClose }`

- [ ] **Step 1: Montar `ClosePassSheet` sobre el estado `passClosed`**

En `session-form.tsx`. El flag se calcula **durante el render**, no en un efecto — es el patrón de `close-pass-sheet.tsx:51-56`, obligado por `react-hooks/set-state-in-effect`.

```tsx
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
```

```tsx
  // Ajuste de estado durante el render (patrón de close-pass-sheet.tsx:51-56):
  // un useEffect con setState dispararía react-hooks/set-state-in-effect.
  const [closingPass, setClosingPass] = useState(false);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.passClosed) setClosingPass(true);
  }
```

Y el efecto de navegación de la Task 3 pasa a respetarlo — si el pase se cerró, **no** se navega todavía:

```tsx
  useEffect(() => {
    if (!state.ok || state.passClosed) return;
    if (mode === "modal") {
      router.back();
    } else {
      router.push(itemHref(itemType, itemId));
    }
  }, [state, mode, router, itemType, itemId]);
```

Al final del JSX del formulario, fuera del `<form>`:

```tsx
      {/* El pase se completó con esta sesión: en vez de navegar a la ficha con
          ?cerrar (lo que hacía el servidor hasta ahora), la hoja de cierre sube
          aquí mismo. Al cerrarla, entonces sí salimos. */}
      <ClosePassSheet
        passId={passId}
        itemType={itemType}
        itemId={itemId}
        open={closingPass}
        onClose={() => {
          setClosingPass(false);
          if (mode === "modal") router.back();
          else router.push(itemHref(itemType, itemId));
        }}
      />
```

- [ ] **Step 2: Verificar el `<dialog>` anidado en navegador**

**Este es el riesgo señalado en la spec §5; no lo des por bueno sin verlo.** `SessionModal` y `ClosePassSheet` son ambos `showModal()`.

1. Coger un libro en curso y poner la página final de su edición como página de la sesión (o usar uno al que le falten pocas páginas).
2. Guardar desde el modal → **la hoja de cierre debe aparecer encima del modal de sesión**, con foco atrapado en ella y valoración funcionando.
3. Guardar la valoración → ambas capas se cierran y vuelves a donde estabas.
4. Pulsar «Ahora no» → igual: ambas capas fuera.
5. Repetir por la ruta directa `/sesion/<passId>` → la hoja de cierre aparece y, al cerrarla, navega a la ficha.

Si el anidamiento se comporta mal (foco perdido, backdrop doble, la hoja debajo del modal), la alternativa es **no** usar `showModal()` en `ClosePassSheet` cuando ya hay un diálogo abierto y pintarla como capa absoluta dentro del modal. Anota lo que encuentres antes de cambiar de enfoque.

- [ ] **Step 3: Commit**

```bash
git add "src/app/sesion/[passId]/session-form.tsx"
git commit -m "feat(sesion): encadenar la hoja de cierre de pase dentro del modal"
```

---

### Task 5: Chrome de la hoja — hero, cabecera y footer pegajosos

Aquí nace `SessionSheet` como componente propio y desaparece la duplicación de JSX entre las dos entradas. También **sale la nota** y **se pliega el estado**.

**Files:**
- Create: `src/components/session/session-hero.tsx`
- Create: `src/components/session/session-sheet.tsx` (mueve `src/app/sesion/[passId]/session-form.tsx`)
- Delete: `src/app/sesion/[passId]/session-form.tsx`
- Move: `src/app/sesion/[passId]/session-timer.tsx` → `src/components/session/session-timer.tsx` (sin cambios de lógica)
- Modify: `src/app/sesion/[passId]/page.tsx`, `src/app/@modal/(.)sesion/[passId]/page.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `SessionContext` (Task 1)
- Produces: `function SessionSheet({ ctx, initialMinutes, mode }: { ctx: SessionContext; initialMinutes?: number | null; mode: "modal" | "page" })`
- Produces: `function SessionHero({ itemType, title, author, coverUrl, statusLabel }: { itemType: "book" | "series"; title: string; author: string | null; coverUrl: string | null; statusLabel: string })`

- [ ] **Step 1: Añadir las claves de i18n**

En `messages/es.json`, dentro de `session`:

```json
  "sheetTitle": "Registrar sesión",
  "close": "Cerrar",
  "kickerBook": "Libro · sesión de lectura",
  "kickerSeries": "Serie · episodios vistos",
  "statusToggle": "Cambiar estado",
  "footerHintBook": "Actualiza tu página actual y la actividad de la semana.",
  "footerHintSeries": "Marca los episodios como vistos y actualiza tu progreso.",
  "submitEpisodes": "Guardar · {count} episodios"
```

- [ ] **Step 2: Crear `src/components/session/session-hero.tsx`**

```tsx
import Image from "next/image";
import { useTranslations } from "next-intl";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// Cabecera de la hoja: portada, título y un tinte degradado del color del
// medio (mockup frames A-D, `.hero .tint`). El tinte usa el acento que ya
// define MEDIA_ACCENT — no se inventan colores por tipo aquí.
export function SessionHero({
  itemType,
  title,
  author,
  coverUrl,
  statusLabel,
}: {
  itemType: "book" | "series";
  title: string;
  author: string | null;
  coverUrl: string | null;
  statusLabel: string;
}) {
  const t = useTranslations("session");
  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="relative overflow-hidden px-4 pt-5 pb-4">
      <div
        className={`absolute inset-0 z-0 bg-gradient-to-br ${accent.bgSoft} to-transparent`}
        aria-hidden
      />
      <div className="relative z-10 flex items-end gap-3.5">
        <div className="relative h-[104px] w-[70px] shrink-0 overflow-hidden rounded-[9px] bg-surface-muted shadow-lg">
          {coverUrl && (
            <Image src={coverUrl} alt={title} fill sizes="70px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 pb-0.5">
          <p className="font-mono text-[9.5px] tracking-[0.09em] uppercase text-muted-foreground">
            {itemType === "book" ? t("kickerBook") : t("kickerSeries")}
          </p>
          <p className="mt-1.5 font-serif text-[19px] leading-[1.08] font-semibold text-foreground">
            {title}
          </p>
          {author && <p className="mt-1 text-[12px] text-muted-foreground">{author}</p>}
          <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold">
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `src/components/session/session-sheet.tsx`**

Parte de `src/app/sesion/[passId]/session-form.tsx` tal como quedó tras la Task 4, con **cuatro cambios**:

1. Recibe `ctx: SessionContext` en vez de las ocho props sueltas (deriva `passId`, `itemType`, etc. de él).
2. Envuelve todo en el chrome: `<SessionHero>`, cabecera pegajosa con título y ✕, y footer pegajoso con el botón de guardar.
3. **Elimina el bloque de nota entero** (`session-form.tsx:348-384`): el `<Field>` con el textarea, el toggle nota/cita y el checkbox de favorita.
4. **Pliega el bloque de estado** dentro de un `<details>`.

⚠️ **El botón ✕ NO puede llamar a `router.back()` directamente.** La Task 4 encontró en
navegador que dos salidas compitiendo producen **dos saltos de historial** (acababas en el
inicio en vez de en la pantalla de origen), y lo arregló con un único `closeOnce()` guardado
por ref dentro de `SessionModal`, expuesto por `useModalClose()`. Toda salida tiene que pasar
por ese embudo. Por eso el ✕ usa un `closeSheet` local:

```tsx
const modalClose = useModalClose();

// Única salida de la hoja. En modal emboca al closeOnce() de SessionModal
// (un solo salto de historial pase lo que pase); en la ruta directa no hay
// a dónde volver, así que va a la ficha.
function closeSheet() {
  if (mode === "modal") modalClose?.();
  else router.push(itemHref(itemType, ctx.itemId));
}
```

Chrome:

```tsx
    <form action={formAction} onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background/90 px-4 py-3.5 backdrop-blur">
        <span className="font-serif text-[17px] font-semibold">{t("sheetTitle")}</span>
        <button
          type="button"
          onClick={closeSheet}
          aria-label={t("close")}
          className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border bg-surface text-muted-foreground"
        >
          ✕
        </button>
      </div>

      <SessionHero
        itemType={itemType}
        title={ctx.title}
        author={ctx.author}
        coverUrl={ctx.coverUrl}
        statusLabel={tLibrary(`status.${ctx.status}`)}
      />

      <div className="flex flex-1 flex-col gap-5 px-4 pb-4">
        {/* Los bloques por tipo (duración+páginas de libro, temporada+episodios
            de serie) se traen TAL CUAL de session-form.tsx:194-346 en esta
            tarea. Las Tasks 6 y 7 los sustituyen. Traerlos sin tocar es lo que
            deja esta tarea verificable por sí sola: al acabarla, la hoja tiene
            chrome nuevo y sigue guardando exactamente igual. */}

        <Field label={t("date")} htmlFor="session-date">
          <Input id="session-date" name="sessionDate" type="date" required defaultValue={todayISO()} />
        </Field>

        {/* Estado plegado (D8): el caso normal —registrar y seguir— no lo ve.
            Sigue disponible para abandonar o completar a mano sin ir a la ficha. */}
        <details className="rounded-lg border border-border bg-surface">
          <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground">
            {t("statusToggle")}
          </summary>
          <div className="border-t border-border px-3 py-3">
            <Select id="session-status" name="status" defaultValue={defaultStatus}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tLibrary(`status.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        </details>

        {state.error && (
          <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/92 px-4 pt-3.5 pb-4 backdrop-blur">
        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? t("submitting")
            : itemType === "series" && newlyMarked.length > 0
              ? t("submitEpisodes", { count: newlyMarked.length })
              : t("submit")}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {itemType === "book" ? t("footerHintBook") : t("footerHintSeries")}
        </p>
      </div>
    </form>
```

- [ ] **Step 4: Mover el cronómetro y borrar el formulario viejo**

```bash
git mv "src/app/sesion/[passId]/session-timer.tsx" src/components/session/session-timer.tsx
git rm "src/app/sesion/[passId]/session-form.tsx"
```

Corregir el import en `session-sheet.tsx` a `./session-timer`.

- [ ] **Step 5: Simplificar las dos entradas**

Ambas páginas quedan reducidas a cargar el contexto y montar la hoja. `src/app/sesion/[passId]/page.tsx`:

```tsx
  const ctx = await loadSessionContext(passId);

  return (
    <div className="mx-auto w-full max-w-lg">
      <SessionSheet ctx={ctx} initialMinutes={parseMinutes(minutos)} mode="page" />
    </div>
  );
```

`src/app/@modal/(.)sesion/[passId]/page.tsx`:

```tsx
  const ctx = await loadSessionContext(passId);

  return (
    <SessionModal>
      <SessionSheet ctx={ctx} initialMinutes={parseMinutes(minutos)} mode="modal" />
    </SessionModal>
  );
```

El `<h1>` y la tarjeta de contexto duplicada desaparecen de ambas: los sustituye el hero. `Image`, `MEDIA_ACCENT` y `getTranslations` quedan sin usar en las páginas — `npm run lint` lo señalará.

- [ ] **Step 6: Verificar**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores.

En navegador: modal y página muestran hero con portada, cabecera pegajosa, footer pegajoso con el botón. **No hay campo de nota.** El estado aparece plegado y despliega al pulsarlo. Guardar sigue funcionando en los dos modos.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/session "src/app/sesion/[passId]" "src/app/@modal" messages/es.json
git commit -m "feat(sesion): hoja con hero, cabecera y footer pegajosos; nota fuera, estado plegado"
```

---

### Task 6: Bloque de libro — rail, stepper editable y duración

**Files:**
- Create: `src/lib/sessions/page-stepper.ts`
- Create: `src/lib/sessions/page-stepper.test.ts`
- Create: `src/components/session/book-progress-field.tsx`
- Modify: `src/components/session/session-sheet.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `function clampPage(value: number, max: number | null): number`
- Produces: `function readProgress(from: number | null, to: number | null, total: number | null): { delta: number | null; remaining: number | null; readPct: number; sessionPct: number }`
- Produces: `function BookProgressField({ passId, fromPage, total, initialMinutes }: { passId: string; fromPage: number | null; total: number | null; initialMinutes?: number | null })` — `passId` es para `SessionTimer`, que lo usa como clave de su `localStorage`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/sessions/page-stepper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampPage, readProgress } from "./page-stepper";

describe("clampPage", () => {
  it("no baja de cero", () => {
    expect(clampPage(-5, 300)).toBe(0);
  });

  it("no pasa del total de la edición", () => {
    expect(clampPage(400, 300)).toBe(300);
  });

  it("deja pasar cualquier valor si no se conoce el total", () => {
    expect(clampPage(9000, null)).toBe(9000);
  });

  it("redondea a entero", () => {
    expect(clampPage(12.7, 300)).toBe(12);
  });
});

describe("readProgress", () => {
  it("calcula delta y restante", () => {
    const r = readProgress(180, 240, 662);
    expect(r.delta).toBe(60);
    expect(r.remaining).toBe(422);
  });

  it("reparte el rail entre lo ya leido y este tramo", () => {
    const r = readProgress(180, 240, 600);
    expect(r.readPct).toBeCloseTo(30);
    expect(r.sessionPct).toBeCloseTo(10);
  });

  // Una sesión de solo tiempo es válida: no se ha tocado la página.
  it("sin pagina final no hay delta", () => {
    const r = readProgress(180, null, 662);
    expect(r.delta).toBeNull();
    expect(r.remaining).toBeNull();
    expect(r.sessionPct).toBe(0);
  });

  // Corregir a la baja es legítimo (te habías pasado apuntando).
  it("admite delta negativo sin romper el rail", () => {
    const r = readProgress(240, 180, 600);
    expect(r.delta).toBe(-60);
    expect(r.sessionPct).toBe(0);
  });

  it("sin total no hay porcentajes ni restante", () => {
    const r = readProgress(180, 240, null);
    expect(r.delta).toBe(60);
    expect(r.remaining).toBeNull();
    expect(r.readPct).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `fnm use 22 && npx vitest run src/lib/sessions/page-stepper.test.ts`
Expected: FAIL — `Failed to resolve import "./page-stepper"`.

- [ ] **Step 3: Implementar `src/lib/sessions/page-stepper.ts`**

```ts
// Lógica pura del bloque de progreso de libro. Separada del componente para
// poder testearla sin montar React (mismo patrón que lib/sessions/timer.ts).

// La página no puede ser negativa ni pasar del total de TU edición. Si no se
// conoce el total (edición sin páginas), no se topa: mejor dejar apuntar que
// bloquear al usuario con un dato que no tenemos.
export function clampPage(value: number, max: number | null): number {
  const page = Math.floor(value);
  if (Number.isNaN(page)) return 0;
  if (page < 0) return 0;
  if (max !== null && page > max) return max;
  return page;
}

export type ReadProgress = {
  /** Páginas de esta sesión. Puede ser negativo si corriges a la baja. */
  delta: number | null;
  remaining: number | null;
  /** % del rail ya leído antes de esta sesión. */
  readPct: number;
  /** % del rail que aporta esta sesión. 0 si el delta no es positivo. */
  sessionPct: number;
};

export function readProgress(
  from: number | null,
  to: number | null,
  total: number | null,
): ReadProgress {
  const delta = from !== null && to !== null ? to - from : null;
  const remaining = to !== null && total !== null ? total - to : null;

  if (total === null || total <= 0) {
    return { delta, remaining, readPct: 0, sessionPct: 0 };
  }

  const readPct = from !== null ? (from / total) * 100 : 0;
  // Un delta negativo no pinta tramo: el rail representa avance, y un
  // retroceso ya se comunica con el texto del delta.
  const sessionPct = delta !== null && delta > 0 ? (delta / total) * 100 : 0;

  return { delta, remaining, readPct, sessionPct };
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `fnm use 22 && npx vitest run src/lib/sessions/page-stepper.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Añadir las claves de i18n**

En `messages/es.json`, dentro de `session`:

```json
  "advance": "Avance",
  "advanceOf": "{current} / {total} pág.",
  "legendRead": "Ya leído",
  "legendSession": "Esta sesión",
  "legendLeft": "Queda",
  "finalPage": "Página final de hoy",
  "currentPage": "pág. actual",
  "fromMark": "Desde tu marca {from} → {to}",
  "deltaFull": "▲ {delta} páginas leídas · quedan {remaining}",
  "jump": "+{n}",
  "durationOther": "Otro",
  "durationMinutes": "{n} min",
  "durationHour": "1 h",
  "stepDown": "Una página menos",
  "stepUp": "Una página más"
```

- [ ] **Step 6: Crear `src/components/session/book-progress-field.tsx`**

Piezas: rail de tres tramos, stepper con **la cifra como input** (D5), chips de salto, y duración con `A mano | Cronómetro` donde «Otro» vacía y enfoca el input de minutos.

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { clampPage, readProgress } from "@/lib/sessions/page-stepper";
import { SessionTimer } from "./session-timer";

const JUMPS = [10, 25, 50] as const;
const DURATION_CHIPS = [15, 30, 45, 60] as const;

export function BookProgressField({
  passId,
  fromPage,
  total,
  initialMinutes,
}: {
  passId: string;
  fromPage: number | null;
  total: number | null;
  initialMinutes?: number | null;
}) {
  const t = useTranslations("session");
  const [toPage, setToPage] = useState(fromPage !== null ? String(fromPage) : "");
  const toPageNum = toPage.trim() === "" ? null : Number(toPage);
  const { delta, remaining, readPct, sessionPct } = readProgress(fromPage, toPageNum, total);

  function setPage(next: number) {
    setToPage(String(clampPage(next, total)));
  }

  const [durationMode, setDurationMode] = useState<"manual" | "timer">("manual");
  const [manualMinutes, setManualMinutes] = useState(
    initialMinutes ? String(initialMinutes) : "",
  );
  const minutesRef = useRef<HTMLInputElement>(null);

  // "Otro" no es un valor: vacía el campo y te lleva el foco a él (petición
  // explícita del diseño). Los chips numéricos son un acelerador del MISMO
  // input, no un control aparte — solo hay un name="durationMinutes" en el DOM.
  function pickDuration(minutes: number | null) {
    setManualMinutes(minutes === null ? "" : String(minutes));
    if (minutes === null) minutesRef.current?.focus();
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("advance")}
          {total !== null && (
            <span className="normal-case tracking-normal">
              {t("advanceOf", { current: toPageNum ?? fromPage ?? 0, total })}
            </span>
          )}
        </span>
        <div className="flex h-[15px] overflow-hidden rounded-full border border-border bg-surface-muted">
          <div className="bg-type-book/40" style={{ width: `${readPct}%` }} />
          <div className="bg-accent" style={{ width: `${sessionPct}%` }} />
        </div>
        <div className="flex gap-3.5 text-[10.5px] text-muted-foreground">
          <span>{t("legendRead")}</span>
          <span>{t("legendSession")}</span>
          <span>{t("legendLeft")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("finalPage")}
        </span>
        {/* La cifra ES el input (D5): tocarla abre el teclado numérico y
            escribes 240 de una vez. Los −/+ son para el ajuste de ±1; los
            chips, para el salto. Pulsar "+" cincuenta veces no es una opción. */}
        <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface">
          <button
            type="button"
            aria-label={t("stepDown")}
            onClick={() => setPage((toPageNum ?? 0) - 1)}
            className="grid w-[52px] place-items-center bg-surface-muted text-2xl text-accent"
          >
            −
          </button>
          <div className="flex flex-1 flex-col items-center justify-center py-2">
            <Input
              name="page"
              type="number"
              min={0}
              max={total ?? undefined}
              inputMode="numeric"
              aria-label={t("finalPage")}
              value={toPage}
              onChange={(e) => setToPage(e.target.value)}
              onBlur={() => toPageNum !== null && setPage(toPageNum)}
              className="w-full border-0 bg-transparent text-center font-mono text-[26px] font-semibold focus:ring-0"
            />
            <span className="text-[10px] text-muted-foreground">{t("currentPage")}</span>
          </div>
          <button
            type="button"
            aria-label={t("stepUp")}
            onClick={() => setPage((toPageNum ?? 0) + 1)}
            className="grid w-[52px] place-items-center bg-surface-muted text-2xl text-accent"
          >
            +
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {JUMPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage((toPageNum ?? fromPage ?? 0) + n)}
              className="rounded-full border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
            >
              {t("jump", { n })}
            </button>
          ))}
        </div>

        {fromPage !== null && toPageNum !== null && (
          <p className="text-center text-[11.5px] text-muted-foreground">
            {t("fromMark", { from: fromPage, to: toPageNum })}
          </p>
        )}
        {delta !== null && delta > 0 && remaining !== null && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11.5px] text-green">
            {t("deltaFull", { delta, remaining })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("duration")}
        </span>
        <div className="flex gap-1.5 rounded-[10px] bg-surface-muted p-1">
          {(["manual", "timer"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={durationMode === mode}
              onClick={() => setDurationMode(mode)}
              className={`flex-1 rounded-[7px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                durationMode === mode
                  ? "bg-surface text-foreground shadow-card"
                  : "text-muted-foreground"
              }`}
            >
              {mode === "manual" ? t("durationManual") : t("durationTimer")}
            </button>
          ))}
        </div>

        {durationMode === "manual" ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={manualMinutes === String(n)}
                  onClick={() => pickDuration(n)}
                  className={`rounded-full border px-2.5 py-1.5 font-mono text-[11px] ${
                    manualMinutes === String(n)
                      ? "border-accent bg-accent/7 text-accent"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  {n === 60 ? t("durationHour") : t("durationMinutes", { n })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickDuration(null)}
                className="rounded-full border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
              >
                {t("durationOther")}
              </button>
            </div>
            <Input
              ref={minutesRef}
              id="session-duration"
              name="durationMinutes"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="0"
              aria-label={t("duration")}
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
          </div>
        ) : (
          <SessionTimer passId={passId} onMinutes={(m) => {
            setManualMinutes(String(m));
            setDurationMode("manual");
          }} />
        )}
      </div>
    </>
  );
}
```

**Comprobación necesaria antes de escribir esto:** `Input` (`src/components/ui/input.tsx`) tiene que reenviar `ref` para que `minutesRef` funcione. Si no lo hace, envolverlo con `forwardRef` (React 19 permite `ref` como prop normal en componentes de función; verifica cómo está declarado `Input` antes de decidir).

- [ ] **Step 7: Enchufarlo en `SessionSheet`**

En `session-sheet.tsx`, la rama `itemType === "book"` sustituye todo el bloque de duración (`session-form.tsx:194-236`) y el de páginas (`:238-283`) por:

```tsx
{itemType === "book" ? (
  <BookProgressField
    passId={ctx.passId}
    fromPage={currentPage}
    total={ctx.total}
    initialMinutes={initialMinutes}
  />
) : (
  /* … Task 7 … */
)}
```

Se pueden borrar de `session-sheet.tsx` los estados `fromPage`, `toPage`, `durationMode` y `manualMinutes`, que ahora viven en `BookProgressField`. `handleSubmit` sigue necesitando saber si el cronómetro está activo: pasa a limpiar siempre el `localStorage` del cronómetro de ese pase (`timerStorageKey(passId)`), que es idempotente.

- [ ] **Step 8: Verificar**

Run: `fnm use 22 && npm test && npm run lint && npx tsc --noEmit`
Expected: todo verde.

En navegador, con un libro en curso:
1. La cifra del stepper es editable: tocarla y escribir `240` funciona.
2. `+50` salta de 180 a 230; `−` baja de uno en uno.
3. Escribir una página mayor que el total de la edición se topa al total al salir del campo.
4. El rail pinta tres tramos y el delta verde dice «▲ 60 páginas leídas · quedan 422».
5. Chip `45 min` rellena el campo de minutos; **«Otro» lo vacía y le da el foco**.
6. Guardar registra la página y los minutos correctos.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sessions/page-stepper.ts src/lib/sessions/page-stepper.test.ts src/components/session/book-progress-field.tsx src/components/session/session-sheet.tsx messages/es.json
git commit -m "feat(sesion): bloque de libro con rail, stepper editable y chips de duracion"
```

---

### Task 7: Bloque de serie — rejilla de episodios con scroll acotado

**Files:**
- Create: `src/lib/sessions/episode-grid.ts`
- Create: `src/lib/sessions/episode-grid.test.ts`
- Create: `src/components/session/series-episode-grid.tsx`
- Modify: `src/components/session/session-sheet.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `SessionSeason`, `SessionEpisode` (Task 1)
- Produces: `function firstUnwatchedIndex(episodes: { watched: boolean }[]): number`
- Produces: `type EpisodeState = "before" | "session" | "unseen"`
- Produces: `function episodeState(episode: number, initialWatched: Set<number>, selected: Set<number>): EpisodeState`
- Produces: `function SeriesEpisodeGrid({ seasons, initialSeason, onNewlyMarkedChange }: { seasons: SessionSeason[]; initialSeason: number; onNewlyMarkedChange: (count: number) => void })` — el contador sube al padre porque el footer de `SessionSheet` lo pinta («Guardar · 2 episodios»)

- [ ] **Step 1: Escribir el test que falla**

`src/lib/sessions/episode-grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { episodeState, firstUnwatchedIndex } from "./episode-grid";

describe("firstUnwatchedIndex", () => {
  it("apunta al primer episodio sin ver", () => {
    expect(
      firstUnwatchedIndex([
        { watched: true },
        { watched: true },
        { watched: false },
        { watched: false },
      ]),
    ).toBe(2);
  });

  // Temporada terminada: no hay a dónde saltar, se queda arriba.
  it("devuelve 0 si estan todos vistos", () => {
    expect(firstUnwatchedIndex([{ watched: true }, { watched: true }])).toBe(0);
  });

  it("devuelve 0 si no hay ninguno visto", () => {
    expect(firstUnwatchedIndex([{ watched: false }, { watched: false }])).toBe(0);
  });

  it("tolera una temporada vacia", () => {
    expect(firstUnwatchedIndex([])).toBe(0);
  });

  // Un hueco (viste el 3 pero no el 2) manda al hueco, no al final.
  it("respeta huecos", () => {
    expect(
      firstUnwatchedIndex([{ watched: true }, { watched: false }, { watched: true }]),
    ).toBe(1);
  });
});

describe("episodeState", () => {
  it("marca como visto antes lo que ya estaba al abrir", () => {
    expect(episodeState(4, new Set([4]), new Set([4]))).toBe("before");
  });

  it("marca como de esta sesion lo recien pulsado", () => {
    expect(episodeState(5, new Set([4]), new Set([4, 5]))).toBe("session");
  });

  it("marca como sin ver lo no seleccionado", () => {
    expect(episodeState(7, new Set([4]), new Set([4, 5]))).toBe("unseen");
  });

  // Desmarcar algo que ya estaba visto antes lo devuelve a "sin ver".
  it("desmarcar un visto previo lo deja sin ver", () => {
    expect(episodeState(4, new Set([4]), new Set())).toBe("unseen");
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `fnm use 22 && npx vitest run src/lib/sessions/episode-grid.test.ts`
Expected: FAIL — `Failed to resolve import "./episode-grid"`.

- [ ] **Step 3: Implementar `src/lib/sessions/episode-grid.ts`**

```ts
// Lógica pura de la rejilla de episodios de la hoja de sesión.

// Índice del primer episodio sin ver de la temporada: es donde debe
// posicionarse el scroll al abrir la hoja. Si vas por el E15 de una T2, abrir
// la rejilla en E1 no sirve de nada. Si están todos vistos no hay a dónde
// saltar y se queda arriba.
export function firstUnwatchedIndex(episodes: { watched: boolean }[]): number {
  const index = episodes.findIndex((e) => !e.watched);
  return index === -1 ? 0 : index;
}

// Los tres estados que pinta cada tile. `before` es lo que ya estaba visto al
// ABRIR la hoja; `session` es lo que has marcado ahora. La distinción es lo
// que permite que el footer cuente solo los episodios nuevos.
export type EpisodeState = "before" | "session" | "unseen";

export function episodeState(
  episode: number,
  initialWatched: Set<number>,
  selected: Set<number>,
): EpisodeState {
  if (!selected.has(episode)) return "unseen";
  return initialWatched.has(episode) ? "before" : "session";
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `fnm use 22 && npx vitest run src/lib/sessions/episode-grid.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Añadir las claves de i18n**

En `messages/es.json`, dentro de `session`:

```json
  "seasonsCount": "{n} temporadas",
  "episodesMark": "marca esta sesión",
  "epState": {
    "before": "visto antes",
    "session": "esta sesión",
    "unseen": "sin ver"
  }
```

- [ ] **Step 6: Crear `src/components/session/series-episode-grid.tsx`**

La clave de la tarea es el **tope de altura con scroll propio** (D6): 4 filas de 2 columnas. Una temporada de 24 ocupa lo mismo que una de 8.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { SessionSeason } from "@/lib/sessions/load-context";
import { episodeState, firstUnwatchedIndex } from "@/lib/sessions/episode-grid";

// Tope de la rejilla: 4 filas de 2 columnas. Sin él, una temporada de 24
// episodios convierte la hoja en un scroll interminable (D6).
const GRID_MAX_HEIGHT = "17rem";

export function SeriesEpisodeGrid({
  seasons,
  initialSeason,
  onNewlyMarkedChange,
}: {
  seasons: SessionSeason[];
  initialSeason: number;
  /** El footer de SessionSheet pinta «Guardar · N episodios» con este número.
      Se llama desde los manejadores de evento, NUNCA desde un efecto: eso
      sería setState del padre durante un efecto del hijo. */
  onNewlyMarkedChange: (count: number) => void;
}) {
  const t = useTranslations("session");
  const tEpisode = useTranslations("episode");
  const gridRef = useRef<HTMLDivElement>(null);

  const [season, setSeason] = useState(initialSeason);

  function watchedSetFor(n: number): Set<number> {
    const group = seasons.find((s) => s.season === n);
    return new Set((group?.episodes ?? []).filter((e) => e.watched).map((e) => e.episode));
  }

  // `initialWatched` es la foto de "ya visto" al abrir: no cambia con los
  // clics, y es lo que distingue "visto antes" de "esta sesión".
  const [initialWatched, setInitialWatched] = useState<Set<number>>(() =>
    watchedSetFor(initialSeason),
  );
  const [selected, setSelected] = useState<Set<number>>(() => watchedSetFor(initialSeason));

  // Cambiar de temporada resetea a lo ya visto de la NUEVA — no arrastra
  // marcas de la anterior. Manejador de evento, no efecto.
  function handleSeasonChange(next: number) {
    setSeason(next);
    const watched = watchedSetFor(next);
    setInitialWatched(watched);
    setSelected(watched);
  }

  function toggle(episode: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(episode)) next.delete(episode);
      else next.add(episode);
      return next;
    });
  }

  const episodes = seasons.find((s) => s.season === season)?.episodes ?? [];

  // Posicionar el scroll en el primer episodio sin ver. Es manipulación
  // imperativa del DOM (scrollTop), no setState: no choca con la regla de
  // set-state-in-effect.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const index = firstUnwatchedIndex(episodes);
    const row = Math.floor(index / 2);
    const tile = grid.children[index] as HTMLElement | undefined;
    grid.scrollTop = row === 0 || !tile ? 0 : tile.offsetTop - grid.offsetTop;
  }, [season, episodes]);

  const newlyMarked = [...selected].filter((e) => !initialWatched.has(e));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("season")}
          <span className="normal-case tracking-normal">
            {t("seasonsCount", { n: seasons.length })}
          </span>
        </span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {seasons.map((s) => {
            const watched = s.episodes.filter((e) => e.watched).length;
            const on = s.season === season;
            return (
              <button
                key={s.season}
                type="button"
                aria-pressed={on}
                onClick={() => handleSeasonChange(s.season)}
                className={`min-w-[60px] shrink-0 rounded-[10px] border px-3 py-2.5 text-center ${
                  on
                    ? "border-type-series bg-type-series/8 text-type-series"
                    : "border-border bg-surface"
                }`}
              >
                <span className="block font-serif text-[16px] leading-none font-semibold">
                  {s.season}
                </span>
                <span className="mt-1 block font-mono text-[9.5px] text-muted-foreground">
                  {watched}/{s.episodes.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
          {t("episodesLabel")}
          <span className="normal-case tracking-normal">{t("episodesMark")}</span>
        </span>

        {episodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("episodesEmpty")}</p>
        ) : (
          <div
            ref={gridRef}
            style={{ maxHeight: GRID_MAX_HEIGHT }}
            className="grid grid-cols-2 gap-2.5 overflow-y-auto"
          >
            {episodes.map((ep) => {
              const st = episodeState(ep.episode, initialWatched, selected);
              return (
                <button
                  key={ep.episode}
                  type="button"
                  aria-pressed={st !== "unseen"}
                  onClick={() => toggle(ep.episode)}
                  className={`flex items-center gap-2.5 rounded-[11px] border p-2 text-left ${
                    st === "unseen"
                      ? "border-border bg-surface"
                      : "border-type-series bg-type-series/7"
                  }`}
                >
                  {/* El 5 % de episodios sin still_url cae al bloque neutro:
                      nunca un hueco roto ni un <Image> con src vacío. */}
                  <span className="relative h-8 w-[46px] shrink-0 overflow-hidden rounded-md bg-surface-muted">
                    {ep.stillUrl && (
                      <Image
                        src={ep.stillUrl}
                        alt=""
                        fill
                        sizes="46px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[12px] font-semibold">
                      {tEpisode("episodeShort", { n: ep.episode })}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {t(`epState.${st}`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Los hidden inputs viajan como valores repetidos de "episodes";
            addSession los lee con formData.getAll (actions.ts:137-141). */}
        <input type="hidden" name="season" value={season} />
        {[...selected].map((ep) => (
          <input key={ep} type="hidden" name="episodes" value={ep} />
        ))}

        {newlyMarked.length > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11px] text-green">
            {t("episodesDelta", {
              count: newlyMarked.length,
              season,
              episode: Math.max(...selected),
            })}
          </span>
        )}
      </div>
    </div>
  );
}
```

**Ojo con el contador del footer.** La Task 5 dejó el footer leyendo `newlyMarked` desde `SessionSheet`, pero ese estado vive ahora aquí. Elevar el contador: `SeriesEpisodeGrid` acepta además `onNewlyMarkedChange?: (count: number) => void` y lo llama desde `toggle` y `handleSeasonChange` (**nunca desde un efecto** — eso sería `setState` en el padre durante un efecto del hijo). El `<select>` de temporada del formulario viejo desaparece: lo sustituye el hidden input de arriba.

- [ ] **Step 7: Enchufarlo en `SessionSheet`**

La rama `else` del `itemType === "book"` pasa a ser:

```tsx
  <SeriesEpisodeGrid
    seasons={ctx.seriesEpisodes ?? []}
    initialSeason={defaultSeason}
    onNewlyMarkedChange={setNewlyMarkedCount}
  />
```

`defaultSeason` se calcula igual que en `session-form.tsx:123-129`: la temporada de `ctx.position` si existe en el catálogo, si no la última. Todo el estado de episodios (`initialWatched`, `selectedEpisodes`, `season`, `toggleEpisode`, `watchedSetFor`, `handleSeasonChange`) se borra de `SessionSheet`.

- [ ] **Step 8: Verificar**

Run: `fnm use 22 && npm test && npm run lint && npx tsc --noEmit`
Expected: todo verde.

En navegador, con una serie en curso:
1. Una temporada de 10 episodios: la rejilla muestra ~8 y **scrollea dentro de su caja**, sin estirar la hoja.
2. Abrir con progreso en E15 de una temporada larga → la rejilla **arranca posicionada cerca del E15**, no en E1.
3. Los tres estados se distinguen: «visto antes», «esta sesión», «sin ver».
4. Un episodio sin `still_url` muestra el bloque neutro, no un hueco roto.
5. El footer dice «Guardar · 2 episodios» tras marcar dos.
6. Cambiar de temporada resetea las marcas a lo ya visto de la nueva.
7. Guardar marca los episodios y actualiza el progreso.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sessions/episode-grid.ts src/lib/sessions/episode-grid.test.ts src/components/session/series-episode-grid.tsx src/components/session/session-sheet.tsx messages/es.json
git commit -m "feat(sesion): rejilla de episodios con miniaturas y scroll acotado"
```

---

### Task 8: E2E de los cinco escenarios

**Files:**
- Create: `e2e/registrar-sesion-v2.spec.ts`

**Interfaces:**
- Consumes: la app completa de las Tasks 1-7

- [ ] **Step 1: Escribir el spec**

Sigue el patrón de `e2e/pase-hub.spec.ts` (cuenta persistente `devtest`, cotas de timeout, limpieza por REST con la service-role key). Lee ese fichero entero antes de escribir este.

```ts
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// E2E del rediseño de registrar sesión (spec 2026-07-20-registrar-sesion-v2).
// Cubre los cinco escenarios de §7: modal desde el inicio sin perder pantalla,
// deep link como página, atrás sin guardar, auto-cierre encadenado y rejilla
// acotada.
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
});

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test("registrar desde el inicio abre modal y te deja en el inicio", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: /registrar/i }).first().click();

  // El modal es un <dialog> con showModal(): expone role="dialog" y modal.
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/registrar sesión/i)).toBeVisible();

  await sheet.getByLabel(/página final de hoy/i).fill("42");
  await sheet.getByRole("button", { name: /guardar sesión/i }).click();

  // Lo que importa: el modal se va y NO hemos acabado en la ficha.
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL("/");
});

test("el deep link renderiza la pagina completa, no el modal", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: /registrar/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const url = page.url();
  await page.goto(url); // navegación dura: sin interceptar

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/registrar sesión/i)).toBeVisible();
});

test("atras cierra el modal sin guardar", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: /registrar/i }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  await page.goBack();

  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL("/");
});

test("la rejilla de episodios no estira la hoja", async ({ page }) => {
  await login(page);
  // Navegar a la serie en curso de la cuenta devtest y abrir su hoja.
  await page.goto("/");
  await page.getByRole("link", { name: /registrar/i }).nth(1).click();

  const sheet = page.getByRole("dialog");
  const grid = sheet.locator("[data-testid='episode-grid']");
  if ((await grid.count()) === 0) test.skip(true, "la cuenta no tiene serie en curso");

  const box = await grid.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(300);

  // Scrollea por dentro: su scrollHeight supera su altura visible.
  const scrollable = await grid.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(scrollable).toBe(true);
});
```

`SeriesEpisodeGrid` necesita `data-testid="episode-grid"` en el `<div>` con `ref={gridRef}` para que el último test lo localice — añádelo.

- [ ] **Step 2: Escribir el escenario del auto-cierre**

Es el único que necesita preparar datos: un pase de libro parado justo antes del final de su edición. Se prepara por REST con la service-role key, igual que las limpiezas de `pase-hub.spec.ts` (que define `headers()` y `devtestId()` memoizado — **cópialos de ahí, no los reinventes**).

```ts
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

// Deja el pase activo de `itemId` en la penúltima página de su edición y
// devuelve el total, para que la sesión de después alcance justo el final y
// dispare el auto-cierre.
async function parkPassBeforeEnd(userId: string, itemId: string): Promise<number> {
  const editionRes = await fetch(
    `${SUPABASE_URL}/rest/v1/book_editions?item_id=eq.${itemId}&select=total_units&order=is_primary.desc&limit=1`,
    { headers: headers() },
  );
  const [edition] = (await editionRes.json()) as { total_units: number }[];
  const total = edition.total_units;

  await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_id=eq.${itemId}&is_active=eq.true`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ position: { page: total - 1 }, status: "in_progress" }),
    },
  );

  return total;
}

test("el auto-cierre encadena la hoja de cierre sin navegar", async ({ page }) => {
  await login(page);

  const userId = await devtestId();
  const itemId = await activeBookItemId(userId); // primer libro in_progress de devtest
  const total = await parkPassBeforeEnd(userId, itemId);

  await page.goto("/");
  await page.getByRole("link", { name: /registrar/i }).first().click();

  const sheet = page.getByRole("dialog").first();
  await sheet.getByLabel(/página final de hoy/i).fill(String(total));
  await sheet.getByRole("button", { name: /guardar sesión/i }).click();

  // Lo que se está probando: la hoja de cierre es un SEGUNDO dialog encima del
  // primero, y NO hemos navegado a la ficha.
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await expect(page).toHaveURL("/");
});
```

`activeBookItemId(userId)` es un helper a escribir en el mismo fichero: `GET /rest/v1/passes?user_id=eq.<id>&item_type=eq.book&is_active=eq.true&status=eq.in_progress&select=item_id&limit=1`, devolviendo `item_id`. Si no devuelve nada, `test.skip` con el motivo — la cuenta `devtest` no tiene libro en curso.

**Restaura el estado al acabar** (`try/finally`, como los specs vecinos): el test cierra un pase de la cuenta persistente, y dejarlo cerrado envenena las corridas siguientes.

- [ ] **Step 3: Correr la suite**

Run: `npm run test:e2e -- registrar-sesion-v2`
Expected: los 5 tests en verde.

**Si falla algo de progreso o persistencia**, comprueba primero si es el **bug abierto #106** («Seguir» no persiste el pase, 0 filas en `passes`) antes de tocar el rediseño. Es preexistente y ajeno a este trabajo — `docs/TRAMPAS.md` §16.

**Si cae media suite**, mira la carga de la máquina antes que tu código: es de 8 GB y la suite completa contra APIs reales la satura.

- [ ] **Step 4: Commit**

```bash
git add e2e/registrar-sesion-v2.spec.ts src/components/session/series-episode-grid.tsx
git commit -m "test(e2e): cobertura del modal de registrar sesion"
```

---

### Task 9: Cerrar el ciclo — documentación e higiene

**Files:**
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: Revisar el backlog — sin inventar entradas**

**Ojo: puede que no haya nada que marcar.** La entrada §7.14 («Sesiones de progreso diarias», `backlog.md:44`) ya está `[x]` desde que se construyeron las sesiones; este ciclo es un **rediseño** de algo cerrado, no una feature nueva.

Busca en `docs/requirements/backlog.md` una entrada abierta de rediseño de la hoja de sesión. Si existe, márcala. **Si no existe, no crees una para poder tacharla**: la spec y este plan ya son el registro del trabajo. Anota en el commit cuál de los dos casos fue.

**La narrativa de cómo se hizo NO va al backlog** — eso fue lo que lo pudrió antes.

- [ ] **Step 2: Añadir la decisión de forma**

Añadir **al final** de `docs/requirements/decisiones.md` (append-only; no reescribir entradas anteriores) una entrada sobre el patrón, que tiene alcance más allá de esta pantalla:

> **Hojas con múltiples puntos de entrada → ruta interceptada.** Registrar sesión se
> alcanzaba desde cinco sitios y siempre acababa redirigiendo a la ficha. Se resolvió con
> un slot `@modal` + `(.)sesion/[passId]`: los `<Link>` no cambian, el deep link y la
> recarga siguen dando la página, y el modal cierra en sitio. Requiere que la server
> action **devuelva estado en vez de redirigir** — un `redirect()` en el servidor es
> incompatible con un modal. Patrón a reutilizar en cualquier hoja con la misma forma.

- [ ] **Step 3: Confirmar que `data-model.md` NO necesita cambios**

Este ciclo no tocó esquema. Si has acabado escribiendo una migración, **para**: es señal de que algo se salió del alcance de la spec.

- [ ] **Step 4: Limpiar el entorno**

```bash
git worktree list        # los "prunable" → git worktree prune
```

Borrar a mano las carpetas que sobrevivan en `.claude/worktrees/` tras el prune. **Ojo:** un worktree `locked` con un dev server vivo es OTRA sesión, no basura.

No dejar en segundo plano `next dev`, watchers de Vitest ni servidores de Playwright. Estado limpio = puerto 3000 libre (o un único `next dev`) y cero worktrees huérfanos.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "docs: cerrar el ciclo de registrar sesion v2"
```
