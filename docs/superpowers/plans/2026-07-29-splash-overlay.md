# Splash Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una pantalla de carga de marca (overlay cold-start) que clava el frame #2 del mockup: tres lomos sobre terracota, "Biblioshare" y tagline al pie.

**Architecture:** Componente cliente `SplashScreen` que se renderiza en el HTML SSR (cubre desde el primer paint, sin flash), montado en el root layout dentro de `NextIntlClientProvider`. Se desvanece por tiempo mínimo + fade tras la hidratación, sin depender de datos. La marca de tres lomos se factoriza en `BrandMark` (DOM) apoyado en un helper de geometría puro y testeable.

**Tech Stack:** Next.js (App Router), React client components, next-intl, Tailwind, Vitest (unit, node), Playwright (e2e).

## Global Constraints

- Locale único `es`; todo texto de usuario vía next-intl (`messages/es.json`). "Biblioshare" es marca → literal, no se traduce.
- Vitest corre en entorno `node` y solo incluye `src/**/*.test.ts` (pure functions, sin DOM). Los componentes React NO se testean con Vitest; su comportamiento va a e2e Playwright (`e2e/*.spec.ts`).
- Colores de los lomos = versiones aclaradas del app-icon: libro `#e8b06a`, película `#7fc6c9`, serie `#caa2d0`. NO usar los `--type-*` (no contrastan sobre terracota).
- Fondo splash `var(--accent)` (terracota), siempre — independiente del theme.
- Razones del mockup (contenedor/lomo alto = 120): ancho lomo 24, gap 12, alturas 82/120/60, radius `6px 6px 3px 3px`.
- Un solo `next dev` en puerto 3000 (ver AGENTS.md). Playwright reutiliza el dev server existente.

---

### Task 1: Helper de geometría de la marca (puro)

**Files:**
- Create: `src/components/brand/brand-mark-geometry.ts`
- Test: `src/components/brand/brand-mark-geometry.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type SpineGeom = { width: number; height: number; radiusTop: number; radiusBottom: number }`
  - `type BrandMarkGeom = { gap: number; spines: [SpineGeom, SpineGeom, SpineGeom] }`
  - `function brandMarkGeom(height: number): BrandMarkGeom` — `height` = alto del lomo más alto (= alto del contenedor).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/brand/brand-mark-geometry.test.ts
import { describe, expect, it } from "vitest";
import { brandMarkGeom } from "./brand-mark-geometry";

