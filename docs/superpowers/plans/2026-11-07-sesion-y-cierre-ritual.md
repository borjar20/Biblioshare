# Registrar sesión y cerrar una lectura como ritual — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar la esencia de «Sacar un lomo» a la hoja de sesión (marcapáginas, mascota, materiales,
microrritual al guardar) y a la de cierre (recuento, última página / entrada / caja del disco,
dedicatoria y lacre), sin tocar server actions ni esquema.

**Architecture:** Base compartida en `src/components/stage/` (paleta y materiales, `StageMascot`,
`MiniShelf`), extraída de la partida. Lógica pura y testeable en `src/lib/ritual/`. Las hojas
existentes (`session-sheet.tsx`, `close-pass-sheet.tsx`) conservan su orquestación y cambian sus
piezas visuales. Mascota y recuento llegan por el loader de la sesión y por una server action nueva
para el cierre.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, next-intl, Supabase, CSS modules +
Tailwind v4 (`@theme inline`, los tokens son variables CSS), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-sesion-y-cierre-ritual-design.md`

## Global Constraints

- **No cambian** `addSession`, `closePass`, `updatePass` ni `updateStatus`, ni el esquema.
- **Protecciones que hay que conservar (y sus tests):**
  - la salida única del modal (`session-modal.tsx`, #117) y cerrar el `<dialog>` antes de navegar (#448);
  - `askResume` conserva el borrador y reenvía el mismo FormData;
  - `withNetworkCatch`: sin red, la hoja sigue montada;
  - `clearTimer` solo con el guardado confirmado;
  - el cuaderno anclado al valor en vivo de la página (`e2e/notas-captura.spec.ts`);
  - `name="page"`, `name="durationMinutes"` y `name="startedAt"` son las únicas fuentes de esos valores;
  - en el cierre, «Ahora no» no llama a `closePass` y el visionado conjunto solo va al completar.
- **Regla #437:** la mascota y el recuento se leen con el cliente de la petición (`createClient`),
  **nunca** con `use cache`.
- **Mascota:** sale aunque `companion_hidden`; si es bellota se pinta (`PetSprite`); el narrador solo
  aparece sin mascota. Es la misma regla que la partida.
- **Copy:** en español, en el namespace nuevo **`ritual`** de `messages/es.json`. Los textos que ya
  usan los e2e no cambian: «Guardar sesión», «¿Qué te ha parecido?», «Ahora no», «Guardar», «Página
  final de hoy», «Duración», «N/10».
- **Desvío de la spec (decidido al planificar):** la cifra de la página sigue siendo el `<input
  name="page">` visible, ahora como lectura del marcapáginas (decisión D1 previa «la cifra ES el
  input»; varios e2e rellenan `input[name="page"]`, que tiene que ser visible). Detrás del «+»
  quedan los minutos exactos y la hora. Se registra en la Task 9.
- **Movimiento:** con `prefers-reduced-motion`, todas las esperas y animaciones duran ≤ 120 ms.
- **Entorno (Windows, PowerShell):**
  - Prefijo de cada comando: `fnm env | Out-String | Invoke-Expression; fnm use 22;`. Se encadena
    con `;`, no con `&&`.
  - `node_modules`: si no existe, crea el junction
    `New-Item -ItemType Junction node_modules -Target D:\Proyectos\Personal\Biblioshare\node_modules`.
    No lo borres nunca.
  - `next dev` necesita `--webpack`. `.env.local` está copiado.
  - Comandos:
    - tests: `npx vitest run <ruta>`
    - tipos: `npx tsc --noEmit`
    - lint: `npm run lint`
- **Commits:** cada mensaje termina con una línea en blanco y
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/components/stage/materials.module.css` | Crear | Paleta espresso, alcance `ritualScope` y clases de material |
| `src/components/stage/stage-mascot.tsx` (+ `.module.css`, `.test.tsx`) | Crear (mover desde `rincon/stage-pet.tsx`) | Mascota sentada con bocadillo |
| `src/components/stage/mini-shelf.tsx` (+ `.module.css`, `.test.tsx`) | Crear | Tramo de balda con lomos y lomo que aterriza |
| `src/components/rincon/*` | Modificar | La partida usa la base compartida |
| `src/lib/ritual/recap.ts` (+ test) | Crear | Recuento del pase |
| `src/lib/ritual/session-lines.ts` (+ test) | Crear | Frases de la sesión |
| `src/lib/ritual/closing-lines.ts` (+ test) | Crear | Frases del cierre |
| `src/lib/passes/load-closing-context.ts` | Crear | Server action: recuento y mascota |
| `src/lib/sessions/load-context.ts` | Modificar | `SessionContext.pet` |
| `messages/es.json`, `RouteMessages` de las rutas | Modificar | Namespace `ritual` |
| `src/components/session/bookmark-field.tsx` (+ `.module.css`, test) | Crear | Libro de canto con marcapáginas |
| `src/components/session/book-progress-field.tsx` | Modificar | Usa `BookmarkField`, latón y «+» |
| `src/components/session/session-sheet.tsx`, `series-episode-grid.tsx` | Modificar | Escena, mascota y microrritual |
| `src/components/detail/ink-date-stamp.tsx`, `wax-seal.tsx`, `closing-object.tsx` (+ `.module.css`, tests) | Crear | Piezas del cierre |
| `src/components/detail/close-pass-sheet.tsx` | Modificar | Ritual de cierre |
| `e2e/cierre-ritual.spec.ts` | Crear | Cierre de libro y de película |
| Docs | Modificar | `decisiones.md`, backlog, glosario, grafo |

---

### Task 1: Base compartida (`src/components/stage/`) y la partida sobre ella

**Files:**
- Create: `src/components/stage/materials.module.css`
- Create: `src/components/stage/stage-mascot.tsx`, `src/components/stage/stage-mascot.module.css`, `src/components/stage/stage-mascot.test.tsx`
- Create: `src/components/stage/mini-shelf.tsx`, `src/components/stage/mini-shelf.module.css`, `src/components/stage/mini-shelf.test.tsx`
- Modify: `src/components/rincon/sorteo-stage.tsx`, `src/components/rincon/sorteo-stage.module.css`, `src/components/rincon/stage-parts.test.tsx`, `src/lib/rincon/load-sorteo.ts`
- Delete: `src/components/rincon/stage-pet.tsx`

**Interfaces:**
- Produces:
  - `type StagePet = { name: string; petClass: PetClass; stage: PetStage }`
  - `type Speech = { title?: string; text: string; mood: "idle" | "sad" | "joy" } | null`
  - `StageMascot({ pet, speech, entered, size? }: { pet: StagePet | null; speech: Speech; entered: boolean; size?: "lg" | "sm" })`
  - `MiniShelf({ spines, landing, children, className }: { spines?: { color: string; h: number }[]; landing?: { color: string } | null; children?: ReactNode; className?: string })`
  - Clases de `materials.module.css`: `palette`, `ritualScope`, `leather`, `wood`, `knob`, `brass`, `paper`, `dedication`.

- [ ] **Step 1: Mueve los tests de la mascota y escribe el de la balda**

Mueve el bloque `describe("StagePet", …)` de `src/components/rincon/stage-parts.test.tsx` a un
fichero nuevo, `src/components/stage/stage-mascot.test.tsx`, con su mock de `PetSprite` y renombrando
`StagePet` a `StageMascot`. Añade al final:

```tsx
it("size sm aplica la escala pequeña", () => {
  const { container } = render(<StageMascot pet={null} speech={null} entered size="sm" />);
  expect(container.firstElementChild!.className).toMatch(/sm/);
});
```

Crea `src/components/stage/mini-shelf.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MiniShelf } from "./mini-shelf";
afterEach(cleanup);

describe("MiniShelf", () => {
  it("pinta los lomos, el que aterriza y lo que se sienta encima", () => {
    const { container, getByText } = render(
      <MiniShelf spines={[{ color: "#b5652f", h: 70 }, { color: "#2f6f73", h: 60 }]} landing={{ color: "#8e3b2b" }}>
        <span>mascota</span>
      </MiniShelf>,
    );
    expect(container.querySelectorAll("[data-spine]")).toHaveLength(2);
    expect(container.querySelector("[data-landing]")).toBeTruthy();
    expect(getByText("mascota")).toBeTruthy();
  });
  it("sin landing no pinta el lomo que aterriza", () => {
    const { container } = render(<MiniShelf spines={[]} />);
    expect(container.querySelector("[data-landing]")).toBeNull();
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `npx vitest run src/components/stage`
Expected: FAIL; los módulos no existen.

- [ ] **Step 3: `materials.module.css`**

```css
/* Paleta y materiales del mueble (spec 2026-11-07, «Base compartida»). Salen de la
   partida «Sacar un lomo»: madera, latón, piel, papel, tinta y lacre. Colores
   fijos, iguales en claro y oscuro. */
.palette {
  --st-bg: #17110d; --st-panel: #241d18; --st-raise: #2f2620; --st-line: rgba(240,232,219,.12);
  --st-fg: #f0e8db; --st-muted: #a99e8c; --st-cta: #d98a5c; --st-cta-ink: #1f1409; --st-gold: #e0a94a;
  --wood: #5b3e27; --wood-dk: #3a2717; --wood-lt: #7d5737; --back: #1c130c;
  --ink: #9b3a24; --wax: #8e1f1a; --wax-lt: #c23a2e; --paper-1: #f4ead3; --paper-2: #e9dbbb;
  --f-display: var(--font-fraunces), Georgia, serif;
  --f-body: var(--font-geist-sans), system-ui, sans-serif;
  --f-mono: var(--font-geist-mono), ui-monospace, monospace;
}
/* Alcance de las hojas del ritual: además de la paleta, redefine los tokens de la
   app (Tailwind v4 los lee como variables con `@theme inline`), así los Input,
   Select y el cuaderno de dentro adoptan el espresso sin tocar sus componentes. */
