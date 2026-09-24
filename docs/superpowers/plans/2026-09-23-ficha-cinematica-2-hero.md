# Ficha cinemática · PR 2 — Hero único + tarjeta «tu pase» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el shell de dos árboles (hero móvil + raíl/cabecera de PC, topado en 1200px) por un hero cinemático único y responsive con backdrop, una tarjeta «tu pase» en una sola instancia, el CTA en la barra de pestañas cuando se pega, y un contenedor común de ~1320px para hero y pestañas.

**Architecture:** `ItemHero` (servidor) pinta fondo + portada + título + slot `passCard` en una rejilla que coloca la tarjeta bajo el título en móvil y lg, y en tercera columna en xl. `PassCard` (cliente) fusiona `ItemRailActions` y `HeroStatusOrFollow`. `ItemDetailTabs` gana `stickyAction` y un centinela con `IntersectionObserver`. `DETAIL_CONTAINER` es la única fuente del ancho. Salen `item-rail.tsx`, `item-header-wide.tsx`, `item-rail-actions.tsx`, `hero-status-or-follow.tsx`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, next-intl, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md` §1 y §4.

**Depende de:** nada para compilar. Si la PR 1 ya está mergeada, las fichas de peli/serie pasan `backdrop_url`; si no, se pasa `null` y el hero cae a la portada difuminada (Task 5 lo indica).

## Global Constraints

- Contenedor común: `mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10` — exportado como `DETAIL_CONTAINER`, usado por hero, barra de pestañas, panel y esqueletos. Nada de `max-w-4xl` ni `max-w-[1200px]` en la ficha.
- Fondo del hero, por preferencia: backdrop nítido → portada ampliada, difuminada y teñida con el acento → degradado del acento. Nunca texto sobre la imagen nítida: el degradado llega a `--background` antes del bloque de título.
- La portada se pinta **una sola vez** en el DOM. `PassCard` aparece **una sola vez** en el DOM.
- `data-testid="status-badge"` se conserva en el enlace de estado de `PassCard` (lo usan `pase-hub.spec.ts` y `coleccion-status-contrast.spec.ts`).
- El CTA es siempre `bg-accent` (naranja del rol, F3-006), nunca el color del tipo.
- El CTA pegado en las pestañas solo en ≥ lg, y **fuera** del elemento `role="tablist"`.
- Títulos de más de 40 caracteres bajan la serif de PC de 44 a 34px.
- El backdrop es LCP: `next/image` con `priority` y `sizes="100vw"`.
- #437: ningún `use cache` nuevo.
- Node 22 para test/typecheck/e2e: `fnm env | Out-String | Invoke-Expression; fnm use 22; …` en el mismo comando de PowerShell. `.env.local` en el worktree (si no, los e2e con login se saltan en silencio).

---

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/components/detail/detail-container.ts` | Crear | `DETAIL_CONTAINER` |
| `src/components/detail/hero-background.ts` | Crear | `pickHeroBackground()` pura |
| `src/components/detail/hero-background.test.ts` | Crear | Tests de la elección |
| `src/components/detail/pass-card.tsx` | Crear | Tarjeta «tu pase» (cliente) |
| `src/components/detail/pass-card.test.tsx` | Crear | Tests de la tarjeta |
| `src/components/detail/sticky-pass-cta.tsx` | Crear | CTA compacto para la barra pegada |
| `src/components/detail/item-hero.tsx` | Reescribir | Hero cinemático único |
| `src/components/detail/item-shell.tsx` | Reescribir | Envoltorio fino hero + tabs |
| `src/components/detail/item-detail-tabs.tsx` | Modificar | `stickyAction`, centinela, contenedor |
| `src/components/detail/item-detail-tabs.test.tsx` | Crear | Test del CTA pegado |
| `src/components/detail/item-shell-skeleton.tsx`, `item-tabs-skeleton.tsx` | Reescribir | Espejo del hero nuevo |
| `src/app/{libro,pelicula,serie}/[id]/page.tsx` | Modificar | Pasar `passCard`, `backdropUrl`, `stickyAction` |
| `item-rail.tsx`, `item-header-wide.tsx`, `item-rail-actions.tsx`, `hero-status-or-follow.tsx` | Borrar | Sustituidos |
| `src/components/detail/use-follow.ts` | Modificar | Solo el comentario de cabecera |
| `e2e/ficha-cinematica.spec.ts` | Crear | Ancho y posición de la tarjeta |
| `e2e/pase-hub.spec.ts` | Modificar | Comentario del helper `statusBadge` |
| `docs/requirements/decisiones.md`, `docs/redesign/plan-06-ficha.md`, `docs/architecture/graph.json` | Modificar | Doc |

---

### Task 0: Preparar el worktree

- [ ] **Step 1:** Si no se hizo en la PR 1: `Copy-Item ..\..\..\.env.local .env.local` y `fnm env | Out-String | Invoke-Expression; fnm use 22; npm ci`.
- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail` → PASS (baseline).

---

### Task 1: Contenedor común y elección de fondo del hero

**Files:**
- Create: `src/components/detail/detail-container.ts`
- Create: `src/components/detail/hero-background.ts`
- Test: `src/components/detail/hero-background.test.ts`

**Interfaces:**
- Produces:
  - `export const DETAIL_CONTAINER: string`
  - `export type HeroBackground = { kind: "backdrop"; src: string } | { kind: "cover"; src: string } | { kind: "none" }`
  - `export function pickHeroBackground(input: { backdropUrl: string | null; coverUrl: string | null }): HeroBackground`

- [ ] **Step 1: Test que falla**

`src/components/detail/hero-background.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickHeroBackground } from "./hero-background";

