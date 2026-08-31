# Siluetas SVG por tipo de dado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada tipo de dado del Aleatorio muestra su silueta clásica de mesa (SVG 2D); el cubo 3D universal desaparece.

**Architecture:** Componente presentacional puro `DieShape` (SVG por familia, decidida por el helper puro `dieShapeFor`). `DiceStage` se reescribe alrededor de él manteniendo intacta la puerta de aterrizaje (landedId + onAnimationEnd + buzz + bypass reduced-motion). Muere el código del cubo (`stableFace`, `faceRotation`, `fillerFaces`, `FACE_TRANSFORMS`, clases CSS 3D).

**Tech Stack:** React 19 client components, CSS Modules, Vitest, Playwright. Sin dependencias nuevas.

## Global Constraints

- Rama de trabajo: `feat/play-randomizer-visual` (PR #990 abierta) — commits directos, sin worktree nuevo.
- Motor intacto: nada bajo `src/lib/play/` cambia.
- Solo tokens CSS existentes: `--surface-3`, `--border`, `--foreground`.
- Testid `data-testid="dice-result"`, zona `aria-live="polite"` y duración de giro **900 ms** se conservan.
- Reduced motion: doble cobertura — el hook salta la puerta de aterrizaje Y el bloque `@media (prefers-reduced-motion: reduce)` anula la animación nueva.
- Sin claves i18n nuevas.
- Unit tests: `fnm exec --using=22 -- npx.cmd vitest run <path>` (el shell trae Node 20, que rompe vitest).
- e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` (reutiliza el dev server del puerto 3000; NO arrancar otro).
- `git add` con rutas explícitas, nunca `-A` ni `.` (hay untracked ajenos: `.impeccable/`, `.github/hooks/`).
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: `dieShapeFor` + componente `DieShape`

**Files:**
- Modify: `src/components/play/random/stage/stage-helpers.ts` (añadir al final)
- Modify: `src/components/play/random/stage/stage-helpers.test.ts` (añadir describe al final)
- Create: `src/components/play/random/stage/die-shape.tsx`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `dieShapeFor(sides: number): DieShapeKind` y `type DieShapeKind = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "round"` exportados de `stage-helpers.ts`; `DieShape({ sides, value, size }: { sides: number; value: string; size: number })` exportado de `die-shape.tsx`. Task 2 los importa tal cual.

- [ ] **Step 1: Test que falla para `dieShapeFor`**

Añadir al FINAL de `src/components/play/random/stage/stage-helpers.test.ts` (y `dieShapeFor` a la lista del import de `./stage-helpers` al principio del fichero):

```ts
describe("dieShapeFor", () => {
  it("mapea las familias clásicas y el percentil", () => {
    expect(dieShapeFor(4)).toBe("d4");
    expect(dieShapeFor(6)).toBe("d6");
    expect(dieShapeFor(8)).toBe("d8");
    expect(dieShapeFor(10)).toBe("d10");
    expect(dieShapeFor(100)).toBe("d10");
    expect(dieShapeFor(12)).toBe("d12");
    expect(dieShapeFor(20)).toBe("d20");
  });
  it("cualquier otro número de caras cae en round", () => {
    expect(dieShapeFor(2)).toBe("round");
    expect(dieShapeFor(7)).toBe("round");
    expect(dieShapeFor(1000)).toBe("round");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/components/play/random/stage/stage-helpers.test.ts`
Expected: FAIL — `dieShapeFor` no exportado.

- [ ] **Step 3: Implementar `dieShapeFor`**

Añadir al FINAL de `src/components/play/random/stage/stage-helpers.ts`:

```ts
export type DieShapeKind = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "round";

// Silueta por familia clásica de mesa; 100 es el percentil (usa el d10). El
// resto (2, 7, 30, 1000…) cae en círculo.
export function dieShapeFor(sides: number): DieShapeKind {
  switch (sides) {
    case 4:
      return "d4";
    case 6:
      return "d6";
    case 8:
      return "d8";
    case 10:
    case 100:
      return "d10";
    case 12:
      return "d12";
    case 20:
      return "d20";
    default:
      return "round";
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/components/play/random/stage/stage-helpers.test.ts`
Expected: PASS (los 7 describes del fichero, incluido el nuevo).

- [ ] **Step 5: Crear `DieShape`**

Crear `src/components/play/random/stage/die-shape.tsx` con exactamente:

```tsx
import { dieShapeFor, type DieShapeKind } from "./stage-helpers";

// Puntos de cada silueta poligonal en viewBox 100×100 (margen para el trazo).
const POLYGONS: Record<Exclude<DieShapeKind, "d6" | "round">, string> = {
  d4: "50,8 94,84 6,84",
  d8: "50,4 96,50 50,96 4,50",
  d10: "50,3 90,40 50,97 10,40",
  d12: "50,6 93.7,37.8 77,89.2 23,89.2 6.3,37.8",
  d20: "50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5",
};

// Centro óptico del texto por silueta (el triángulo carga la masa abajo).
const TEXT_Y: Record<DieShapeKind, number> = {
  d4: 62,
  d6: 50,
  d8: 50,
  d10: 48,
  d12: 52,
  d20: 50,
  round: 50,
};

/**
 * Dado SVG plano: silueta clásica por número de caras con el valor centrado.
 * Presentacional puro; el aria-label lo pone el botón contenedor.
 */
export function DieShape({ sides, value, size }: { sides: number; value: string; size: number }) {
  const kind = dieShapeFor(sides);
  const shapeProps = { fill: "var(--surface-3)", stroke: "var(--border)", strokeWidth: 3 };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {kind === "d6" ? (
        <rect x="10" y="10" width="80" height="80" rx="14" {...shapeProps} />
      ) : kind === "round" ? (
        <circle cx="50" cy="50" r="45" {...shapeProps} />
      ) : (
        <polygon points={POLYGONS[kind]} strokeLinejoin="round" {...shapeProps} />
      )}
      <text
        x="50"
        y={TEXT_Y[kind]}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={value.length >= 3 ? 26 : 35}
        fontWeight="600"
        style={{ fontVariantNumeric: "tabular-nums" }}
        fill="var(--foreground)"
      >
        {value}
      </text>
    </svg>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/play/random/stage/stage-helpers.ts src/components/play/random/stage/stage-helpers.test.ts src/components/play/random/stage/die-shape.tsx
git commit -m "feat(play): dieShapeFor y DieShape -- silueta SVG clasica por familia de dado

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: `DiceStage` sin cubo + limpieza del código 3D

**Files:**
- Modify: `src/components/play/random/stage/dice-stage.tsx` (reescritura completa)
- Modify: `src/components/play/random/dice-section.tsx` (prop `idleSides`)
- Modify: `src/components/play/random/stage/stage.module.css` (sección dados)
- Modify: `src/components/play/random/stage/stage-helpers.ts` (borrar helpers muertos)
- Modify: `src/components/play/random/stage/stage-helpers.test.ts` (borrar tests muertos)

**Interfaces:**
- Consumes: `DieShape({ sides, value, size })` de `./die-shape` (Task 1); `buzz()` y `useReducedMotion()` existentes.
- Produces: `DiceStage` gana prop obligatoria `idleSides: number`; el resto de su firma no cambia. Nadie más lo consume fuera de `dice-section.tsx`.

- [ ] **Step 1: Reescribir `dice-stage.tsx`**

Contenido completo del fichero:

```tsx
"use client";

import { useState } from "react";
import styles from "./stage.module.css";
import { buzz } from "./stage-helpers";
import { DieShape } from "./die-shape";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Dado SVG que gira al tirar y aterriza mostrando el primer resultado (teatro
 * determinista: el resultado ya está emitido). La silueta refleja el dado en
 * juego: la tirada actual o, en reposo, la config de los inputs. Con N>1, al
 * aterrizar aparecen mini-dados escalonados y el texto completo con el total.
 */
export function DiceStage({
  roll,
  idleSides,
  resultText,
  onRoll,
  label,
}: {
  roll: { id: string; sides: number; results: number[] } | null;
  idleSides: number;
  resultText: string | null;
  onRoll: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const landed = roll !== null && (reduced || landedId === roll.id);

  const sides = roll ? roll.sides : idleSides;
  const value = landed && roll ? String(roll.results[0]) : "?";

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onRoll} className={styles.objectButton}>
        <span
          key={roll?.id ?? "idle"}
          className={roll && !reduced ? `${styles.dieWrap} ${styles.dieSpin}` : styles.dieWrap}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && roll) {
              setLandedId(roll.id);
              buzz();
            }
          }}
        >
          <DieShape sides={sides} value={value} size={96} />
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && roll ? (
          <>
            {roll.results.length > 1 ? (
              <div className={styles.miniRow}>
                {roll.results.map((r, i) => (
                  <span key={i} className={styles.miniDie} style={{ animationDelay: `${i * 80}ms` }}>
                    <DieShape sides={roll.sides} value={String(r)} size={30} />
                  </span>
                ))}
              </div>
            ) : null}
            <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="dice-result">
              {resultText}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pasar `idleSides` desde `dice-section.tsx`**

En `src/components/play/random/dice-section.tsx`, el `<DiceStage …>` gana la prop (justo tras `roll={…}`):

```tsx
      <DiceStage
        roll={
          last
            ? { id: last.id, sides: last.payload.sides, results: last.payload.results }
            : null
        }
        idleSides={customValid ? parsedSides : 6}
        resultText={resultText}
        onRoll={() => (customValid ? roll(parsedCount, parsedSides) : roll(1, 6))}
        label={t("tap")}
      />
```

- [ ] **Step 3: CSS — sección dados nueva**

En `src/components/play/random/stage/stage.module.css`, sustituir TODO el bloque `/* ---- dados ---- */` (desde `.cubeScene` hasta `.miniDie` inclusive) por:

```css
/* ---- dados ---- */
.dieWrap {
  display: block;
  width: 96px;
  height: 96px;
}
.dieSpin {
  animation: dieroll 900ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@keyframes dieroll {
  from {
    transform: rotate(-720deg) scale(0.8);
  }
  70% {
    transform: rotate(-40deg) scale(1.08);
  }
  to {
    transform: rotate(0deg) scale(1);
  }
}
.miniRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.miniDie {
  display: inline-flex;
  animation: pop 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

Y en el bloque final `@media (prefers-reduced-motion: reduce)`, sustituir `.tumble,` por `.dieSpin,` (la lista queda: `.dieSpin, .coinFlip, .pop, .miniDie, .reveal, .card, .bagShake, .tokenPop`).

- [ ] **Step 4: Borrar helpers muertos**

En `src/components/play/random/stage/stage-helpers.ts`, borrar ENTERAS las funciones `stableFace`, `faceRotation` y `fillerFaces` con sus comentarios. Quedan: `hashString`, `stableColor`, `wheelSectors`, `wheelTargetAngle`, `buzz`, `dieShapeFor` (+ `DieShapeKind`).

En `src/components/play/random/stage/stage-helpers.test.ts`, borrar los describes `faceRotation`, `fillerFaces` y el it `stableFace determinista en 0..5` (el describe `stableColor / stableFace` pasa a llamarse `stableColor` y conserva solo su primer it). Quitar `faceRotation`, `fillerFaces` y `stableFace` del import.

- [ ] **Step 5: Verificación completa**

Run (en este orden):
1. `fnm exec --using=22 -- npx.cmd vitest run src/components/play/random/stage/stage-helpers.test.ts` — Expected: PASS.
2. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores (confirma que nada más importaba los helpers borrados).
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS sin tocar los specs (testid y tiempos conservados).

- [ ] **Step 6: Commit**

```bash
git add src/components/play/random/stage/dice-stage.tsx src/components/play/random/dice-section.tsx src/components/play/random/stage/stage.module.css src/components/play/random/stage/stage-helpers.ts src/components/play/random/stage/stage-helpers.test.ts
git commit -m "feat(play): cada dado con su silueta -- el cubo 3D universal se retira

d4 triangulo, d6 cuadrado, d8 rombo, d10/d100 cometa, d12 pentagono, d20
hexagono, resto circulo. Giro 2D de 900 ms con la misma puerta de
aterrizaje; mueren stableFace/faceRotation/fillerFaces y el CSS del cubo.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