describe("brandMarkGeom", () => {
  it("reproduce las medidas del mockup a 120px", () => {
    const g = brandMarkGeom(120);
    expect(g.gap).toBe(12);
    expect(g.spines.map((s) => s.width)).toEqual([24, 24, 24]);
    expect(g.spines.map((s) => s.height)).toEqual([82, 120, 60]);
    expect(g.spines[0].radiusTop).toBe(6);
    expect(g.spines[0].radiusBottom).toBe(3);
  });

  it("escala proporcionalmente a otros tamaños", () => {
    const g = brandMarkGeom(60);
    expect(g.gap).toBe(6);
    expect(g.spines.map((s) => s.width)).toEqual([12, 12, 12]);
    expect(g.spines.map((s) => s.height)).toEqual([41, 60, 30]);
    expect(g.spines[1].radiusTop).toBe(3);
    expect(g.spines[1].radiusBottom).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/brand/brand-mark-geometry.test.ts`
Expected: FAIL — no puede resolver `./brand-mark-geometry` / `brandMarkGeom is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/brand/brand-mark-geometry.ts
// Geometría de la marca de tres lomos, derivada de las razones del mockup
// "Marca en producto" (contenedor de 120 → ancho 24, gap 12, alturas 82/120/60,
// radius 6/3). `height` es el alto del lomo más alto (= alto del contenedor);
// todo lo demás escala proporcionalmente.
export type SpineGeom = {
  width: number;
  height: number;
  radiusTop: number;
  radiusBottom: number;
};

export type BrandMarkGeom = {
  gap: number;
  spines: [SpineGeom, SpineGeom, SpineGeom];
};

const WIDTH_RATIO = 24 / 120;
const GAP_RATIO = 12 / 120;
const RADIUS_TOP_RATIO = 6 / 24; // sobre el ancho del lomo
const RADIUS_BOTTOM_RATIO = 3 / 24;
const HEIGHT_RATIOS = [82 / 120, 120 / 120, 60 / 120] as const;

export function brandMarkGeom(height: number): BrandMarkGeom {
  const width = height * WIDTH_RATIO;
  const spine = (r: number): SpineGeom => ({
    width,
    height: height * r,
    radiusTop: width * RADIUS_TOP_RATIO,
    radiusBottom: width * RADIUS_BOTTOM_RATIO,
  });
  return {
    gap: height * GAP_RATIO,
    spines: [spine(HEIGHT_RATIOS[0]), spine(HEIGHT_RATIOS[1]), spine(HEIGHT_RATIOS[2])],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/brand/brand-mark-geometry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/brand/brand-mark-geometry.ts src/components/brand/brand-mark-geometry.test.ts
git commit -m "feat(brand): helper de geometría de la marca de tres lomos"
```

---

### Task 2: Componentes `BrandMark` y `SplashScreen` + i18n

**Files:**
- Create: `src/components/brand/brand-mark.tsx`
- Create: `src/components/splash/splash-screen.tsx`
- Modify: `messages/es.json` (añadir namespace `splash`)

**Interfaces:**
- Consumes: `brandMarkGeom` de Task 1.
- Produces:
  - `function BrandMark(props: { height: number; className?: string }): JSX.Element` — marca DOM decorativa (`aria-hidden`).
  - `function SplashScreen(): JSX.Element | null` — overlay cliente; se auto-desmonta.

- [ ] **Step 1: Añadir la clave i18n**

En `messages/es.json`, añade un namespace `splash` de nivel superior (junto a los demás, p. ej. tras `"offline"`):

```json
  "splash": {
    "tagline": "Tu biblioteca de todo, compartida"
  },
```

- [ ] **Step 2: Crear `BrandMark`**

```tsx
// src/components/brand/brand-mark.tsx
import { brandMarkGeom } from "./brand-mark-geometry";

// Marca de la app: tres lomos (libro / película / serie) alineados abajo.
// Colores aclarados del app-icon — NO los --type-*, que sobre terracota no
// contrastan. Decorativa: aria-hidden.
const SPINE_COLORS = ["#e8b06a", "#7fc6c9", "#caa2d0"] as const;

export function BrandMark({ height, className }: { height: number; className?: string }) {
  const geom = brandMarkGeom(height);
  return (
    <div
      aria-hidden
      className={className}
      style={{ display: "flex", alignItems: "flex-end", gap: geom.gap }}
    >
      {geom.spines.map((s, i) => (
        <span
          key={i}
          style={{
            width: s.width,
            height: s.height,
            background: SPINE_COLORS[i],
            borderRadius: `${s.radiusTop}px ${s.radiusTop}px ${s.radiusBottom}px ${s.radiusBottom}px`,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Crear `SplashScreen`**

```tsx
// src/components/splash/splash-screen.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/brand/brand-mark";

// Overlay de carga cold-start. Se renderiza en el HTML SSR (cubre desde el
// primer paint, sin flash de app-antes-de-splash) y se desvanece tras la
// hidratación: tiempo mínimo visible para que la marca se registre + fade.
// No depende de datos, solo de que el cliente monte.
const MIN_VISIBLE_MS = 650;
const FADE_MS = 400;

type Phase = "visible" | "fading" | "gone";

export function SplashScreen() {
  const t = useTranslations("splash");
  const [phase, setPhase] = useState<Phase>("visible");

  // Tras el min-visible, o desvanece o (si el usuario prefiere sin
  // movimiento) desaparece de golpe.
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => setPhase(reduce ? "gone" : "fading"), MIN_VISIBLE_MS);
    return () => clearTimeout(id);
  }, []);

  // Al acabar el fade, se desmonta para no bloquear taps.
  useEffect(() => {
    if (phase !== "fading") return;
    const id = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  const tagline = t("tagline");
  return (
    <div
      role="status"
      aria-label={tagline}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--accent)",
        color: "#fff5ef",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        opacity: phase === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
    >
      <BrandMark height={120} />
      <div style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 600, fontSize: 34 }}>
        Biblioshare
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,245,239,0.7)",
        }}
      >
        {tagline}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check y lint**

Run: `npx tsc --noEmit && npx next lint --file src/components/splash/splash-screen.tsx --file src/components/brand/brand-mark.tsx`
Expected: sin errores. (Si `next lint` no acepta `--file`, corre `npm run lint`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/brand/brand-mark.tsx src/components/splash/splash-screen.tsx messages/es.json
git commit -m "feat(splash): componentes BrandMark y SplashScreen + tagline i18n"
```

---

### Task 3: Montar el splash en el layout + e2e

**Files:**
- Modify: `src/app/layout.tsx` (importar y montar `SplashScreen`)
- Create: `e2e/splash.spec.ts`

**Interfaces:**
- Consumes: `SplashScreen` de Task 2.
- Produces: overlay activo en toda carga completa de la app.

- [ ] **Step 1: Escribir el e2e (fallará: aún no está montado)**

```ts
// e2e/splash.spec.ts
import { test, expect } from "@playwright/test";

// El splash vive en el root layout, así que aparece en cualquier carga
// completa —incluida la pantalla de auth— sin necesidad de sesión.
test("el splash cubre al cargar y luego desaparece", async ({ page }) => {
  await page.goto("/");
  const splash = page.getByRole("status", { name: /biblioteca de todo/i });
  await expect(splash).toBeVisible();
  // Min-visible (650ms) + fade (400ms) → se desmonta. Margen amplio.
  await expect(splash).toBeHidden({ timeout: 5000 });
});

test("con prefers-reduced-motion también desaparece", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const splash = page.getByRole("status", { name: /biblioteca de todo/i });
  await expect(splash).toBeHidden({ timeout: 5000 });
  await context.close();
});
```

- [ ] **Step 2: Correr el e2e para verlo fallar**

Run: `npm run test:e2e -- splash.spec.ts`
Expected: FAIL — el elemento `status` con ese nombre nunca aparece (splash no montado).

- [ ] **Step 3: Montar `SplashScreen` en el layout**

En `src/app/layout.tsx`, añade el import junto a los demás componentes:

```tsx
import { SplashScreen } from "@/components/splash/splash-screen";
```

Y móntalo dentro de `NextIntlClientProvider`, como primer hijo (para que `useTranslations` funcione; al ser `fixed` se superpone al resto):

```tsx
        <NextIntlClientProvider>
          <SplashScreen />
          <AppShell>{children}</AppShell>
          {modal}
        </NextIntlClientProvider>
```

- [ ] **Step 4: Correr el e2e para verlo pasar**

Run: `npm run test:e2e -- splash.spec.ts`
Expected: PASS (2 tests). (Reutiliza el dev server de 3000 si ya está levantado.)

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx e2e/splash.spec.ts
git commit -m "feat(splash): montar el overlay en el root layout + e2e"
```

---

### Task 4: Sincronizar la doc

**Files:**
- Modify: `docs/requirements/decisiones.md` (append-only)

**Interfaces:**
- Consumes: nada. Cierra la "definición de hecho" (AGENTS.md).

- [ ] **Step 1: Leer el final del doc para imitar el formato**

Run: `tail -n 30 docs/requirements/decisiones.md`
Objetivo: ver la numeración/estilo de la última entrada y continuar el patrón.

- [ ] **Step 2: Añadir la entrada al final (append-only, no reescribir las anteriores)**

Contenido de la decisión:

> **Splash como overlay cold-start (no native PWA startup).** La pantalla de
> carga se implementa como un componente cliente (`SplashScreen`) que se
> renderiza en el HTML SSR y se desvanece tras la hidratación, no como splash
> nativo de PWA. Motivo: el splash nativo de Android solo permite centrar
> icono + nombre sobre `background_color`, sin control de tipografía ni tagline;
> no clava el mockup. El overlay da control total del pixel y se ve igual en web
> y en PWA instalada. Coste asumido: se muestra en cada carga completa de página
> (comportamiento boot-splash normal); las navegaciones soft no lo re-disparan.

Mantén la numeración/estilo que viste en el Step 1.

- [ ] **Step 3: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): splash overlay cold-start vs native PWA startup"
```

---

## Self-Review

**Spec coverage:**
- BrandMark reutilizable + geometría → Task 1 + Task 2. ✓
- SplashScreen (SSR, fade, reduced-motion, sin datos, aria) → Task 2. ✓
- Integración en layout dentro de `NextIntlClientProvider` → Task 3. ✓
- i18n `splash.tagline` → Task 2. ✓
- Sin sessionStorage (se muestra por carga) → cubierto en constraints + Task 3 + decisión. ✓
- Testing: unit puro (geometría) + e2e (visible→gone, reduced-motion) → Task 1 + Task 3. ✓
- Docs: `decisiones.md` → Task 4; `data-model.md` sin cambios (no hay esquema). ✓

**Placeholder scan:** sin TBD/TODO; todo el código está completo. ✓

**Type consistency:** `brandMarkGeom` / `SpineGeom` / `BrandMarkGeom` iguales en Task 1 y su consumo en Task 2; `BrandMark({ height })` y `SplashScreen()` usados tal cual en Tasks 2–3. ✓

**Nota de entorno:** al terminar, deja el puerto 3000 con un único `next dev` (o libre) y sin worktrees huérfanos (AGENTS.md — hay uno viejo en `.claude/worktrees/sagas-fase-2-tandems/`, ajeno a esta feature).