.ritualScope {
  composes: palette;
  --background: #17110d; --surface: #241d18; --surface-muted: #2f2620; --surface-3: #3a2f27;
  --foreground: #f0e8db; --foreground-soft: #d9cdb9; --muted-foreground: #a99e8c; --foreground-faint: #7d7263;
  --border: rgba(240,232,219,.14); --accent: #d98a5c; --accent-foreground: #1f1409; --accent-ink: #e9a574;
  color-scheme: dark; background: var(--st-bg); color: var(--st-fg); font-family: var(--f-body);
}
.leather { border: 1px solid #6f3417; border-radius: 14px; padding: 13px 18px; color: #2a1206; font-weight: 700; cursor: pointer;
  background: radial-gradient(120% 140% at 50% 0%, rgba(255,226,190,.35), transparent 55%), linear-gradient(180deg, #e9a574, #d1804f 48%, #b5612f);
  text-shadow: 0 1px 0 rgba(255,222,186,.55); outline: 1px dashed rgba(70,28,8,.38); outline-offset: -6px;
  box-shadow: inset 0 1px 0 rgba(255,236,214,.7), inset 0 -2px 0 rgba(90,36,10,.35), 0 4px 0 #6a3116, 0 12px 20px -8px rgba(0,0,0,.8);
  transition: transform .08s, box-shadow .08s, filter .2s }
.leather:hover:not(:disabled) { filter: brightness(1.06) }
.leather:active:not(:disabled) { transform: translateY(3px); box-shadow: inset 0 1px 0 rgba(255,236,214,.5), 0 1px 0 #6a3116 }
.leather:disabled { opacity: .5; filter: saturate(.4); cursor: default }
.wood, .knob { color: #f3e6d0; border: 1px solid #24170d; cursor: pointer; text-shadow: 0 1px 1px rgba(0,0,0,.5);
  background: repeating-linear-gradient(90deg, rgba(255,255,255,.04) 0 2px, transparent 2px 9px), linear-gradient(180deg, #7a5536, #5b3e27 55%, #45301e);
  box-shadow: inset 0 1px 0 rgba(255,225,190,.28), inset 0 -2px 0 rgba(0,0,0,.25), 0 3px 0 #2a1b10, 0 10px 16px -8px rgba(0,0,0,.8);
  transition: transform .08s, box-shadow .08s, filter .2s }
.wood { border-radius: 14px; padding: 12px; font-weight: 600 }
.knob { border-radius: 50%; width: 36px; height: 36px; display: grid; place-items: center; font-size: 13px }
.wood:active:not(:disabled), .knob:active { transform: translateY(2px); box-shadow: inset 0 1px 0 rgba(255,225,190,.2), 0 1px 0 #2a1b10 }
.brass { border: 1px solid #1e140b; border-radius: 999px; padding: 7px 12px; font-size: 12.5px; color: #f1e2c6; cursor: pointer;
  text-shadow: 0 1px 1px rgba(0,0,0,.5); background: linear-gradient(180deg, #6e4b30, #4e3520); box-shadow: inset 0 1px 0 rgba(255,225,190,.22), 0 2px 0 #24170d }
.brass[aria-pressed="true"], .brass:has(input:checked) { color: #2a1a06; text-shadow: 0 1px 0 rgba(255,240,200,.6); border-color: #6d5220;
  background: radial-gradient(circle at 30% 20%, #fff0bf, transparent 50%), linear-gradient(180deg, #f0d083, #d4a747 55%, #a87f2e);
  box-shadow: inset 0 1px 0 rgba(255,250,225,.8), 0 2px 0 #5e4517 }
.paper { color: #2e2216; border-radius: 3px; background: repeating-linear-gradient(180deg, transparent 0 17px, rgba(90,120,170,.16) 17px 18px), linear-gradient(180deg, var(--paper-1), var(--paper-2));
  box-shadow: 0 1px 0 rgba(255,255,255,.4) inset, 0 4px 8px -3px rgba(0,0,0,.6) }
/* Texto escrito a pluma sobre papel (dedicatoria / reverso / librito). */
.dedication { width: 100%; resize: none; border: 0; background: transparent; color: #2a1d10; font-family: var(--f-display); font-style: italic;
  font-size: 16px; line-height: 22px; background-image: repeating-linear-gradient(180deg, transparent 0 21px, rgba(90,120,170,.22) 21px 22px); padding: 0 2px }
.dedication:focus { outline: none }
.dedication::placeholder { color: rgba(42,29,16,.45) }
.leather:focus-visible, .wood:focus-visible, .knob:focus-visible, .brass:focus-visible { outline: 2px solid var(--st-gold); outline-offset: 2px }
@media (prefers-reduced-motion: reduce) { .leather, .wood, .knob, .brass { transition: none } }
```

- [ ] **Step 4: `StageMascot`**

Mueve `src/components/rincon/stage-pet.tsx` a `src/components/stage/stage-mascot.tsx` con
`git mv`. Cambios:
- renombra `StagePet` a `StageMascot`;
- exporta `type StagePet = { name: string; petClass: PetClass; stage: PetStage }`, con
  `import type { PetClass, PetStage } from "@/lib/pet/classes"`, en lugar de importar `SorteoPet`;
- añade la prop `size?: "lg" | "sm"` (por defecto `"lg"`);
- importa los estilos de `./stage-mascot.module.css`;
- pon la clase en el contenedor:
  `<div className={`${styles.petzone} ${size === "sm" ? styles.sm : ""}`} style={vars}>`.

En `src/components/stage/stage-mascot.module.css`, mueve **literalmente** de
`sorteo-stage.module.css` las reglas `.petzone`, `.pet`, `.pet.in`, `.pet > .sprite-box`, `.pet.hop`,
`@keyframes hop`, `.bubble`, `.bubble.off`, `.bubble.narrated`, `.bubble b` y su `@media` de fuente.
Añade además estas reglas, para que la escala ya no dependa de `.case`:

```css
.petzone { --petscale: 1.5 }
.petzone.sm { --petscale: 1.1 }
@media (max-width: 640px) { .petzone { --petscale: 1.1 } }
```

En `sorteo-stage.module.css` borra esas reglas y quita `--petscale` y `--petsz` de `.case` y de su
`@media`. Comprueba con `grep -n "petsz\|petscale" src/components/rincon/sorteo-stage.module.css`
que no queda ninguna referencia (el `padding-top: 110px` de la escena móvil no depende de ellas).

- [ ] **Step 5: `MiniShelf`**

```tsx
// src/components/stage/mini-shelf.tsx
import type { CSSProperties, ReactNode } from "react";
import styles from "./mini-shelf.module.css";

// Un tramo de la balda de la partida: tablero de madera con unos lomos. Lo que se
// pasa como children (la mascota) se sienta encima: el tramo es su bloque de
// posicionamiento. `landing` es el lomo que cae y se coloca (cierre de lectura).
export function MiniShelf({
  spines = [], landing = null, children, className = "",
}: {
  spines?: { color: string; h: number }[];
  landing?: { color: string } | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.shelf} ${className}`}>
      <div className={styles.spines} aria-hidden>
        {spines.map((s, i) => (
          <i key={i} data-spine style={{ "--c": s.color, height: `${s.h}%` } as CSSProperties} />
        ))}
        {landing && <i data-landing className={styles.landing} style={{ "--c": landing.color } as CSSProperties} />}
      </div>
      <div className={styles.board} aria-hidden />
      {children}
    </div>
  );
}
```

```css
/* src/components/stage/mini-shelf.module.css */
.shelf { position: relative; height: 46px; display: flex; flex-direction: column; justify-content: flex-end }
.spines { display: flex; align-items: flex-end; gap: 2px; height: 38px; padding: 0 10px }
.spines i { display: block; width: 9px; border-radius: 2px 2px 1px 1px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2), 1px 0 2px -1px rgba(0,0,0,.6);
  background: linear-gradient(90deg, color-mix(in srgb, var(--c) 62%, #000), var(--c) 40%, color-mix(in srgb, var(--c) 60%, #000)) }
.landing { height: 92%; animation: land .7s cubic-bezier(.3,1.4,.5,1) both }
@keyframes land { from { transform: translateY(-140px) rotate(-14deg); opacity: 0 } 60% { opacity: 1 } }
.board { height: 8px; margin: 0 -2px; border-radius: 1px; background: linear-gradient(180deg, #9a6c45, #7d5737 35%, #5b3e27 70%, #3a2717); box-shadow: 0 6px 10px -4px rgba(0,0,0,.8) }
@media (prefers-reduced-motion: reduce) { .landing { animation-duration: .01ms } }
```

- [ ] **Step 6: La partida usa la base**

- En `sorteo-stage.tsx` cambia el import de `StagePet`/`Speech` a
  `import { StageMascot, type Speech } from "@/components/stage/stage-mascot";` y usa
  `<StageMascot …/>` donde estaba `<StagePet …/>`.
- En `load-sorteo.ts`:
  - cambia `export type SorteoPet = …` por `export type SorteoPet = StagePet;`;
  - importa `import type { StagePet } from "@/components/stage/stage-mascot";`;
  - quita los imports de `PetClass` y `PetStage` que dejen de usarse.
- En `sorteo-stage.module.css`, en la regla `.stage { … }` que define los tokens: añade como primera
  línea `composes: palette from "../stage/materials.module.css";` y borra de esa regla las variables
  que ya define `.palette` (`--st-*`, `--wood*`, `--back`, `--f-*`). Deja el resto de propiedades.

- [ ] **Step 7: Verifica**

Run: `npx vitest run src/components/stage src/components/rincon; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

Después comprueba la partida en el navegador:
- `npx next dev --webpack -p 3000`, Inicio a 1280 px → «¿Cuál toca?»;
- la mascota sigue sentada en el mueble y el bocadillo a su izquierda;
- los botones tienen el mismo aspecto.

Mata el servidor al terminar.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/stage src/components/rincon src/lib/rincon
git commit -m "refactor(stage): base compartida de materiales, mascota y balda"
```

---

### Task 2: Lógica pura del ritual (`src/lib/ritual/`)

**Files:**
- Create: `src/lib/ritual/recap.ts`, `src/lib/ritual/recap.test.ts`
- Create: `src/lib/ritual/session-lines.ts`, `src/lib/ritual/session-lines.test.ts`
- Create: `src/lib/ritual/closing-lines.ts`, `src/lib/ritual/closing-lines.test.ts`

**Interfaces:**
- Produces:
  - `type ClosingRecap = { sessions: number; days: number; longestStreak: number; pages: number | null; episodes: number | null }`
  - `longestStreak(dates: string[]): number`
  - `daysSpan(dates: string[]): number`
  - `computeRecap(input: { sessionDates: string[]; pages: number | null; episodes: number | null }): ClosingRecap`
  - `type SessionLine = { key: SessionLineKey; values: Record<string, number> }`
  - `openingLine(itemType: "book" | "series", fromPage: number | null): SessionLine`
  - `savedLine(input: { itemType: "book" | "series"; fromPage: number | null; toPage: number | null; total: number | null; episodes: number }): SessionLine`
  - `type ClosingLine = { key: ClosingLineKey; values: Record<string, string | number> }`
  - `recapLine(itemType: ItemType, recap: ClosingRecap | null, now: Date, fmt: { weekday(d: Date): string }): ClosingLine`
  - `FAREWELL_VARIANTS = 2`, `DROPPED_VARIANTS = 2`

- [ ] **Step 1: Escribe los tests que fallan**

```ts
// src/lib/ritual/recap.test.ts
import { describe, expect, it } from "vitest";
import { computeRecap, daysSpan, longestStreak } from "./recap";

describe("recap", () => {
  it("racha más larga de días consecutivos (repetidos cuentan una vez)", () => {
    expect(longestStreak(["2026-11-01", "2026-11-02", "2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06"])).toBe(3);
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-12-31", "2027-01-01"])).toBe(2);
  });
  it("días entre la primera y la última sesión, ambos incluidos", () => {
    expect(daysSpan(["2026-11-06", "2026-11-01"])).toBe(6);
    expect(daysSpan(["2026-11-01"])).toBe(1);
    expect(daysSpan([])).toBe(0);
  });
  it("compone el recuento", () => {
    expect(computeRecap({ sessionDates: ["2026-11-01", "2026-11-03"], pages: 412, episodes: null }))
      .toEqual({ sessions: 2, days: 3, longestStreak: 1, pages: 412, episodes: null });
  });
});
```

```ts
// src/lib/ritual/session-lines.test.ts
import { describe, expect, it } from "vitest";
import { openingLine, savedLine } from "./session-lines";

describe("openingLine", () => {
  it("libro con página: recuerda por dónde iba", () => {
    expect(openingLine("book", 180)).toEqual({ key: "openBook", values: { page: 180 } });
  });
  it("libro sin empezar y serie", () => {
    expect(openingLine("book", null).key).toBe("openFirst");
    expect(openingLine("book", 0).key).toBe("openFirst");
    expect(openingLine("series", null).key).toBe("openSeries");
  });
});

describe("savedLine", () => {
  const base = { itemType: "book" as const, episodes: 0 };
  it("terminado manda", () => {
    expect(savedLine({ ...base, fromPage: 300, toPage: 412, total: 412 }).key).toBe("savedFinished");
  });
  it("cruzar la mitad", () => {
    expect(savedLine({ ...base, fromPage: 180, toPage: 214, total: 412 })).toEqual({ key: "savedHalf", values: { delta: 34 } });
  });
  it("cerca del final: ≤ 30 páginas", () => {
    expect(savedLine({ ...base, fromPage: 370, toPage: 382, total: 412 })).toEqual({ key: "savedNearEnd", values: { delta: 12, remaining: 30 } });
  });
  it("páginas sin hito, sin total y sin avance", () => {
    expect(savedLine({ ...base, fromPage: 10, toPage: 30, total: 412 })).toEqual({ key: "savedPages", values: { delta: 20 } });
    expect(savedLine({ ...base, fromPage: 10, toPage: 30, total: null }).key).toBe("savedPages");
    expect(savedLine({ ...base, fromPage: 30, toPage: 30, total: 412 }).key).toBe("savedGeneric");
  });
  it("series: episodios marcados", () => {
    expect(savedLine({ itemType: "series", fromPage: null, toPage: null, total: null, episodes: 3 })).toEqual({ key: "savedEpisodes", values: { count: 3 } });
    expect(savedLine({ itemType: "series", fromPage: null, toPage: null, total: null, episodes: 0 }).key).toBe("savedGeneric");
  });
});
```

```ts
// src/lib/ritual/closing-lines.test.ts
import { describe, expect, it } from "vitest";
import { recapLine } from "./closing-lines";

const fmt = { weekday: () => "viernes" };
const recap = { sessions: 23, days: 41, longestStreak: 9, pages: 412, episodes: null };

describe("recapLine", () => {
  it("libro con páginas", () => {
    expect(recapLine("book", recap, new Date(), fmt)).toEqual({ key: "recapBook", values: { sessions: 23, days: 41, pages: 412, streak: 9 } });
  });
  it("libro sin páginas conocidas", () => {
    expect(recapLine("book", { ...recap, pages: null }, new Date(), fmt).key).toBe("recapSessions");
  });
  it("serie con episodios", () => {
    expect(recapLine("series", { ...recap, pages: null, episodes: 8 }, new Date(), fmt)).toEqual({ key: "recapSeries", values: { episodes: 8, days: 41 } });
  });
  it("película: día y franja de ahora", () => {
    const fri22 = new Date(2026, 10, 6, 22, 0);
    expect(recapLine("movie", null, fri22, fmt)).toEqual({ key: "movieNight", values: { weekday: "viernes", daypart: "night" } });
    expect(recapLine("movie", null, new Date(2026, 10, 6, 10), fmt).values.daypart).toBe("morning");
    expect(recapLine("movie", null, new Date(2026, 10, 6, 17), fmt).values.daypart).toBe("afternoon");
  });
  it("sin recuento ni sesiones: genérica por tipo", () => {
    expect(recapLine("book", null, new Date(), fmt)).toEqual({ key: "generic", values: { type: "book" } });
    expect(recapLine("book", { ...recap, sessions: 0 }, new Date(), fmt).key).toBe("generic");
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `npx vitest run src/lib/ritual`
Expected: FAIL; los módulos no existen.

- [ ] **Step 3: Implementa**

```ts
// src/lib/ritual/recap.ts
// Recuento del pase para el cierre (spec 2026-11-07, «El cierre», 1). Puro.
export type ClosingRecap = { sessions: number; days: number; longestStreak: number; pages: number | null; episodes: number | null };

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map(dayNumber))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = Number.NaN;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function daysSpan(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = dates.map(dayNumber);
  return Math.max(...days) - Math.min(...days) + 1;
}

export function computeRecap(input: { sessionDates: string[]; pages: number | null; episodes: number | null }): ClosingRecap {
  return {
    sessions: input.sessionDates.length,
    days: daysSpan(input.sessionDates),
    longestStreak: longestStreak(input.sessionDates),
    pages: input.pages,
    episodes: input.episodes,
  };
}
```

```ts
// src/lib/ritual/session-lines.ts
// Frases de la mascota en la sesión (spec 2026-11-07, «La sesión diaria»). Puro.
// El texto vive en messages/es.json → ritual.session.<key>.
export type SessionLineKey =
  | "openBook" | "openFirst" | "openSeries"
  | "savedFinished" | "savedHalf" | "savedNearEnd" | "savedPages" | "savedEpisodes" | "savedGeneric";
export type SessionLine = { key: SessionLineKey; values: Record<string, number> };

export function openingLine(itemType: "book" | "series", fromPage: number | null): SessionLine {
  if (itemType === "series") return { key: "openSeries", values: {} };
  return fromPage && fromPage > 0 ? { key: "openBook", values: { page: fromPage } } : { key: "openFirst", values: {} };
}

export function savedLine(input: {
  itemType: "book" | "series"; fromPage: number | null; toPage: number | null; total: number | null; episodes: number;
}): SessionLine {
  if (input.itemType === "series") {
    return input.episodes > 0 ? { key: "savedEpisodes", values: { count: input.episodes } } : { key: "savedGeneric", values: {} };
  }
  const from = input.fromPage ?? 0;
  const to = input.toPage ?? from;
  const delta = to - from;
  if (delta <= 0) return { key: "savedGeneric", values: {} };
  const total = input.total;
  if (total && to >= total) return { key: "savedFinished", values: {} };
  if (total && from < total / 2 && to >= total / 2) return { key: "savedHalf", values: { delta } };
  if (total && total - to <= 30) return { key: "savedNearEnd", values: { delta, remaining: total - to } };
  return { key: "savedPages", values: { delta } };
}
```

```ts
// src/lib/ritual/closing-lines.ts
import type { ItemType } from "@/lib/catalog/types";
import type { ClosingRecap } from "./recap";

// Frase de apertura del cierre (recuento) y variantes de despedida. Puro.
// Texto en messages/es.json → ritual.closing.<key>.
export type ClosingLineKey = "recapBook" | "recapSessions" | "recapSeries" | "movieNight" | "generic";
export type ClosingLine = { key: ClosingLineKey; values: Record<string, string | number> };
export const FAREWELL_VARIANTS = 2;
export const DROPPED_VARIANTS = 2;

function daypart(d: Date): "morning" | "afternoon" | "night" {
  const h = d.getHours();
  if (h >= 6 && h < 14) return "morning";
  if (h >= 14 && h < 21) return "afternoon";
  return "night";
}

export function recapLine(itemType: ItemType, recap: ClosingRecap | null, now: Date, fmt: { weekday(d: Date): string }): ClosingLine {
  if (itemType === "movie") return { key: "movieNight", values: { weekday: fmt.weekday(now), daypart: daypart(now) } };
  if (itemType === "series" && recap?.episodes) return { key: "recapSeries", values: { episodes: recap.episodes, days: Math.max(1, recap.days) } };
  if (!recap || recap.sessions === 0) return { key: "generic", values: { type: itemType } };
  if (recap.pages !== null) {
    return { key: "recapBook", values: { sessions: recap.sessions, days: recap.days, pages: recap.pages, streak: recap.longestStreak } };
  }
  return { key: "recapSessions", values: { sessions: recap.sessions, days: recap.days, streak: recap.longestStreak } };
}
```

- [ ] **Step 4: Comprueba que pasan**

Run: `npx vitest run src/lib/ritual; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ritual
git commit -m "feat(ritual): recuento y frases de sesión y cierre"
```

---

### Task 3: Datos (mascota y recuento) y cadenas `ritual`

**Files:**
- Modify: `src/lib/sessions/load-context.ts`
- Create: `src/lib/passes/load-closing-context.ts`
- Modify: `messages/es.json`
- Modify: los `RouteMessages` que ya mandan `"passes"`

**Interfaces:**
- Consumes: `StagePet` (Task 1), `ClosingRecap` y `computeRecap` (Task 2), `getCompanionState` (`src/lib/pet/get-companion-state.ts`).
- Produces:
  - `SessionContext.pet: StagePet | null`
  - `type ClosingContext = { recap: ClosingRecap | null; pet: StagePet | null }`
  - `loadClosingContext(passId: string): Promise<ClosingContext>`
  - namespace `ritual`

- [ ] **Step 1: Lee la guía de server actions de esta versión de Next**

Lee `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, sección
«Event Handlers».

- [ ] **Step 2: `SessionContext.pet`**

En `src/lib/sessions/load-context.ts`:
- importa `getCompanionState` de `@/lib/pet/get-companion-state` y `type StagePet` de
  `@/components/stage/stage-mascot`;
- añade a `SessionContext` el campo `pet: StagePet | null;`;
- antes del `return`, añade:

```ts
  // Mascota de la hoja (spec 2026-11-07): sin caché (regla #437), sale aunque la
  // compañera flotante esté oculta; si falla, narrador.
  const companion = await getCompanionState(supabase).catch((e) => {
    console.error("loadSessionContext: companion", e);
    return null;
  });
  const pet: StagePet | null = companion
    ? { name: companion.name, petClass: companion.petClass, stage: companion.stage }
    : null;
```

Añade `pet,` al objeto devuelto. Run: `npx tsc --noEmit`. Corrige cualquier fixture de test que
construya un `SessionContext` añadiendo `pet: null` (busca con
`grep -rln "SessionContext\|seriesEpisodes:" src --include=*.test.tsx`).

- [ ] **Step 3: `loadClosingContext`**

```ts
// src/lib/passes/load-closing-context.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanionState } from "@/lib/pet/get-companion-state";
import { computeRecap, type ClosingRecap } from "@/lib/ritual/recap";
import type { StagePet } from "@/components/stage/stage-mascot";

export type ClosingContext = { recap: ClosingRecap | null; pet: StagePet | null };

// Recuento y mascota para el cierre (spec 2026-11-07). La hoja de cierre se abre
// desde varios sitios, así que lo trae una action al abrir, como loadSorteo.
// SIN `use cache` (regla #437): sesiones y pase salen de RLS con auth.uid().
// Si el recuento falla, el cierre sigue sin él (la mascota dice una genérica).
export async function loadClosingContext(passId: string): Promise<ClosingContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("loadClosingContext: sin sesión");

  const [pass, sessions, episodes, companion] = await Promise.all([
    supabase.from("passes").select("item_type, position").eq("id", passId).maybeSingle(),
    supabase.from("progress_sessions").select("session_date").eq("pass_id", passId),
    supabase.from("episode_watches").select("id", { count: "exact", head: true }).eq("pass_id", passId),
    getCompanionState(supabase).catch((e) => {
      console.error("loadClosingContext: companion", e);
      return null;
    }),
  ]);

  let recap: ClosingRecap | null = null;
  if (!pass.error && pass.data && !sessions.error) {
    const position = (pass.data.position ?? {}) as { page?: unknown };
    const pages = pass.data.item_type === "book" && typeof position.page === "number" ? position.page : null;
    const episodeCount = pass.data.item_type === "series" && !episodes.error ? (episodes.count ?? 0) : null;
    recap = computeRecap({ sessionDates: (sessions.data ?? []).map((s) => s.session_date), pages, episodes: episodeCount });
  } else {
    console.error("loadClosingContext: recap", pass.error ?? sessions.error);
  }
  const pet = companion ? { name: companion.name, petClass: companion.petClass, stage: companion.stage } : null;
  return { recap, pet };
}
```

Antes de dar el paso por bueno, comprueba que `episode_watches` tiene `pass_id`:
`grep -n "episode_watches: {" -A20 src/lib/supabase/database.types.ts | grep pass_id`. Si no lo
tiene, deja `episodes` a `null` y quita esa consulta.

- [ ] **Step 4: Cadenas `ritual` en `messages/es.json`**

Añade el objeto de primer nivel `"ritual"` al final del fichero:

```json
"ritual": {
  "session": {
    "openBook": "Ibas por la {page}. ¿Hasta dónde hoy?",
    "openFirst": "Primera página. ¿Empezamos?",
    "openSeries": "¿Qué episodios has visto?",
    "savedFinished": "¡Última página! Vamos a cerrarlo bien.",
    "savedHalf": "{delta, plural, one {# página.} other {# páginas.}} Ya pasaste la mitad.",
    "savedNearEnd": "{delta, plural, one {# página.} other {# páginas.}} Te quedan {remaining}: el final está cerca.",
    "savedPages": "{delta, plural, one {# página más.} other {# páginas más.}}",
    "savedEpisodes": "{count, plural, one {# episodio más.} other {# episodios más.}}",
    "savedGeneric": "Apuntado."
  },
  "bookmark": {
    "label": "Marcapáginas: página de hoy",
    "valueText": "página {page}, {delta, plural, =0 {sin avance} one {# hoy} other {# hoy}}",
    "delta": "{delta, plural, one {+# pág.} other {+# págs.}}",
    "more": "Más precisión"
  },
  "closing": {
    "recapBook": "{sessions, plural, one {# sesión} other {# sesiones}} en {days, plural, one {# día} other {# días}} · {pages} páginas · tu racha más larga, {streak, plural, one {# día} other {# días}}",
    "recapSessions": "{sessions, plural, one {# sesión} other {# sesiones}} en {days, plural, one {# día} other {# días}} · tu racha más larga, {streak, plural, one {# día} other {# días}}",
    "recapSeries": "{episodes, plural, one {# episodio} other {# episodios}} en {days, plural, one {# día} other {# días}}",
    "movieNight": "La viste el {weekday} por la {daypart, select, morning {mañana} afternoon {tarde} other {noche}}.",
    "generic": "{type, select, book {Otro libro para la balda.} movie {Otra película vista.} other {Otra serie terminada.}}",
    "farewell": { "0": "A la balda de terminados. ¡Bien hecho!", "1": "Uno más para tu balda." },
    "dropped": { "0": "No todos los libros son para ahora.", "1": "Lo dejamos aquí, con el marcapáginas puesto." },
    "dateStamp": "Fecha de fin",
    "sealLabel": "Lacre: tu nota",
    "sealEmpty": "Sin lacrar",
    "dedicationBook": "Tu dedicatoria en la última página",
    "dedicationMovie": "En el reverso de la entrada",
    "dedicationSeries": "En el librito del disco",
    "ticket": "Entrada",
    "lastPage": "Fin",
    "disc": "Último disco",
    "public": "Pública",
    "farewellSr": "Guardado. Lo llevamos a la balda."
  }
}
```

Valida con `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"`.

- [ ] **Step 5: Manda `ritual` a las rutas**

Run: `grep -rn '"passes"' src/app src/components --include=*.tsx --include=*.ts | grep -v test`.
En cada `RouteMessages ns={[...]}` (o constante de namespaces) que incluya `"passes"`, añade
`"ritual"`. Como mínimo:
- `src/app/sesion/[passId]/layout.tsx`
- `src/app/@modal/(.)sesion/[passId]/page.tsx`
- la ruta de las fichas que pinta `LogPanel` (y con él `ClosePassSheet`)

Si las fichas no usan `RouteMessages` para `passes`, encuentra cómo llega `passes` (busca el
provider en `src/app/libro`, `src/app/pelicula` y `src/app/serie`) y añade `ritual` en el mismo
sitio. Si `route-messages.test.tsx` cubre esas rutas, añade una aserción de que llega `ritual.closing`.

- [ ] **Step 6: Verifica y commitea**

Run: `npx vitest run src/lib src/components/route-messages.test.tsx src/components/session; npx tsc --noEmit; npm run lint`
Expected: PASS.

```bash
git add -A src/lib messages src/app src/components
git commit -m "feat(ritual): mascota en la sesión, contexto del cierre y cadenas ritual"
```

---

### Task 4: `BookmarkField` y la nueva cara de `BookProgressField`

**Files:**
- Create: `src/components/session/bookmark-field.tsx`, `src/components/session/bookmark-field.module.css`, `src/components/session/bookmark-field.test.tsx`
- Modify: `src/components/session/book-progress-field.tsx`

**Interfaces:**
- Consumes: `materials.module.css` (`brass`) de la Task 1 y el namespace `ritual.bookmark` de la Task 3.
- Produces:
  - `bookmarkRange(fromPage: number | null, total: number | null): { min: number; max: number }`
  - `pageFromFraction(frac: number, min: number, max: number): number`
  - `BookmarkField({ fromPage, value, total, onChange }: { fromPage: number | null; value: number | null; total: number | null; onChange: (page: number) => void })`

- [ ] **Step 1: Escribe el test que falla**

```tsx
// src/components/session/bookmark-field.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { BookmarkField, bookmarkRange, pageFromFraction } from "./bookmark-field";
afterEach(cleanup);
const ui = (p: Parameters<typeof BookmarkField>[0]) => <NextIntlClientProvider locale="es" messages={messages}><BookmarkField {...p} /></NextIntlClientProvider>;

describe("bookmarkRange / pageFromFraction", () => {
  it("con total: de la página actual al total", () => {
    expect(bookmarkRange(180, 412)).toEqual({ min: 180, max: 412 });
    expect(bookmarkRange(null, 300)).toEqual({ min: 0, max: 300 });
  });
  it("sin total: max(actual + 100, actual × 1,5)", () => {
    expect(bookmarkRange(100, null)).toEqual({ min: 100, max: 200 });
    expect(bookmarkRange(400, null)).toEqual({ min: 400, max: 600 });
  });
  it("fracción a página, acotada", () => {
    expect(pageFromFraction(0, 180, 412)).toBe(180);
    expect(pageFromFraction(1, 180, 412)).toBe(412);
    expect(pageFromFraction(0.5, 180, 412)).toBe(296);
    expect(pageFromFraction(-1, 180, 412)).toBe(180);
    expect(pageFromFraction(2, 180, 412)).toBe(412);
  });
});

describe("BookmarkField", () => {
  it("es un slider accesible con valores y texto", () => {
    render(ui({ fromPage: 180, value: 214, total: 412, onChange: () => {} }));
    const s = screen.getByRole("slider", { name: messages.ritual.bookmark.label });
    expect(s.getAttribute("aria-valuemin")).toBe("180");
    expect(s.getAttribute("aria-valuemax")).toBe("412");
    expect(s.getAttribute("aria-valuenow")).toBe("214");
    expect(s.getAttribute("aria-valuetext")).toBe("página 214, 34 hoy");
  });
  it("teclado: flechas ±1, AvPág/RePág ±10, Inicio/Fin, acotado", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "ArrowRight" }); expect(onChange).toHaveBeenLastCalledWith(201);
    fireEvent.keyDown(s, { key: "ArrowLeft" }); expect(onChange).toHaveBeenLastCalledWith(199);
    fireEvent.keyDown(s, { key: "PageUp" }); expect(onChange).toHaveBeenLastCalledWith(210);
    fireEvent.keyDown(s, { key: "PageDown" }); expect(onChange).toHaveBeenLastCalledWith(190);
    fireEvent.keyDown(s, { key: "Home" }); expect(onChange).toHaveBeenLastCalledWith(180);
    fireEvent.keyDown(s, { key: "End" }); expect(onChange).toHaveBeenLastCalledWith(412);
  });
  it("sin valor parte de la página actual", () => {
    render(ui({ fromPage: 180, value: null, total: 412, onChange: () => {} }));
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("180");
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/session/bookmark-field.test.tsx`
Expected: FAIL; el módulo no existe.

- [ ] **Step 3: Implementa `BookmarkField`**

```tsx
// src/components/session/bookmark-field.tsx
"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import styles from "./bookmark-field.module.css";

// El libro de canto con su marcapáginas (spec 2026-11-07, «La sesión diaria»):
// arrastras la cinta, o tocas el canto, para fijar la página de hoy. Solo es
// presentación: quien escribe en `name="page"` es BookProgressField vía onChange.
export function bookmarkRange(fromPage: number | null, total: number | null): { min: number; max: number } {
  const min = Math.max(0, fromPage ?? 0);
  if (total && total > min) return { min, max: total };
  return { min, max: Math.max(min + 100, Math.ceil(min * 1.5)) };
}

export function pageFromFraction(frac: number, min: number, max: number): number {
  const f = Math.min(1, Math.max(0, frac));
  return Math.round(min + f * (max - min));
}

export function BookmarkField({
  fromPage, value, total, onChange,
}: {
  fromPage: number | null;
  value: number | null;
  total: number | null;
  onChange: (page: number) => void;
}) {
  const t = useTranslations("ritual.bookmark");
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const { min, max } = bookmarkRange(fromPage, total);
  const now = Math.min(max, Math.max(min, value ?? min));
  const span = Math.max(1, (total && total > 0 ? total : max));
  // Fracciones sin unidad (0–1): el CSS las multiplica por el ancho útil.
  const readFrac = (fromPage ?? 0) / span;
  const markFrac = now / span;
  const clamp = (p: number) => Math.min(max, Math.max(min, p));

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    // La cinta recorre el tramo [min, max] del canto completo [0, span].
    const page = Math.round(((e.clientX - r.left) / r.width) * span);
    onChange(clamp(page));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in step) { e.preventDefault(); onChange(clamp(now + step[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(min); }
    else if (e.key === "End") { e.preventDefault(); onChange(max); }
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t("label")}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={t("valueText", { page: now, delta: Math.max(0, now - (fromPage ?? 0)) })}
      className={styles.book}
      style={{ "--read": readFrac, "--mark": markFrac } as CSSProperties}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
      onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <span className={styles.pages} aria-hidden />
      <span className={styles.read} aria-hidden />
      <span className={styles.today} aria-hidden />
      <span className={styles.ribbon} aria-hidden />
    </div>
  );
}
```

```css
/* src/components/session/bookmark-field.module.css */
/* El canto de un libro: bloque de páginas en papel con sus hojas, lo leído algo
   más oscuro, el tramo de hoy dorado y la cinta del marcapáginas en la página. */
.book { position: relative; height: 54px; border-radius: 4px 4px 3px 3px; cursor: ew-resize; touch-action: pan-y; user-select: none;
  background: linear-gradient(180deg, #6f3418, #8e3b2b 18%, #6f3418 30%, transparent 30%), linear-gradient(180deg, transparent 70%, #6f3418 70%, #8e3b2b 82%, #5a2a14);
  box-shadow: 0 10px 16px -10px rgba(0,0,0,.9) }
.pages { position: absolute; inset: 16% 6px; border-radius: 2px;
  background: repeating-linear-gradient(90deg, rgba(120,95,60,.18) 0 1px, transparent 1px 3px), linear-gradient(180deg, #f7eedb, #e6d6b4) }
.read { position: absolute; top: 16%; bottom: 16%; left: 6px; width: calc((100% - 12px) * var(--read)); background: rgba(70,45,20,.22); border-radius: 2px 0 0 2px }
.today { position: absolute; top: 16%; bottom: 16%; left: calc(6px + (100% - 12px) * var(--read)); width: calc((100% - 12px) * (var(--mark) - var(--read)));
  background: linear-gradient(180deg, rgba(224,169,74,.45), rgba(224,169,74,.25)) }
.ribbon { position: absolute; top: -6px; left: calc(6px + (100% - 12px) * var(--mark)); width: 10px; height: calc(100% + 18px); transform: translateX(-50%);
  background: linear-gradient(90deg, #7a1a14, #c23a2e 50%, #7a1a14); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%);
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.5)); transition: left .18s cubic-bezier(.3,1.3,.5,1) }
.book:focus-visible { outline: 2px solid #e0a94a; outline-offset: 3px }
@media (prefers-reduced-motion: reduce) { .ribbon { transition: none } }
```

- [ ] **Step 4: Integra en `BookProgressField`**

En `src/components/session/book-progress-field.tsx`:

1. Importa:
   ```tsx
   import materials from "@/components/stage/materials.module.css";
   import { BookmarkField } from "./bookmark-field";
   ```
   y añade `const tr = useTranslations("ritual.bookmark");`.
2. Sustituye el primer bloque `<div className="flex flex-col gap-2">` (el raíl, de «advance» a la
   leyenda) por:
   ```tsx
   <div className="flex flex-col gap-2">
     <span className="flex justify-between font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
       {t("advance")}
       {total !== null && <span className="normal-case tracking-normal">{t("advanceOf", { current: toPageNum ?? fromPage ?? 0, total })}</span>}
     </span>
     <BookmarkField fromPage={fromPage} value={toPageNum} total={total} onChange={(p) => setPage(p)} />
   </div>
   ```
3. En el segundo bloque, sustituye la caja con los botones − y + por una lectura en la que **la cifra
   sigue siendo el input**:
   ```tsx
   <div className="flex items-baseline justify-center gap-2 font-serif">
     <span className="text-[22px] text-muted-foreground">{fromPage ?? 0} →</span>
     <Input
       name="page" type="number" min={0} max={total ?? undefined} inputMode="numeric"
       aria-label={t("finalPage")} value={toPage}
       onChange={(e) => updatePage(e.target.value)}
       onBlur={() => toPageNum !== null && setPage(toPageNum)}
       className="w-[4.5ch] border-0 bg-transparent p-0 text-center font-serif text-[34px] font-semibold focus:ring-0"
     />
     {delta !== null && delta > 0 && <span className="font-mono text-[12px] text-[var(--st-gold)]">{tr("delta", { delta })}</span>}
   </div>
   ```
   - Borra los botones − y + (los sustituyen el teclado del slider y los saltos).
   - Los chips de `JUMPS` quedan con `className={materials.brass}`.
   - Mantén el chip de `deltaFull` y el texto de `fromMark` como están.
4. Duración:
   - las fichas `DURATION_CHIPS` y «Otro» usan `className={materials.brass}` con
     `aria-pressed` (ya lo tienen);
   - el `Input name="durationMinutes"` y el bloque de la hora van dentro de
     `<details ref={detailsRef} className="…"><summary>{tr("more")}</summary>…</details>`;
   - en `pickDuration(null)`, antes de enfocar, abre el desplegable con
     `if (detailsRef.current) detailsRef.current.open = true;`;
   - el `<input type="hidden" name="startedAt">` queda **fuera** del `<details>`, tal cual.
5. El cronómetro (`SessionTimer`) y el conmutador A mano / Cronómetro no cambian.

- [ ] **Step 5: Comprueba que pasa**

Run: `npx vitest run src/components/session; npx tsc --noEmit; npm run lint`
Expected: PASS. `session-sheet.test.tsx` sigue encontrando «Duración» con `getByLabelText`, porque
jsdom no oculta el contenido de un `<details>` cerrado. Si algo falla, corrige el componente; nunca
el test.

- [ ] **Step 6: Commit**

```bash
git add src/components/session
git commit -m "feat(sesion): marcapáginas sobre el libro de canto y controles de latón"
```

---

### Task 5: Escena de la sesión, mascota y microrritual al guardar

**Files:**
- Modify: `src/components/session/session-sheet.tsx`
- Modify: `src/components/session/series-episode-grid.tsx`
- Test: `src/components/session/session-sheet.test.tsx`

**Interfaces:**
- Consumes: `ritualScope`, `leather`, `knob` y `paper` (Task 1); `StageMascot` y `MiniShelf` (Task 1); `openingLine` y `savedLine` (Task 2); `ctx.pet` y `ritual.session.*` (Task 3).

- [ ] **Step 1: Escribe el test que falla**

En `src/components/session/session-sheet.test.tsx`:

1. Añade el mock `vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => null }));`.
2. Saca el `push` del mock de `next/navigation` a `h`:
   - `const h = vi.hoisted(() => ({ addSession: vi.fn(), push: vi.fn() }));`
   - `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));`
   - `h.push.mockReset()` en el `beforeEach`.
3. Haz que `sheet()` acepte cambios en el contexto:
   - `function sheet(over: Partial<SessionContext> = {})`;
   - añade `pet: null` y `...over` al objeto `ctx`;
   - importa `type SessionContext` de `@/lib/sessions/load-context`.
4. Añade:

```tsx
describe("SessionSheet · ritual", () => {
  it("abre con la frase de la página actual (narrador sin mascota)", () => {
    sheet({ position: { page: 180 }, status: "in_progress", total: 412 });
    expect(screen.getByRole("status").textContent).toContain("Ibas por la 180");
  });

  it("al guardar dice la frase de la sesión y solo cierra tras el microrritual", async () => {
    h.addSession.mockResolvedValue({ ok: true });
    const { container } = sheet({ position: { page: 180 }, status: "in_progress", total: 412 });
    fireEvent.change(screen.getByLabelText("Página final de hoy"), { target: { value: "214" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("34 páginas"));
    expect(h.push).not.toHaveBeenCalled();
    await waitFor(() => expect(h.push).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });
});
```

El status de la mascota es el único `role="status"` de la hoja. Si hay otro (un mensaje de error),
usa `container.querySelector('[aria-live="polite"]')`.

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/session/session-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementa en `session-sheet.tsx`**

1. Imports:
   ```tsx
   import materials from "@/components/stage/materials.module.css";
   import { StageMascot, type Speech } from "@/components/stage/stage-mascot";
   import { MiniShelf } from "@/components/stage/mini-shelf";
   import { openingLine, savedLine } from "@/lib/ritual/session-lines";
   ```
   y añade `const tRitual = useTranslations("ritual.session");`.
2. El `<form>` añade la clase `${materials.ritualScope}` a las que ya tiene. La cabecera y el pie
   fijos cambian `bg-background/90` y `/92` por `bg-[var(--st-bg)]/90`.
3. El botón ✕ de la cabecera usa `className={materials.knob}`.
4. Debajo de `<SessionHero …/>` añade la balda con la mascota:
   ```tsx
   <div className="relative mx-4 mt-1 mb-2 shrink-0 pt-[92px]">
     <MiniShelf spines={[{ color: "#b5652f", h: 70 }, { color: "#2f6f73", h: 60 }, { color: "#6b4d77", h: 76 }]}>
       <StageMascot pet={ctx.pet} speech={speech} entered size="sm" />
     </MiniShelf>
   </div>
   ```
5. Microrritual: sustituye el `useEffect` de `state.ok` por este, que conserva `clearTimer` inmediato y
   difiere el cierre y las celebraciones:
   ```tsx
   useEffect(() => {
     if (!state.ok) return;
     if (itemType === "book") clearTimer(passId);
     if (state.passClosed) { checkCelebrations(); return; }
     // Microrritual: la frase de la mascota se ve antes de salir; las
     // celebraciones drenan después, como hoy (spec, decisión 5).
     const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
     const id = window.setTimeout(() => { checkCelebrations(); closeSheet(); }, reduced ? 120 : 1200);
     return () => window.clearTimeout(id);
   }, [state, closeSheet, itemType, passId]);
   ```
6. La frase se deriva en el render (sin `setState` en efectos):
   ```tsx
   const line = state.ok
     ? savedLine({ itemType, fromPage: currentPage, toPage: livePage, total, episodes: newlyMarkedCount })
     : openingLine(itemType, currentPage);
   const speech: Speech = { text: tRitual(line.key, line.values), mood: state.ok ? "joy" : "idle" };
   ```
7. El botón de envío deja `<Button>` y pasa a
   `<button type="submit" disabled={pending || notePending} className={`${materials.leather} w-full`}>`,
   con los mismos textos (`t("submit")`, etc.: «Guardar sesión» no cambia).
8. El bloque «compartir» y el `<details>` del estado pasan a `bg-[var(--st-panel)]`. Fecha, `Select` e
   `Input` adoptan la paleta solos, por los tokens de `ritualScope`.

- [ ] **Step 4: Fichas de episodio en papel con sello (`series-episode-grid.tsx`)**

En el `className` de cada episodio (≈ línea 185):
- la variante **no** marcada usa `materials.paper`;
- la marcada añade la clase `stamped` de un CSS module nuevo, `series-episode-grid.module.css`:
  ```css
  .stamped { position: relative }
  .stamped::after { content: "✓"; position: absolute; right: 6px; top: 50%; transform: translateY(-50%) rotate(-12deg); width: 22px; height: 22px; border-radius: 50%;
    display: grid; place-items: center; font-weight: 700; color: #9b3a24; border: 2px solid #9b3a24; opacity: .85 }
  ```

No cambies estado, eventos ni `data-testid`.

- [ ] **Step 5: Comprueba que pasa**

Run: `npx vitest run src/components/session; npx tsc --noEmit; npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/session
git commit -m "feat(sesion): escena con mascota, materiales y microrritual al guardar"
```

---

### Task 6: Piezas del cierre (`InkDateStamp`, `WaxSeal`, `ClosingObject`)

**Files:**
- Create: `src/components/detail/ink-date-stamp.tsx`, `src/components/detail/wax-seal.tsx`, `src/components/detail/closing-object.tsx`, `src/components/detail/closing.module.css`, `src/components/detail/closing-pieces.test.tsx`

**Interfaces:**
- Consumes: `RatingDots` (`src/components/ui/rating-dots.tsx`) y el namespace `ritual.closing` (Task 3).
- Produces:
  - `InkDateStamp({ name, defaultValue, max, label }: { name: string; defaultValue: string; max: string; label: string })`
  - `WaxSeal({ value, onChange, itemType }: { value: number | null; onChange: (v: number) => void; itemType: ItemType })`
  - `ClosingObject({ itemType, variant, closing, stamp, seal, children }: { itemType: ItemType; variant: "completed" | "dropped"; closing: boolean; stamp: ReactNode; seal?: ReactNode; children: ReactNode })`

- [ ] **Step 1: Escribe el test que falla**

```tsx
// src/components/detail/closing-pieces.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { InkDateStamp } from "./ink-date-stamp";
import { WaxSeal } from "./wax-seal";
import { ClosingObject } from "./closing-object";
afterEach(cleanup);
const wrap = (n: React.ReactNode) => <NextIntlClientProvider locale="es" messages={messages}>{n}</NextIntlClientProvider>;

describe("InkDateStamp", () => {
  it("es un input de fecha con su nombre y muestra la fecha sellada", () => {
    render(wrap(<InkDateStamp name="finishedOn" defaultValue="2026-11-07" max="2026-11-07" label="Fecha de fin" />));
    const input = screen.getByLabelText("Fecha de fin") as HTMLInputElement;
    expect(input.name).toBe("finishedOn");
    expect(input.type).toBe("date");
    fireEvent.change(input, { target: { value: "2026-10-01" } });
    expect(screen.getByText(/1 oct 2026/i)).toBeTruthy();
  });
});

describe("WaxSeal", () => {
  it("usa RatingDots (botones N/10), graba la nota y la lleva en name=rating", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(wrap(<WaxSeal value={null} onChange={onChange} itemType="book" />));
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    expect(onChange).toHaveBeenCalledWith(8);
    rerender(wrap(<WaxSeal value={8} onChange={onChange} itemType="book" />));
    expect((container.querySelector('input[name="rating"]') as HTMLInputElement).value).toBe("8");
    expect(screen.getByText("8")).toBeTruthy();
  });
});

describe("ClosingObject", () => {
  it.each([["book", "lastPage"], ["movie", "ticket"], ["series", "disc"]] as const)("%s usa su objeto", (itemType, cls) => {
    const { container } = render(wrap(<ClosingObject itemType={itemType} variant="completed" closing={false} stamp={<i />}><textarea /></ClosingObject>));
    expect(container.firstElementChild!.className).toMatch(new RegExp(cls));
  });
  it("abandonar: marcapáginas dentro y sin lacre", () => {
    const { container } = render(wrap(<ClosingObject itemType="book" variant="dropped" closing={false} stamp={<i />} seal={<b data-seal />}><textarea /></ClosingObject>));
    expect(container.querySelector("[data-bookmark]")).toBeTruthy();
    expect(container.querySelector("[data-seal]")).toBeNull();
  });
  it("closing añade la clase de cierre", () => {
    const { container } = render(wrap(<ClosingObject itemType="movie" variant="completed" closing stamp={<i />}><textarea /></ClosingObject>));
    expect(container.firstElementChild!.className).toMatch(/closing/);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/detail/closing-pieces.test.tsx`
Expected: FAIL; los módulos no existen.

- [ ] **Step 3: Implementa**

```tsx
// src/components/detail/ink-date-stamp.tsx
"use client";
import { useState } from "react";
import styles from "./closing.module.css";

const FMT = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Sello de tinta con la fecha de fin (spec 2026-11-07). El input de fecha nativo
// va encima, transparente: tocar el sello abre el selector y el valor viaja en `name`.
export function InkDateStamp({ name, defaultValue, max, label }: { name: string; defaultValue: string; max: string; label: string }) {
  const [value, setValue] = useState(defaultValue);
  const shown = value ? FMT.format(new Date(`${value}T00:00:00Z`)).replace(".", "") : "—";
  return (
    <label className={styles.stamp}>
      <span aria-hidden className={styles.stampFace}>{shown}</span>
      <input type="date" name={name} max={max} value={value} aria-label={label}
        onChange={(e) => setValue(e.target.value)} className={styles.stampInput} />
    </label>
  );
}
```

```tsx
// src/components/detail/wax-seal.tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { RatingDots } from "@/components/ui/rating-dots";
import styles from "./closing.module.css";

// La nota como lacre (spec 2026-11-07): piel nueva sobre RatingDots (misma escala
// 1–10 con medios y su accesibilidad). Cada nota nueva reestampa el lacre.
export function WaxSeal({ value, onChange, itemType }: { value: number | null; onChange: (v: number) => void; itemType: ItemType }) {
  const t = useTranslations("ritual.closing");
  const [stamp, setStamp] = useState(0);
  return (
    <div className={styles.sealRow}>
      <span key={stamp} className={`${styles.wax} ${value !== null ? styles.waxSet : ""}`} aria-hidden>
        {value ?? ""}
      </span>
      <div className={styles.sealDots}>
        <span className={styles.sealLabel}>{value === null ? t("sealEmpty") : t("sealLabel")}</span>
        <RatingDots value={value} onChange={(v) => { onChange(v); setStamp((n) => n + 1); }} itemType={itemType} size="lg" />
      </div>
      <input type="hidden" name="rating" value={value ?? ""} />
    </div>
  );
}
```

```tsx
// src/components/detail/closing-object.tsx
"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import styles from "./closing.module.css";

const OBJECT: Record<ItemType, "lastPage" | "ticket" | "disc"> = { book: "lastPage", movie: "ticket", series: "disc" };

// El objeto en el que se cierra la obra (spec 2026-11-07): última página, entrada de
// cine o caja del último disco, con los mismos huecos: sello de fecha, texto (la
// reseña) y lacre. `closing` dispara su cierre (libro que se cierra, entrada que se
// perfora, caja que se precinta). Abandonar: sin lacre y con el marcapáginas dentro.
export function ClosingObject({
  itemType, variant, closing, stamp, seal, children,
}: {
  itemType: ItemType; variant: "completed" | "dropped"; closing: boolean; stamp: ReactNode; seal?: ReactNode; children: ReactNode;
}) {
  const t = useTranslations("ritual.closing");
  const kind = OBJECT[itemType];
  return (
    <div className={`${styles.object} ${styles[kind]} ${closing ? styles.closing : ""}`}>
      <div className={styles.objectHead}>
        <span className={styles.objectTitle}>{t(kind === "lastPage" ? "lastPage" : kind === "ticket" ? "ticket" : "disc")}</span>
        {stamp}
      </div>
      <div className={styles.objectBody}>{children}</div>
      {variant === "completed" ? seal : <span data-bookmark className={styles.bookmark} aria-hidden />}
    </div>
  );
}
```

```css
/* src/components/detail/closing.module.css */
.object { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 16px 16px 14px; color: #2a1d10;
  background: linear-gradient(180deg, #f6ecd6, #eadcbd); box-shadow: 0 18px 30px -16px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.5); transform-origin: left center; transition: transform .6s cubic-bezier(.6,0,.4,1), opacity .4s }
.objectHead { display: flex; justify-content: space-between; align-items: center; gap: 10px }
.objectTitle { font-family: var(--f-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(42,29,16,.6) }
.objectBody { min-height: 88px }
/* Libro: última página con el lomo a la izquierda y el folio «Fin». */
.lastPage { border-radius: 2px 6px 6px 2px; border-left: 10px solid #6f3418; box-shadow: inset 8px 0 10px -8px rgba(0,0,0,.35), 0 18px 30px -16px rgba(0,0,0,.9) }
.lastPage.closing { transform: perspective(900px) rotateY(-92deg); opacity: .2 }
/* Película: entrada con su talón perforado a la derecha. */
.ticket { border-radius: 8px; padding-right: 54px;
  background: radial-gradient(circle at calc(100% - 44px) 0, transparent 7px, #f3e6c8 7.5px) top/100% 51% no-repeat, radial-gradient(circle at calc(100% - 44px) 100%, transparent 7px, #f3e6c8 7.5px) bottom/100% 51% no-repeat }
.ticket::after { content: ""; position: absolute; top: 10px; bottom: 10px; right: 44px; border-right: 2px dashed rgba(42,29,16,.3) }
.ticket.closing { animation: tear .6s ease-in forwards }
@keyframes tear { 60% { transform: rotate(-2deg) } to { transform: translateY(40px) rotate(-6deg); opacity: 0 } }
/* Serie: caja del último disco, con el disco asomando. */
.disc { border-radius: 4px; border: 6px solid #2b2f36; background: linear-gradient(180deg, #f4ead3, #e7d8b6) }
.disc::before { content: ""; position: absolute; right: -26px; top: 50%; width: 64px; height: 64px; margin-top: -32px; border-radius: 50%; z-index: -1;
  background: radial-gradient(circle, #ddd 0 6px, #333 6px 8px, transparent 8px), conic-gradient(#c9d3df, #f0f4f8, #b4c0cf, #eef2f6, #c9d3df) }
.disc.closing { animation: shut .6s ease-in forwards }
@keyframes shut { to { transform: scaleY(.04); opacity: 0 } }
/* Abandonar: el marcapáginas asoma por arriba. */
.bookmark { position: absolute; top: -10px; right: 28px; width: 12px; height: 46px; background: linear-gradient(90deg, #7a1a14, #c23a2e 50%, #7a1a14); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%) }
/* Sello de fecha */
.stamp { position: relative; display: inline-grid; place-items: center; padding: 4px 10px; border: 2px solid #9b3a24; border-radius: 6px; transform: rotate(-4deg); cursor: pointer }
.stampFace { font-family: var(--f-mono); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #9b3a24; opacity: .9 }
.stampInput { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100% }
.stamp:focus-within { outline: 2px solid #e0a94a; outline-offset: 3px }
/* Lacre */
.sealRow { display: flex; align-items: center; gap: 14px }
.wax { flex: none; width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; font-family: var(--f-display); font-size: 22px; font-weight: 700; color: rgba(255,220,200,.85);
  background: radial-gradient(circle at 35% 30%, #d4483a, #8e1f1a 60%, #5e110d); box-shadow: inset 0 -3px 6px rgba(0,0,0,.4), 0 3px 6px rgba(0,0,0,.4); opacity: .35; transform: scale(.85) }
.waxSet { opacity: 1; animation: press .38s cubic-bezier(.3,1.6,.5,1) both }
@keyframes press { from { transform: scale(1.35) rotate(-8deg); opacity: .3 } to { transform: scale(1) rotate(0) } }
.sealDots { display: flex; flex-direction: column; gap: 6px }
.sealLabel { font-family: var(--f-mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: rgba(42,29,16,.6) }
@media (prefers-reduced-motion: reduce) { .object, .ticket.closing, .disc.closing, .waxSet { transition-duration: .01ms; animation-duration: .01ms } }
```

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/detail/closing-pieces.test.tsx; npx tsc --noEmit; npm run lint`
Expected: PASS. Si el formato del mes en `Intl` de tu Node da otra cadena (p. ej. «1 oct. 2026»),
ajusta la expresión del test a la salida real de `es` sin el punto (`.replace(".", "")` ya lo
quita).

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/ink-date-stamp.tsx src/components/detail/wax-seal.tsx src/components/detail/closing-object.tsx src/components/detail/closing.module.css src/components/detail/closing-pieces.test.tsx
git commit -m "feat(cierre): sello de fecha, lacre y objetos de cierre por tipo"
```

---

### Task 7: El ritual de cierre en `ClosePassSheet`

**Files:**
- Modify: `src/components/detail/close-pass-sheet.tsx`
- Test: `src/components/detail/close-pass-sheet.test.tsx` (créalo si no existe)

**Interfaces:**
- Consumes: Task 1 (`ritualScope`, `leather`, `wood`, `brass`, `dedication`, `StageMascot`, `MiniShelf`); Task 2 (`recapLine`, `FAREWELL_VARIANTS`, `DROPPED_VARIANTS`); Task 3 (`loadClosingContext`); Task 6 (las piezas).

- [ ] **Step 1: Escribe el test que falla**

```tsx
// src/components/detail/close-pass-sheet.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const mocks = vi.hoisted(() => ({ close: vi.fn(), ctx: vi.fn(), mutuals: vi.fn() }));
vi.mock("@/lib/passes/actions", () => ({ closePass: mocks.close }));
vi.mock("@/lib/passes/load-closing-context", () => ({ loadClosingContext: mocks.ctx }));
vi.mock("@/lib/social/joint-viewing-actions", () => ({ loadMutualFollows: mocks.mutuals, createJointViewing: vi.fn() }));
vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => null }));
import { ClosePassSheet } from "./close-pass-sheet";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ctx.mockResolvedValue({ recap: { sessions: 23, days: 41, longestStreak: 9, pages: 412, episodes: null }, pet: null });
  mocks.mutuals.mockResolvedValue([]);
  mocks.close.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
const ui = (status: "completed" | "dropped", itemType: "book" | "movie" = "book", onClose = vi.fn()) => (
  <NextIntlClientProvider locale="es" messages={messages}>
    <ClosePassSheet passId="p" itemType={itemType} itemId="i" status={status} open onClose={onClose} />
  </NextIntlClientProvider>
);
const flush = async () => { await act(async () => { await vi.runAllTimersAsync(); }); };

describe("ClosePassSheet (ritual)", () => {
  it("abre con el recuento y la última página del libro", async () => {
    vi.useFakeTimers();
    const { container } = render(ui("completed"));
    await flush();
    expect(screen.getByRole("heading", { name: "¿Qué te ha parecido?" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("23 sesiones en 41 días");
    expect(container.querySelector('[class*="lastPage"]')).toBeTruthy();
    vi.useRealTimers();
  });
  it("película: entrada de cine", async () => {
    vi.useFakeTimers();
    const { container } = render(ui("completed", "movie"));
    await flush();
    expect(container.querySelector('[class*="ticket"]')).toBeTruthy();
    vi.useRealTimers();
  });
  it("guardar despide (frase y cierre) y solo después avisa al padre", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("abandonar: sin lacre", async () => {
    vi.useFakeTimers();
    render(ui("dropped"));
    await flush();
    expect(screen.queryByRole("button", { name: "8/10" })).toBeNull();
    vi.useRealTimers();
  });
  it("si falla el contexto, el cierre sigue con frase genérica", async () => {
    vi.useFakeTimers();
    mocks.ctx.mockRejectedValue(new Error("x"));
    render(ui("completed"));
    await flush();
    expect(screen.getByRole("status").textContent).toContain("Otro libro para la balda.");
    vi.useRealTimers();
  });
});
```

`closePass` se usa con `useActionState`. Si con el mock el envío del formulario no resuelve en
jsdom, mockea a nivel de `useActionState` como hagan otros tests de hojas del repo: busca uno con
`grep -rln "useActionState" src --include=*.test.tsx`.

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/detail/close-pass-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementa en `close-pass-sheet.tsx`**

1. Imports:
   ```tsx
   import materials from "@/components/stage/materials.module.css";
   import { StageMascot, type Speech } from "@/components/stage/stage-mascot";
   import { MiniShelf } from "@/components/stage/mini-shelf";
   import { loadClosingContext, type ClosingContext } from "@/lib/passes/load-closing-context";
   import { recapLine, FAREWELL_VARIANTS, DROPPED_VARIANTS } from "@/lib/ritual/closing-lines";
   import { InkDateStamp } from "./ink-date-stamp";
   import { WaxSeal } from "./wax-seal";
   import { ClosingObject } from "./closing-object";
   ```
   Añade `const tr = useTranslations("ritual.closing");`. Borra el import de `RatingDots`.
2. Contexto:
   - estado `const [ctx, setCtx] = useState<ClosingContext | null>(null);` y
     `const [farewell, setFarewell] = useState(false);`;
   - en el bloque de reapertura (`if (open)`), añade `setCtx(null); setFarewell(false);`;
   - añade un efecto que lo cargue, con el mismo patrón de cancelación que `loadMutualFollows`:
   ```tsx
   useEffect(() => {
     if (!open) return;
     let cancelled = false;
     loadClosingContext(passId)
       .then((c) => { if (!cancelled) setCtx(c); })
       .catch(() => { if (!cancelled) setCtx({ recap: null, pet: null }); });
     return () => { cancelled = true; };
   }, [open, passId]);
   ```
3. Despedida: en el efecto de éxito, cambia cada `dialogRef.current?.close()` por `bidFarewell()`:
   ```tsx
   function bidFarewell() {
     const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
     setFarewell(true);
     window.setTimeout(() => dialogRef.current?.close(), reduced ? 120 : 1600);
   }
   ```
   Es un `setState` dentro del efecto de respuesta, que ya existía. Si el lint marca
   `set-state-in-effect`, mueve `setFarewell(true)` a la derivación en el render con el patrón
   `prevState` de `session-sheet.tsx:114-118` y deja en el efecto solo el `setTimeout`.
4. La frase:
   ```tsx
   const variant = (n: number) => passId.length % n; // estable por pase, render puro
   const line = recapLine(itemType, ctx?.recap ?? null, new Date(), { weekday: (d) => new Intl.DateTimeFormat("es", { weekday: "long" }).format(d) });
   const speech: Speech = farewell
     ? { text: tr(status === "dropped" ? `dropped.${variant(DROPPED_VARIANTS)}` : `farewell.${variant(FAREWELL_VARIANTS)}`), mood: status === "dropped" ? "sad" : "joy" }
     : ctx ? { text: status === "dropped" ? tr(`dropped.${variant(DROPPED_VARIANTS)}`) : tr(line.key, line.values), mood: "idle" } : null;
   ```
   `new Date()` en el render es impuro, y el React Compiler o el lint pueden quejarse. En ese caso,
   guarda `const [openedAt] = useState(() => new Date())`, actualízalo en el bloque de reapertura y
   úsalo en lugar de `new Date()`.
5. Maquetación: el `<dialog>` pasa a `className={`m-auto w-[min(460px,94vw)] rounded-card border-0 p-0 shadow-card backdrop:bg-scrim ${materials.ritualScope}`}`.
   Dentro del `<form>`, en este orden:
   - **Cabecera:** igual, con el `h2` «¿Qué te ha parecido?».
   - **Balda con mascota:**
     ```tsx
     <div className="relative px-5 pt-[92px]"><MiniShelf spines={[{ color: "#b5652f", h: 70 }, { color: "#2f6f73", h: 62 }]} landing={farewell && status !== "dropped" ? { color: "#8e3b2b" } : null}><StageMascot pet={ctx?.pet ?? null} speech={speech} entered={ctx !== null} size="sm" /></MiniShelf></div>
     ```
   - **El objeto:**
     ```tsx
     <div className="px-5 py-4">
       <ClosingObject itemType={itemType} variant={status === "dropped" ? "dropped" : "completed"} closing={farewell}
         stamp={<InkDateStamp name="finishedOn" defaultValue={today()} max={today()} label={tr("dateStamp")} />}
         seal={<WaxSeal value={rating} onChange={setRating} itemType={itemType} />}>
         <div className="relative">
           <textarea name="review" value={review} onChange={(e) => setReview(e.target.value)} onInput={mention.onInput} onKeyDown={mention.onKeyDown}
             placeholder={tr(itemType === "book" ? "dedicationBook" : itemType === "movie" ? "dedicationMovie" : "dedicationSeries")}
             aria-label={t("review")} rows={4} className={materials.dedication} />
           {mention.dropdown}
         </div>
       </ClosingObject>
     </div>
     ```
   - **Ajustes**, en un `div` con `px-5 flex flex-col gap-3`: `ReviewSpoilerField`; el selector de
     acompañantes (bloque actual); `DroppedReasonFields` si `status === "dropped"`; y el interruptor
     de visibilidad como chapa de latón:
     ```tsx
     <label className={`${materials.brass} inline-flex w-fit items-center gap-2`}><input type="checkbox" name="isPublic" defaultChecked className="sr-only" />{tr("public")}</label>
     ```
     `brass` resalta con `:has(input:checked)`. Mantén el texto accesible de `t("isPublic")` como
     `aria-label` del input.
   - **Errores:** igual.
   - **Pie:** «Ahora no» con `className={`${materials.wood} flex-1`}` y «Guardar» con
     `className={`${materials.leather} flex-1`}`. Son `<button>` nativos con los mismos textos,
     `type` y `disabled`.
   - **Para lectores de pantalla:** con `farewell`, añade
     `<p role="status" className="sr-only">{tr("farewellSr")}</p>`.
6. Borra el antiguo bloque de fecha (`input type="date" name="finishedOn"`) y el de `RatingDots`: los
   sustituyen el sello y el lacre.

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/detail src/components/session; npx tsc --noEmit; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail
git commit -m "feat(cierre): recuento, objeto por tipo, dedicatoria, lacre y despedida"
```

---

### Task 8: Verificación en navegador y e2e

**Files:**
- Create: `e2e/cierre-ritual.spec.ts`
- Revisa: `e2e/registrar-sesion-v2.spec.ts`, `e2e/notas-captura.spec.ts`, `e2e/pase-hub.spec.ts`, `e2e/posts.spec.ts`, `e2e/notas-en-el-margen.spec.ts`

- [ ] **Step 1: Verifica a mano con capturas reales**

1. Arranca el servidor de desarrollo en otra terminal: `npx next dev --webpack -p 3000`.
2. Haz capturas a 1280 y a 412 px con un spec temporal de Playwright que no se commitea (patrón:
   `e2e/zz-tmp-*.spec.ts`, inicio de sesión con `submitLogin` de `e2e/support/visible-form.ts`).
3. Revisa:
   - **Sesión de libro:** la mascota sobre la balda con la frase de apertura; arrastrar el
     marcapáginas actualiza la cifra; «+10» funciona; «Más precisión» abre minutos y hora; al guardar
     sale la frase y la hoja se cierra en ~1,2 s.
   - **Sesión de serie:** las fichas de papel con sello.
   - **Cierre de libro:** recuento, última página, sello de fecha, lacre, despedida y lomo a la balda.
   - **Cierre de película:** la entrada.
   - **Abandono:** el marcapáginas dentro y sin lacre.
4. Comprueba que la consola no tiene errores.

- [ ] **Step 2: e2e del cierre**

Crea `e2e/cierre-ritual.spec.ts`. Reutiliza los helpers de `e2e/registrar-sesion-v2.spec.ts`
(`login`, `devtestId`, `resolveBookFixture` y `sessionLink`). Si no se exportan, muévelos a
`e2e/support/` y no importes un `.spec.ts` desde otro. Escenario:
- `test.use({ contextOptions: { reducedMotion: "reduce" } })`;
- abre la sesión desde la pestaña de registro y rellena `input[name="page"]` con el total;
- «Guardar sesión» → espera el diálogo con el heading «¿Qué te ha parecido?»;
- pulsa el botón «8/10» y escribe la dedicatoria en el textarea (`getByRole("textbox", { name: "Tu reseña…" })` u otro equivalente según el `aria-label`);
- «Guardar» → no queda ningún diálogo;
- comprueba en la BD (o en la pestaña de registro) que el pase tiene `rating = 8` y `review` con el texto.

Añade un segundo caso de película: marcar vista desde la ficha (`/pelicula/[id]`, el botón de estado
que use `pase-hub.spec.ts`), comprobar que aparece la entrada (`[class*="ticket"]`) y pulsar «Ahora
no».

- [ ] **Step 3: Corre los e2e contra build de producción**

1. Build: `npx next build --webpack`.
2. Arranca `npm run start` en segundo plano, con el puerto 3000 libre.
3. Run: `npx playwright test e2e/registrar-sesion-v2.spec.ts e2e/notas-captura.spec.ts e2e/pase-hub.spec.ts e2e/notas-en-el-margen.spec.ts e2e/posts.spec.ts e2e/cierre-ritual.spec.ts`
4. Expected: PASS. Si alguno falla por el microrritual (la hoja tarda ~1,2 s en cerrarse), sube su
   `timeout` de espera del cierre. No quites el microrritual.
5. Para el servidor.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(ritual): e2e del cierre de libro y de película"
```

---

### Task 9: Documentación («hecho»)

**Files:**
- Modify: `docs/requirements/decisiones.md` (al final), `docs/requirements/backlog.md`, `docs/UI-GLOSARIO.md`, `docs/architecture/graph.json` (+ `node docs/architecture/sync.mjs`), `docs/superpowers/specs/2026-11-07-sesion-y-cierre-ritual-design.md`

- [ ] **Step 1: `decisiones.md`**

Añade al final:

```markdown
## 2026-11-07 — Registrar sesión y cerrar una lectura como ritual

- La sesión y el cierre adoptan la esencia de «Sacar un lomo»: materiales del mueble, mascota con
  frases de datos y controles opcionales. Las server actions y el esquema no cambian; las hojas
  conservan su orquestación (#117, askResume, sin red, cronómetro, cuaderno en vivo).
- **Libros:** el avance se marca con un marcapáginas sobre el libro de canto (`BookmarkField`,
  `role="slider"`). **Desvío de la spec:** la cifra de la página sigue siendo el `<input
  name="page">` visible, como lectura del marcapáginas (decisión D1 previa; varios e2e lo rellenan).
  Detrás del «+» («Más precisión») quedan los minutos exactos y la hora.
- **Cierre:** recuento del pase con `loadClosingContext` (server action, sin caché, regla #437); un
  objeto por tipo (última página, entrada de cine, caja del disco); la reseña como dedicatoria; la
  nota como lacre (piel sobre `RatingDots`); despedida con el lomo volando a la balda. Abandonar: sin
  lacre y con el marcapáginas dentro.
- **Microrritual:** tras guardar una sesión, la hoja espera ~1,2 s (≤ 120 ms con reduced motion) con
  la frase de la mascota antes de cerrarse; las celebraciones salen después, como antes.
- **Base compartida** en `src/components/stage/` (paleta y materiales, `StageMascot`, `MiniShelf`); la
  partida la usa. Los tokens de la app se redefinen dentro de `ritualScope` para que los Input y
  Select de dentro adopten el espresso.
- Spec: `docs/superpowers/specs/2026-11-07-sesion-y-cierre-ritual-design.md`.
```

- [ ] **Step 2: Backlog, glosario, spec y grafo**

- **Backlog:** añade una casilla marcada `- [x] Ritual de registrar sesión y cerrar lectura (spec
  2026-11-07)` junto a los ítems de sesión o pase. Encuéntralos con
  `grep -n -i "sesión\|cerrar" docs/requirements/backlog.md`.
- **Glosario:** añade «Marcapáginas» (control del avance en la sesión), «Lacre» (la nota en el
  cierre) y «Dedicatoria» (la reseña en el cierre).
- **Spec:** en «La sesión diaria», cambia la viñeta «Tras un «+»: el número exacto (input), la hora de
  inicio y los minutos exactos» por «La cifra de la página es el input visible (lectura del
  marcapáginas); tras un «+»: la hora de inicio y los minutos exactos».
- **Grafo:** sigue `docs/architecture/README.md` («editar graph.json y ejecutar
  `node docs/architecture/sync.mjs`»). Añade a los nodos de sesión y detalle los ficheros nuevos y a
  `meta.verifiedAgainst` una cláusula para esta rama.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(ritual): decisión, backlog, glosario, spec y grafo"
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de la spec:**

  | Sección de la spec | Task |
  |---|---|
  | Escena y mascota de la sesión | 1, 3, 5 |
  | Marcapáginas, latón y «+» | 4 |
  | Series en papel | 5 |
  | Microrritual | 5 |
  | Cierre: recuento | 2, 3, 7 |
  | Cierre: objetos | 6, 7 |
  | Cierre: sello y lacre | 6, 7 |
  | Cierre: ajustes y despedida | 7 |
  | Abandono | 6, 7 |
  | Base compartida | 1 |
  | Errores | 3, 7 |
  | Reduced motion | 1, 4, 5, 6, 7 |
  | Pruebas | 1, 2, 4, 5, 6, 7, 8 |
  | Lo que no cambia | Global Constraints y 4, 5, 7 |

- **Desvío explícito:** la cifra de la página sigue siendo el input visible (Global Constraints y
  Task 9).
- **Tipos coherentes:** `StagePet`, `Speech`, `StageMascot`, `MiniShelf`, `ClosingRecap`,
  `SessionLine`, `ClosingLine`, `ClosingContext`, `BookmarkField`, `InkDateStamp`, `WaxSeal` y
  `ClosingObject` se usan con el mismo nombre en todas las tasks.