describe("pickHeroBackground", () => {
  it("con backdrop, el backdrop manda aunque haya portada", () => {
    expect(
      pickHeroBackground({ backdropUrl: "https://b/x.jpg", coverUrl: "https://c/y.jpg" }),
    ).toEqual({ kind: "backdrop", src: "https://b/x.jpg" });
  });

  it("sin backdrop (todos los libros), cae a la portada", () => {
    expect(pickHeroBackground({ backdropUrl: null, coverUrl: "https://c/y.jpg" })).toEqual({
      kind: "cover",
      src: "https://c/y.jpg",
    });
  });

  it("una cadena vacía cuenta como ausente", () => {
    expect(pickHeroBackground({ backdropUrl: "", coverUrl: "" })).toEqual({ kind: "none" });
  });

  it("sin nada (alta manual recién creada), degradado del acento", () => {
    expect(pickHeroBackground({ backdropUrl: null, coverUrl: null })).toEqual({ kind: "none" });
  });
});
```

- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/hero-background.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`src/components/detail/detail-container.ts`:

```ts
// El ancho de la ficha, en UN sitio (spec 2026-09-23 ficha cinemática §1).
// Hero, barra de pestañas y cuerpo lo comparten para que los bordes alineen de
// arriba abajo. Sustituye al `max-w-4xl` de las pestañas y al
// `lg:max-w-[1200px]` + raíl de 300px del shell viejo, que dejaban el cuerpo de
// cualquier pestaña en ~771px a cualquier viewport (plan 06 §6e).
export const DETAIL_CONTAINER = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10";
```

`src/components/detail/hero-background.ts`:

```ts
// Qué pinta el hero detrás (spec 2026-09-23 §1), por orden de preferencia:
// el backdrop apaisado de TMDB (pelis y series, PR 1), la portada ampliada y
// difuminada (todos los libros, y pelis/series sin backdrop), o un degradado
// del acento del tipo (obra manual sin portada). Pura para poder probarla.
export type HeroBackground =
  | { kind: "backdrop"; src: string }
  | { kind: "cover"; src: string }
  | { kind: "none" };

export function pickHeroBackground({
  backdropUrl,
  coverUrl,
}: {
  backdropUrl: string | null;
  coverUrl: string | null;
}): HeroBackground {
  if (backdropUrl) return { kind: "backdrop", src: backdropUrl };
  if (coverUrl) return { kind: "cover", src: coverUrl };
  return { kind: "none" };
}
```

- [ ] **Step 4:** Mismo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/detail-container.ts src/components/detail/hero-background.ts src/components/detail/hero-background.test.ts
git commit -m "feat(ficha): contenedor común y elección de fondo del hero cinemático"
```

---

### Task 2: `PassCard`

**Files:**
- Create: `src/components/detail/pass-card.tsx`
- Test: `src/components/detail/pass-card.test.tsx`

**Interfaces:**
- Consumes: `useItemStatus()` → `{ status, isSaving }` (`item-status-context.tsx`); `useFollow(itemType, itemId, isLoggedIn)` → `{ follow, isPending }` (`use-follow.ts`); `RatingDots`, `Button`, `PlusIcon`.
- Produces: `export function PassCard(props: PassCardProps)` con

```ts
export type PassCardProps = {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  /** Verbo por tipo de medio («Leyendo», «Viendo»…); `statusVerbs()` del servidor. */
  labels: Record<MediaStatus, string>;
  /** Solo donde hay cursor (libro, serie). La película no lleva barra. */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
  /** null = sin pase activo, o el tipo no ofrece acción. */
  ctaHref: string | null;
  ctaLabel: string;
  ratingLabel: string;
  goToLogLabel: string;
};
```

- [ ] **Step 1: Test que falla**

`src/components/detail/pass-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { MediaStatus } from "@/lib/library/types";
import { ItemStatusProvider } from "./item-status-context";
import { PassCard, type PassCardProps } from "./pass-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/serie/s1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/library/add-existing-item", () => ({ addExistingItemToLibrary: vi.fn() }));

afterEach(cleanup);

const base: PassCardProps = {
  itemType: "series",
  itemId: "s1",
  isLoggedIn: true,
  labels: { planned: "Pendiente", in_progress: "Viendo", completed: "Vista", dropped: "Abandonada" },
  progress: { percent: 41, left: "16 / 39 vistos", right: "41%" },
  rating: 8,
  ctaHref: "/serie/s1?tab=episodes",
  ctaLabel: "Marcar episodio",
  ratingLabel: "Tu nota",
  goToLogLabel: "Ver y cambiar en Mi registro",
};

function renderCard(props: Partial<PassCardProps>, status: MediaStatus | null) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus={status}>
        <PassCard {...base} {...props} />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

describe("PassCard", () => {
  it("sin pase: un único botón «Seguir» y nada más", () => {
    renderCard({}, null);
    expect(screen.getByRole("button", { name: "Seguir" })).toBeTruthy();
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByRole("link", { name: /Marcar episodio/ })).toBeNull();
  });

  it("con pase: estado enlazado a Mi registro, progreso, CTA y nota", () => {
    renderCard({}, "in_progress");
    const badge = screen.getByTestId("status-badge");
    expect(badge.textContent).toContain("Viendo");
    expect(badge.getAttribute("href")).toBe("/serie/s1?tab=log");
    expect(screen.getByText("16 / 39 vistos")).toBeTruthy();
    const cta = screen.getByRole("link", { name: /Marcar episodio/ });
    expect(cta.getAttribute("href")).toBe("/serie/s1?tab=episodes");
    expect(screen.getByText("Tu nota")).toBeTruthy();
  });

  it("la película no pinta barra de progreso", () => {
    renderCard({ itemType: "movie", progress: null, ctaHref: "/pelicula/m1?tab=log", ctaLabel: "Registrar visionado" }, "completed");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("link", { name: /Registrar visionado/ })).toBeTruthy();
  });

  it("con pase pero sin CTA (el tipo no ofrece acción), no hay enlace de acción", () => {
    renderCard({ ctaHref: null }, "planned");
    expect(screen.getByTestId("status-badge")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Marcar episodio/ })).toBeNull();
  });
});
```

- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/pass-card.test.tsx` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`src/components/detail/pass-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { RatingDots } from "@/components/ui/rating-dots";
import { useItemStatus } from "./item-status-context";
import { useFollow } from "./use-follow";

const STATUS_DOT_CLASSES: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

export type PassCardProps = {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  /** Verbo por tipo de medio («Leyendo», «Viendo»…); `statusVerbs()` del servidor. */
  labels: Record<MediaStatus, string>;
  /** Solo donde hay cursor (libro, serie). La película no lleva barra. */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
  /** null = sin pase activo, o el tipo no ofrece acción. */
  ctaHref: string | null;
  ctaLabel: string;
  ratingLabel: string;
  goToLogLabel: string;
};

// «Tu pase» en la cabecera cinemática (spec 2026-09-23 §1): la fusión del panel
// del raíl de PC (ItemRailActions) y de la píldora + CTA del hero móvil
// (HeroStatusOrFollow). Una sola instancia en el DOM; ItemHero la recoloca por
// CSS (bajo el título en móvil y lg, tercera columna en xl).
//
// El CTA es SIEMPRE el naranja del rol (`bg-accent`, F3-006), no el color del
// tipo de medio: el color de tipo es del CONTENIDO, el del CTA es de la acción.
export function PassCard({
  itemType,
  itemId,
  isLoggedIn,
  labels,
  progress,
  rating,
  ctaHref,
  ctaLabel,
  ratingLabel,
  goToLogLabel,
}: PassCardProps) {
  const t = useTranslations("item");
  const { status, isSaving } = useItemStatus();
  const pathname = usePathname();
  const { follow, isPending } = useFollow(itemType, itemId, isLoggedIn);

  const shell =
    "flex flex-col gap-3 rounded-[14px] border border-border bg-surface/90 p-3.5 shadow-[0_18px_40px_-22px_rgba(60,35,15,0.55)] backdrop-blur-md";

  if (!status) {
    return (
      <div className={shell}>
        <Button type="button" disabled={isPending} onClick={follow} className="w-full">
          {isPending ? t("following") : t("follow")}
        </Button>
      </div>
    );
  }

  return (
    <div className={shell}>
      {/* data-testid: lo localizan pase-hub.spec.ts y coleccion-status-contrast.spec.ts. */}
      <Link
        href={`${pathname}?tab=log`}
        title={goToLogLabel}
        data-testid="status-badge"
        aria-busy={isSaving}
        className="flex items-center gap-2.5 rounded-[10px] px-1 py-0.5 text-sm font-semibold text-foreground transition-colors hover:text-foreground-soft"
      >
        <span
          aria-hidden
          className={`h-[9px] w-[9px] shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
        />
        {labels[status]}
      </Link>

      {progress && (
        <div className="px-0.5">
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 overflow-hidden rounded-full border border-border bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-status-in-progress"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{progress.left}</span>
            <span>{progress.right}</span>
          </div>
        </div>
      )}

      {ctaHref && (
        <Link
          href={ctaHref}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <PlusIcon aria-hidden className="h-4 w-4" />
          {ctaLabel}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2.5 px-1">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {ratingLabel}
        </span>
        <RatingDots value={rating} itemType={itemType} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4:** Mismo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/pass-card.tsx src/components/detail/pass-card.test.tsx
git commit -m "feat(ficha): PassCard, la tarjeta «tu pase» única para móvil y PC"
```

---

### Task 3: CTA pegado en la barra de pestañas y contenedor común

**Files:**
- Create: `src/components/detail/sticky-pass-cta.tsx`
- Modify: `src/components/detail/item-detail-tabs.tsx`
- Test: `src/components/detail/item-detail-tabs.test.tsx`

**Interfaces:**
- Consumes: `DETAIL_CONTAINER` (Task 1), `useItemStatus()`.
- Produces:
  - `export function StickyPassCta({ href, label }: { href: string | null; label: string })` — `null` si no hay pase o no hay `href`.
  - `ItemDetailTabs` acepta `stickyAction?: ReactNode`.

- [ ] **Step 1: Test que falla**

`src/components/detail/item-detail-tabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemStatusProvider } from "./item-status-context";
import { ItemDetailTabs } from "./item-detail-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/libro/b1",
  useSearchParams: () => new URLSearchParams(),
}));

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let fire: IOCallback = () => {};

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IOCallback) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTabs() {
  return render(
    <ItemStatusProvider initialStatus="in_progress">
      <ItemDetailTabs
        itemType="book"
        tablistLabel="Secciones de la ficha"
        labels={{ info: "Información", community: "Comunidad", log: "Mi registro" }}
        info={<p>info</p>}
        community={<p>comunidad</p>}
        log={<p>registro</p>}
        stickyAction={<a href="/sesion/p1">Registrar sesión</a>}
      />
    </ItemStatusProvider>,
  );
}

describe("ItemDetailTabs · stickyAction", () => {
  it("el CTA no se ve mientras la barra no está pegada", () => {
    renderTabs();
    const slot = screen.getByTestId("tabs-sticky-action");
    expect(slot.className).toContain("hidden");
  });

  it("aparece cuando el centinela sale por arriba (barra pegada)", () => {
    renderTabs();
    act(() => fire([{ isIntersecting: false, boundingClientRect: { top: -10 } as DOMRectReadOnly }]));
    expect(screen.getByTestId("tabs-sticky-action").className).toContain("lg:flex");
  });

  it("el CTA vive FUERA del tablist (un enlace dentro de role=tablist rompe el patrón ARIA)", () => {
    renderTabs();
    const tablist = screen.getByRole("tablist");
    expect(tablist.contains(screen.getByTestId("tabs-sticky-action"))).toBe(false);
  });
});
```

- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/item-detail-tabs.test.tsx` → FAIL (`tabs-sticky-action` no existe).

- [ ] **Step 3: Implementar `StickyPassCta`**

`src/components/detail/sticky-pass-cta.tsx`:

```tsx
"use client";

import Link from "next/link";
import { PlusIcon } from "@/components/ui/icons";
import { useItemStatus } from "./item-status-context";

// La versión compacta del CTA de PassCard, para la barra de pestañas cuando se
// pega arriba (spec 2026-09-23 §1): la tarjeta no acompaña al scroll, esto sí.
// Solo con pase activo y acción disponible; ItemDetailTabs decide CUÁNDO se ve.
export function StickyPassCta({ href, label }: { href: string | null; label: string }) {
  const { status } = useItemStatus();
  if (!status || !href) return null;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap text-accent-foreground transition-colors hover:bg-accent-hover"
    >
      <PlusIcon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 4: Modificar `ItemDetailTabs`**

En `src/components/detail/item-detail-tabs.tsx`:

1. Imports: `import { useEffect, useRef, useState, type ReactNode } from "react";` y `import { DETAIL_CONTAINER } from "./detail-container";`.
2. Props: añadir `stickyAction` a la desestructuración y al tipo:

```ts
  /** CTA compacto (StickyPassCta) que aparece a la derecha cuando la barra se pega. Solo ≥ lg. */
  stickyAction?: ReactNode;
```

3. Tras `const tabRefs = …` / `onTabKey`, añadir el centinela:

```ts
  // ¿Está la barra pegada bajo la topbar? Un centinela de 1px justo ENCIMA de
  // ella: cuando sale por arriba (por encima de --topbar-h), la barra ya va
  // pegada. IntersectionObserver y no un listener de scroll: no corre en cada
  // frame. Solo se monta si hay CTA que enseñar.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !stickyAction) return;
    const topbar =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 59;
    const io = new IntersectionObserver(
      ([entry]) => {
        setStuck(!entry.isIntersecting && (entry.boundingClientRect?.top ?? 0) < topbar);
      },
      { rootMargin: `-${topbar}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stickyAction]);
```

4. Sustituir el `return (...)` por (misma lógica de pestañas, cambia la envoltura y el contenedor):

```tsx
  return (
    <div className="flex flex-col">
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div className="sticky top-[var(--topbar-h)] z-10 border-b border-border bg-background/90 backdrop-blur-md lg:bg-background/80 lg:backdrop-blur-[10px]">
        <div className={`${DETAIL_CONTAINER} flex items-center gap-4`}>
          <div
            role="tablist"
            aria-label={tablistLabel}
            className="flex min-w-0 flex-1 gap-5 lg:gap-7"
          >
            {order.map((id, index) => {
              const isActive = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`item-tab-${id}`}
                  aria-selected={isActive}
                  aria-controls={`item-tabpanel-${id}`}
                  tabIndex={isActive ? 0 : -1}
                  ref={(el) => {
                    tabRefs.current[id] = el;
                  }}
                  onKeyDown={(e) => onTabKey(e, index)}
                  onClick={() => selectTab(id)}
                  className={`relative pt-3 pb-[11px] text-[13.5px] font-semibold whitespace-nowrap transition-colors lg:py-3.5 lg:text-sm ${
                    isActive
                      ? "text-foreground lg:font-semibold"
                      : "text-muted-foreground hover:text-foreground lg:font-medium lg:hover:text-foreground"
                  }`}
                >
                  {labels[id]}
                  {isActive && (
                    <span
                      aria-hidden
                      className={`absolute inset-x-0 -bottom-px h-0.5 rounded-sm ${accent.bg}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {stickyAction && (
            <div
              data-testid="tabs-sticky-action"
              className={stuck ? "hidden shrink-0 items-center lg:flex" : "hidden"}
            >
              {stickyAction}
            </div>
          )}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`item-tabpanel-${tab}`}
        aria-labelledby={`item-tab-${tab}`}
        tabIndex={0}
        className={`${DETAIL_CONTAINER} py-6 lg:pt-[34px] lg:pb-[42px]`}
      >
        {slots[tab]}
      </div>
    </div>
  );
```

Conservar los comentarios explicativos existentes (piel de las pestañas, panel único) encima de los bloques equivalentes.

- [ ] **Step 5:** `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail` → PASS (incluida `episode-panel.test.tsx`, que no debe cambiar).

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/sticky-pass-cta.tsx src/components/detail/item-detail-tabs.tsx src/components/detail/item-detail-tabs.test.tsx
git commit -m "feat(ficha): CTA en la barra de pestañas al pegarse y contenedor común de 1320px"
```

---

### Task 4: `ItemHero` cinemático, `ItemShell` fino y esqueletos

**Files:**
- Rewrite: `src/components/detail/item-hero.tsx`
- Rewrite: `src/components/detail/item-shell.tsx`
- Rewrite: `src/components/detail/item-shell-skeleton.tsx`
- Modify: `src/components/detail/item-tabs-skeleton.tsx`

**Interfaces:**
- Consumes: `DETAIL_CONTAINER`, `pickHeroBackground` (Task 1); `ImageZoom`, `BackButton`, `RatingDots`, `formatDots`, `GenreTag`, `MEDIA_ACCENT`, iconos.
- Produces: `ItemShell` con esta firma (la usan las tres páginas en Task 5):

```ts
{
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  /** Backdrop de TMDB (PR 1); null en libros y en obras sin él. */
  backdropUrl: string | null;
  avgRating: number | null;
  ratingsLabel: string;
  backLabel: string;
  /** El menú ⋯ de la barra superior — solo móvil. */
  menuSlot?: ReactNode;
  /** <PassCard/>, una sola instancia. */
  passCard: ReactNode;
  tabs: ReactNode;
}
```

- [ ] **Step 1: Reescribir `item-hero.tsx`**

```tsx
import Image from "next/image";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { GenreTag } from "@/components/ui/genre-tag";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";
import { ImageZoom } from "@/components/ui/image-zoom";
import { BackButton } from "./back-button";
import { DETAIL_CONTAINER } from "./detail-container";
import { pickHeroBackground, type HeroBackground } from "./hero-background";

const TYPE_ICON = {
  book: BookIcon,
  movie: FilmIcon,
  series: SeriesIcon,
} as const;

// Umbral a partir del cual la serif de PC baja de 44 a 34px (spec §4).
const LONG_TITLE = 40;

// Hero cinemático de la ficha (spec 2026-09-23-ficha-cinematica-design.md §1):
// UN árbol para móvil y PC, no dos que se esconden por breakpoint como antes.
//
// - Fondo a todo el ancho: backdrop de TMDB → portada difuminada y teñida →
//   degradado del acento (pickHeroBackground). El degradado llega a
//   --background ANTES del bloque de título: nunca hay texto sobre la imagen
//   nítida, tampoco en oscuro (el token cambia solo).
// - Rejilla de tres piezas y la tarjeta «tu pase» en UNA sola instancia:
//     móvil/lg → [portada | título] y la tarjeta debajo, a lo ancho del título
//     xl       → [portada | título | tarjeta], alineadas por abajo
//   En lg estrecho (1024–1279) la tarjeta cae bajo el título en vez de
//   aplastarlo (spec §4).
// - La barra ← · tipo · ⋯ solo en móvil: en PC ya está la topbar del sitio.
export function ItemHero({
  itemType,
  mediaLabel,
  title,
  byline,
  genres,
  coverUrl,
  backdropUrl,
  avgRating,
  ratingsLabel,
  backLabel,
  menuSlot,
  passCard,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  backdropUrl: string | null;
  /** Nota media 1–10 de la comunidad, o null si nadie ha puntuado. */
  avgRating: number | null;
  ratingsLabel: string;
  backLabel: string;
  menuSlot?: ReactNode;
  passCard: ReactNode;
}) {
  const accent = MEDIA_ACCENT[itemType];
  const Icon = TYPE_ICON[itemType];
  const background = pickHeroBackground({ backdropUrl, coverUrl });
  const coverClass = `relative h-[165px] w-[110px] shrink-0 overflow-hidden rounded-[6px] border-2 ${accent.border} bg-surface-muted shadow-cover sm:h-[210px] sm:w-[140px] lg:h-[300px] lg:w-[200px]`;
  const titleSize =
    title.length > LONG_TITLE ? "lg:text-[34px]" : "lg:text-[44px]";

  return (
    <div className="relative">
      <HeroBackdrop background={background} itemType={itemType} />

      <div className={`relative ${DETAIL_CONTAINER} pt-3.5 pb-5 lg:pt-[190px] lg:pb-8`}>
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <BackButton label={backLabel} />
          <span
            className={`truncate font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase ${accent.text}`}
          >
            {mediaLabel}
          </span>
          {menuSlot ?? <span aria-hidden className="h-[34px] w-[34px] shrink-0" />}
        </div>

        <div className="mt-[64px] grid grid-cols-[110px_minmax(0,1fr)] items-end gap-x-4 gap-y-4 sm:mt-[48px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-x-6 lg:mt-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-9 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
          {coverUrl ? (
            <ImageZoom src={coverUrl} alt={title} className={coverClass}>
              <Image
                src={coverUrl}
                alt={title}
                fill
                priority
                sizes="(max-width: 640px) 110px, (max-width: 1024px) 140px, 200px"
                className="object-cover"
              />
            </ImageZoom>
          ) : (
            <div className={coverClass}>
              <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                {title}
              </div>
            </div>
          )}

          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`hidden items-center gap-1.5 rounded-chip border ${accent.borderSoft} ${accent.bgSoft} px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider ${accent.text} uppercase lg:inline-flex`}
              >
                <Icon className="h-3 w-3" />
                {mediaLabel}
              </span>
              {genres.slice(0, 3).map((g) => (
                <GenreTag key={g} label={g} />
              ))}
            </div>

            <h1
              className={`mt-2 font-serif text-[25px] leading-[1.05] font-semibold sm:text-[32px] lg:mt-3 lg:leading-[1.02] lg:tracking-[-0.01em] ${titleSize}`}
            >
              {title}
            </h1>

            {byline && (
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground lg:mt-2.5 lg:font-serif lg:text-[20px] lg:text-foreground-soft">
                {byline}
              </p>
            )}

            {avgRating !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-2.5 lg:mt-4">
                <RatingDots value={avgRating} size="sm" itemType={itemType} />
                <span
                  className={`font-serif text-[22px] leading-none font-semibold lg:text-[26px] ${accent.text}`}
                >
                  {formatDots(avgRating)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground lg:text-[11px]">
                  {ratingsLabel}
                </span>
              </div>
            )}
          </div>

          <div className="col-span-2 lg:col-span-1 lg:col-start-2 xl:col-start-3">
            {passCard}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroBackdrop({
  background,
  itemType,
}: {
  background: HeroBackground;
  itemType: ItemType;
}) {
  const accent = MEDIA_ACCENT[itemType];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[240px] overflow-hidden sm:h-[280px] lg:h-[420px]"
    >
      {background.kind === "backdrop" && (
        // El backdrop es el LCP de la ficha de peli/serie: precarga.
        <Image
          src={background.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_25%]"
        />
      )}
      {background.kind === "cover" && (
        <>
          {/* Misma URL que la portada en primer plano (el loader colapsa los
              buckets, ver cdn-loader.ts): reaprovecha su precarga. */}
          <Image
            src={background.src}
            alt=""
            fill
            sizes="100vw"
            className="scale-125 object-cover opacity-60 blur-2xl"
          />
          <div className={`absolute inset-0 ${accent.bg} opacity-30 mix-blend-multiply`} />
        </>
      )}
      {background.kind === "none" && <div className={`absolute inset-0 ${accent.bgSoft}`} />}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-20% via-background/75 via-60% to-background" />
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `item-shell.tsx`**

```tsx
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { ItemHero } from "./item-hero";

// La ficha: hero cinemático + pestañas (spec 2026-09-23-ficha-cinematica-design.md).
//
// Hasta el 2026-09 eran DOS árboles —hero de móvil y raíl de 300px + cabecera
// de PC— escondidos por breakpoint, dentro de un contenedor de 1200px: el cuerpo
// de cualquier pestaña se quedaba en ~771px a cualquier viewport (plan 06 §6e).
// Ahora es un árbol: el ancho lo fija DETAIL_CONTAINER, compartido con las
// pestañas.
//
// Las pestañas siguen llegando como slot y se pintan UNA vez, así que el
// <Suspense> que las envuelve (Fase B del plan 00) sigue intacto.
export function ItemShell({
  itemType,
  mediaLabel,
  title,
  byline,
  genres,
  coverUrl,
  backdropUrl,
  avgRating,
  ratingsLabel,
  backLabel,
  menuSlot,
  passCard,
  tabs,
}: {
  itemType: ItemType;
  mediaLabel: string;
  title: string;
  byline: string | null;
  genres: string[];
  coverUrl: string | null;
  /** Backdrop de TMDB (PR 1); null en libros y en obras sin él. */
  backdropUrl: string | null;
  avgRating: number | null;
  ratingsLabel: string;
  backLabel: string;
  /** El menú ⋯ de la barra superior — solo móvil. */
  menuSlot?: ReactNode;
  /** <PassCard/>, una sola instancia. */
  passCard: ReactNode;
  tabs: ReactNode;
}) {
  return (
    <div className="w-full">
      <ItemHero
        itemType={itemType}
        mediaLabel={mediaLabel}
        title={title}
        byline={byline}
        genres={genres}
        coverUrl={coverUrl}
        backdropUrl={backdropUrl}
        avgRating={avgRating}
        ratingsLabel={ratingsLabel}
        backLabel={backLabel}
        menuSlot={menuSlot}
        passCard={passCard}
      />
      {tabs}
    </div>
  );
}
```

- [ ] **Step 3: Esqueletos**

`src/components/detail/item-shell-skeleton.tsx`:

```tsx
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SkeletonLine } from "@/components/ui/skeleton";
import { DETAIL_CONTAINER } from "./detail-container";
import { ItemTabsSkeleton } from "./item-tabs-skeleton";

// Espejo de ItemHero (misma rejilla y mismas alturas) para que al llegar la
// ficha no salte nada.
export function ItemShellSkeleton({ itemType }: { itemType: ItemType }) {
  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="w-full">
      <div className="relative">
        <div
          aria-hidden
          className={`absolute inset-x-0 top-0 h-[240px] sm:h-[280px] lg:h-[420px] ${accent.bgSoft}`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/75 to-background" />
        </div>
        <div className={`relative ${DETAIL_CONTAINER} pt-3.5 pb-5 lg:pt-[190px] lg:pb-8`}>
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <SkeletonLine className="w-16" />
            <SkeletonLine className="w-20" />
            <span aria-hidden className="h-[34px] w-[34px] shrink-0" />
          </div>
          <div className="mt-[64px] grid grid-cols-[110px_minmax(0,1fr)] items-end gap-x-4 gap-y-4 sm:mt-[48px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-x-6 lg:mt-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-9 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
            <div
              className={`h-[165px] w-[110px] animate-pulse rounded-[6px] border-2 ${accent.border} bg-surface-muted sm:h-[210px] sm:w-[140px] lg:h-[300px] lg:w-[200px]`}
            />
            <div className="min-w-0 pb-1">
              <SkeletonLine className="w-28" />
              <SkeletonLine className="mt-3 h-7 w-3/4" />
              <SkeletonLine className="mt-2 w-1/2" />
            </div>
            <div className="col-span-2 h-[120px] animate-pulse rounded-[14px] border border-border bg-surface-muted lg:col-span-1 lg:col-start-2 xl:col-start-3" />
          </div>
        </div>
      </div>
      <ItemTabsSkeleton />
    </div>
  );
}
```

En `src/components/detail/item-tabs-skeleton.tsx`: importar `DETAIL_CONTAINER` desde `./detail-container` y sustituir `className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"` por ``className={`${DETAIL_CONTAINER} py-8`}``.

- [ ] **Step 4: Typecheck parcial**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit
```

Expected: errores SOLO en las tres páginas (`statusSlot`/`railActions` ya no existen; faltan `passCard`/`backdropUrl`). Se arreglan en la Task 5; no commitear aún si el repo exige verde por commit — en ese caso, hacer las Tasks 4 y 5 en un único commit.

---

### Task 5: Cablear las tres fichas y borrar lo sustituido

**Files:**
- Modify: `src/app/libro/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`
- Delete: `src/components/detail/item-rail.tsx`, `item-header-wide.tsx`, `item-rail-actions.tsx`, `hero-status-or-follow.tsx`
- Modify: `src/components/detail/use-follow.ts` (comentario de cabecera)

**Interfaces:**
- Consumes: `ItemShell` (Task 4), `PassCard` (Task 2), `StickyPassCta` + `stickyAction` (Task 3).

- [ ] **Step 1: Película**

En `src/app/pelicula/[id]/page.tsx`:

1. Imports: quitar `ItemRailActions` y `HeroStatusOrFollow`; añadir `import { PassCard } from "@/components/detail/pass-card";` y `import { StickyPassCta } from "@/components/detail/sticky-pass-cta";`. Quitar `heroStatusLabels` del import de `@/lib/library/hero-status-labels` (se queda `statusVerbs`).
2. Borrar `const statusLabels = await heroStatusLabels("movie");` y su comentario.
3. En `<ItemShell …>`: borrar `statusSlot={…}` y `railActions={…}`; añadir:

```tsx
        backdropUrl={movie.backdrop_url ?? null}
        passCard={
          <PassCard
            itemType="movie"
            itemId={movie.id}
            isLoggedIn={Boolean(user)}
            labels={railLabels}
            progress={null}
            rating={activePass?.rating ?? null}
            ctaHref={activePass ? `/pelicula/${movie.id}?tab=log` : null}
            ctaLabel={tDetail("rail.cta.movie")}
            ratingLabel={tDetail("rail.yourRating")}
            goToLogLabel={tDetail("rail.goToLog")}
          />
        }
```

(Si la PR 1 aún no está mergeada, `movie.backdrop_url` no existe en el `select`: usar `backdropUrl={null}` y dejar una nota en la descripción de la PR para cambiarlo al rebasar.)

4. En `MovieTabs`, en `<ItemDetailTabs …>` añadir:

```tsx
      stickyAction={
        <StickyPassCta
          href={activeRow ? `/pelicula/${movie.id}?tab=log` : null}
          label={tDetail("rail.cta.movie")}
        />
      }
```

- [ ] **Step 2: Serie**

En `src/app/serie/[id]/page.tsx`, lo mismo con:
- Borrar `statusLabels` (incluida su variante con `upToDateLabel`, ~l.254–265) y el import de `heroStatusLabels`; **conservar** `railLabels` con su variante `upToDateLabel`.
- `backdropUrl={series.backdrop_url ?? null}` (o `null` si la PR 1 no está).
- `passCard={<PassCard itemType="series" itemId={series.id} isLoggedIn={Boolean(user)} labels={railLabels} progress={railProgress} rating={activePass?.rating ?? null} ctaHref={activePass ? `/serie/${series.id}?tab=episodes` : null} ctaLabel={tDetail("rail.cta.series")} ratingLabel={tDetail("rail.yourRating")} goToLogLabel={tDetail("rail.goToLog")} />}`
- En `SeriesTabs` → `<ItemDetailTabs stickyAction={<StickyPassCta href={activeRow ? `/serie/${series.id}?tab=episodes` : null} label={tDetail("rail.cta.series")} />} …>`. Usar el nombre de variable del pase activo que ya exista en `SeriesTabs` (buscar la consulta `.eq("is_active", true)` dentro de esa función).

- [ ] **Step 3: Libro**

En `src/app/libro/[id]/page.tsx`, lo mismo con:
- `backdropUrl={null}` (los libros no tienen backdrop de TMDB; el hero usa la portada).
- `passCard={<PassCard itemType="book" itemId={book.id} isLoggedIn={Boolean(user)} labels={railLabels} progress={railProgress} rating={activePass?.rating ?? null} ctaHref={activePass ? `/sesion/${activePass.id}` : null} ctaLabel={tDetail("rail.cta.book")} ratingLabel={tDetail("rail.yourRating")} goToLogLabel={tDetail("rail.goToLog")} />}`
- En `BookTabs` → `stickyAction={<StickyPassCta href={<paseActivo> ? `/sesion/${<paseActivo>.id}` : null} label={tDetail("rail.cta.book")} />}`, con `<paseActivo>` = la variable del pase activo de `BookTabs` (la consulta `.eq("is_active", true)` que selecciona `id`).

- [ ] **Step 4: Borrar lo sustituido y actualizar el comentario de `useFollow`**

```bash
git rm src/components/detail/item-rail.tsx src/components/detail/item-header-wide.tsx src/components/detail/item-rail-actions.tsx src/components/detail/hero-status-or-follow.tsx
```

En `src/components/detail/use-follow.ts`, sustituir las tres primeras líneas del comentario de cabecera por:

```ts
// Acción "Seguir" de la ficha. La usa PassCard (una sola tarjeta para móvil y
// PC desde la ficha cinemática, 2026-09); antes la compartían el hero de móvil
// y el raíl de PC. Queda en su propio hook para que la lógica no se duplique.
```

Buscar referencias rotas:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npm run lint
```

Expected: limpio. Si `heroStatusLabels` queda sin usar en todo `src/`, dejarlo (es una exportación, no rompe lint) y anotarlo como issue `tipo:deuda P3` al cerrar.

- [ ] **Step 5: Unitarios completos**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run
```

Expected: PASS.

- [ ] **Step 6: Commit** (incluye la Task 4 si no se commiteó)

```bash
git add -A src/components/detail "src/app/libro/[id]/page.tsx" "src/app/pelicula/[id]/page.tsx" "src/app/serie/[id]/page.tsx"
git commit -m "feat(ficha): hero cinemático único con PassCard; fuera el raíl y el tope de 1200px"
```

---

### Task 6: e2e y verificación visual

**Files:**
- Create: `e2e/ficha-cinematica.spec.ts`
- Modify: `e2e/pase-hub.spec.ts` (solo el comentario de `statusBadge`)

- [ ] **Step 1: Escribir la spec**

`e2e/ficha-cinematica.spec.ts` (ficha pública de DEV que ya usa `navegacion-anonima.spec.ts`; anónimo, así no ensucia datos):

```ts
import { expect, test } from "@playwright/test";

// Ficha cinemática (spec 2026-09-23). Lo que protege:
// 1. El bug que motivó el rediseño, con número: el cuerpo de las pestañas
//    medía ~771px a CUALQUIER viewport (raíl de 300 + tope de 1200).
// 2. La tarjeta «tu pase» existe una sola vez y se coloca donde toca.
// 3. En móvil no hay scroll horizontal.
const BOOK = "/libro/3e80b690-ceef-49fb-b442-ecd2ea88be83";

test.describe("PC 1600", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("el cuerpo de las pestañas usa el ancho (> 1100px)", async ({ page }) => {
    await page.goto(BOOK);
    const panel = page.getByRole("tabpanel");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.width).toBeGreaterThan(1100);
  });

  test("una sola tarjeta, a la derecha del título", async ({ page }) => {
    await page.goto(BOOK);
    const follow = page.getByRole("button", { name: /^seguir$/i });
    await expect(follow).toHaveCount(1);
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    const card = await follow.boundingBox();
    expect(card!.x).toBeGreaterThan(title!.x + 200);
  });
});

test.describe("móvil 375", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("la tarjeta va bajo el hero, antes de las pestañas, sin scroll horizontal", async ({ page }) => {
    await page.goto(BOOK);
    const follow = page.getByRole("button", { name: /^seguir$/i });
    await expect(follow).toBeVisible();
    const card = await follow.boundingBox();
    const tabs = await page.getByRole("tablist").boundingBox();
    const cover = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(card!.y).toBeGreaterThan(cover!.y);
    expect(card!.y).toBeLessThan(tabs!.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Comentario de `pase-hub.spec.ts`**

En `e2e/pase-hub.spec.ts`, en el comentario sobre `statusBadge` (~l.132–147), sustituir el párrafo que empieza por «`:visible` porque el estado se pinta en DOS sitios…» por:

```ts
// `:visible` por robustez: desde la ficha cinemática (2026-09) el estado se
// pinta en UN solo sitio, el enlace de estado de PassCard, a cualquier ancho.
```

El helper no cambia: la etiqueta de PassCard es el verbo («Viendo»), que casa por subcadena igual que antes.

- [ ] **Step 3: Ejecutar contra build de producción**

Regla #437: e2e contra `next build` + `next start`, no solo `next dev`. Comprobar antes que el puerto 3000 está libre (`Get-NetTCPConnection -LocalPort 3000`).

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npm run build; Start-Process -NoNewWindow npx -ArgumentList "next","start","-p","3000"
```

Esperar a que responda (`curl http://localhost:3000` → 200) y:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test e2e/ficha-cinematica.spec.ts e2e/pase-hub.spec.ts e2e/coleccion-status-contrast.spec.ts e2e/navegacion-anonima.spec.ts e2e/serie-resenas-de-pase.spec.ts e2e/registrar-sesion-v2.spec.ts
```

Expected: PASS, y **sin** una avalancha de `skipped` (si la hay, falta `.env.local`). Parar el `next start` al acabar (`Get-Process node | Stop-Process`).

- [ ] **Step 4: Verificación visual**

Con `next dev` (uno solo, en 3000), capturar libro, película y serie a 375×812 y 1600×1000, en claro y oscuro (`resize_window` con `colorScheme`). Comprobar a ojo: ningún texto sobre la imagen nítida; tarjeta a la derecha en 1600, bajo el título a 1100 (lg estrecho), bajo el hero en 375; título largo (>40 caracteres) en 34px; CTA en la barra de pestañas al hacer scroll con sesión y pase activo. Ajustar alturas/márgenes (`lg:pt-[190px]`, `mt-[64px]`) si la portada no monta bien sobre el degradado. Adjuntar las capturas a la PR.

- [ ] **Step 5: Commit**

```bash
git add e2e/ficha-cinematica.spec.ts e2e/pase-hub.spec.ts
git commit -m "test(ficha): e2e del ancho del cuerpo y la posición de la tarjeta «tu pase»"
```

---

### Task 7: Documentación y PR

**Files:**
- Modify: `docs/requirements/decisiones.md` (append al final)
- Modify: `docs/redesign/plan-06-ficha.md` (§6e)
- Modify: `docs/architecture/graph.json` (nodo `c-detail`)

- [ ] **Step 1: `decisiones.md`** — añadir al final:

```markdown
## 2026-09-24 — Ficha de obra: se abandona el raíl lateral por un hero cinemático

**Contexto.** El shell de PC del plan 06 (raíl sticky de 300px con la portada + contenedor de
1200px) dejaba el cuerpo de cualquier pestaña en ~771px a cualquier viewport; el plan 06 §6e ya
lo registró como «choque de shells». Además la ficha eran dos árboles (móvil y PC) escondidos por
breakpoint.

**Decisión.** Un solo hero responsive con backdrop de TMDB (portada difuminada en libros), una
tarjeta «tu pase» (`PassCard`) en una sola instancia —flotante a la derecha en xl, bajo el título
en lg y móvil— y un contenedor común de 1320px (`DETAIL_CONTAINER`) para hero y pestañas. El CTA
reaparece en la barra de pestañas cuando se pega.

**Descartado.** Cabecera editorial sin foto + 3 columnas; raíl ensanchado; reestilizar los dos
árboles; ficha v2 tras flag. Spec: `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md`.
```

- [ ] **Step 2: `plan-06-ficha.md` §6e** — añadir tras la tabla del choque de shells:

```markdown
> **Resuelto el 2026-09-24** a favor del shell SIN raíl: ficha cinemática
> (`docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md`). El cuerpo pasa a ~1240px; la
> tercera columna de Episodios (PC·1) vuelve a caber y es la PR 4 de esa spec.
```

- [ ] **Step 3: `graph.json`** — en el nodo `c-detail`, cambiar `summary` a `"Hero cinemático único (backdrop TMDB / portada teñida), PassCard y pestañas con CTA pegado; contenedor común DETAIL_CONTAINER (1320px)."`. Comprobar que el JSON sigue siendo válido: `node -e "JSON.parse(require('fs').readFileSync('docs/architecture/graph.json','utf8'))"`.

- [ ] **Step 4: Commit y PR**

```bash
git add docs/requirements/decisiones.md docs/redesign/plan-06-ficha.md docs/architecture/graph.json
git commit -m "docs: la ficha abandona el raíl lateral por el hero cinemático"
```

PR `feat(ficha): hero cinemático único y tarjeta «tu pase» (PR 2/4)` con: resumen, enlace a la spec, capturas 375/1600 claro/oscuro de los tres tipos, resultado de los e2e contra build de producción, y la nota #437 («no se añade `use cache`»).
