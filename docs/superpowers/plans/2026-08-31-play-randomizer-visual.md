# Aleatorio Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir las cuatro secciones del Aleatorio en escenarios animados (cubo 3D, moneda flip, ruleta, bolsa) sin tocar el motor de eventos.

**Architecture:** Capa de presentación nueva en `src/components/play/random/stage/` — componentes puramente presentacionales que reciben el resultado YA emitido y coreografían la animación hacia él (teatro determinista). Las secciones conservan toda la lógica (emit, validación, edición); solo cambia su render. Reducer, eventos, hook, selectors y db: intocados.

**Tech Stack:** React 19 + Next.js (App Router), CSS Modules con keyframes 3D, SVG inline, next-intl, Vitest, Playwright.

## Global Constraints

- **Motor intacto**: prohibido tocar `src/lib/play/random/*` y `src/lib/play/core/*`. La animación es teatro hacia un resultado ya emitido.
- Objetos disparadores = elementos `<button>` reales (focus, teclado y `disabled` gratis), con aria-label desde i18n.
- Testids conservados: `dice-result`, `coin-result`, `players-result`, `bag-result`. Solo puede haber UNO de cada montado a la vez.
- Duraciones exactas: dado 900 ms, moneda 1100 ms, ruleta 2200 ms `cubic-bezier(0.12, 0.8, 0.2, 1)`, bolsa sacudida 500 ms + ficha 400 ms con 500 ms de delay, cascada orden 120 ms/ítem, mini-dados 80 ms/dado, rebote resultado 250 ms.
- Vibración: `navigator.vibrate(30)` vía helper `buzz()` SOLO al aterrizar (animationend/transitionend). Nunca en render.
- `prefers-reduced-motion: reduce`: doble cobertura — hook `useReducedMotion` (salta el gating de aterrizaje) + bloque CSS que anula animaciones/transiciones.
- Paleta: SOLO tokens existentes (`--play-seat-1..6`, `--surface`, `--surface-muted`, `--surface-3`, `--border`). Cero colores nuevos.
- El azar visual de relleno (caras laterales, cara ganadora) puede usar `Math.random()`/hash — vive en componentes, jamás en el reducer.
- Tests: `fnm exec --using=22 -- npx.cmd vitest run <ruta>` (unit) y `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` (e2e; reutiliza dev server si hay uno en el puerto 3000).
- `git add` SIEMPRE con rutas explícitas (nunca `-A` ni `.`).
- Commits con trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: Helpers puros + hook de reduced motion

**Files:**
- Create: `src/components/play/random/stage/stage-helpers.ts`
- Create: `src/components/play/random/stage/stage-helpers.test.ts`
- Create: `src/components/play/random/stage/use-reduced-motion.ts`

**Interfaces:**
- Consumes: nada del proyecto (helpers puros).
- Produces: `stableColor(name: string): string` (devuelve `var(--play-seat-N)`, N∈1..6); `stableFace(id: string): number` (0..5); `faceRotation(face: number): { x: number; y: number }`; `wheelSectors(players: string[]): { name: string; start: number; end: number; color: string }[]` (grados, 0°=arriba, horario); `wheelTargetAngle(players: string[], picked: string, turns: number): number`; `fillerFaces(sides: number, count: number, rng?: () => number): number[]`; `buzz(): void`; hook `useReducedMotion(): boolean`.

- [ ] **Step 1: Test que falla**

```ts
// src/components/play/random/stage/stage-helpers.test.ts
import { describe, expect, it } from "vitest";
import {
  faceRotation,
  fillerFaces,
  stableColor,
  stableFace,
  wheelSectors,
  wheelTargetAngle,
} from "./stage-helpers";

describe("faceRotation", () => {
  it("las 6 caras tienen rotación única y la frontal es identidad", () => {
    const rots = [0, 1, 2, 3, 4, 5].map(faceRotation);
    expect(new Set(rots.map((r) => `${r.x},${r.y}`)).size).toBe(6);
    expect(rots[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("stableColor / stableFace", () => {
  it("stableColor determinista y dentro de la paleta de asientos", () => {
    expect(stableColor("Rojo")).toBe(stableColor("Rojo"));
    expect(stableColor("Rojo")).toMatch(/^var\(--play-seat-[1-6]\)$/);
  });
  it("stableFace determinista en 0..5", () => {
    expect(stableFace("abc")).toBe(stableFace("abc"));
    expect(stableFace("abc")).toBeGreaterThanOrEqual(0);
    expect(stableFace("abc")).toBeLessThan(6);
  });
});

describe("wheelSectors", () => {
  it("cubre 360 grados sin huecos y con colores de la paleta", () => {
    const s = wheelSectors(["a", "b", "c"]);
    expect(s[0].start).toBe(0);
    expect(s[2].end).toBe(360);
    expect(s[1].start).toBe(s[0].end);
    expect(s.every((x) => /^var\(--play-seat-[1-6]\)$/.test(x.color))).toBe(true);
  });
});

describe("wheelTargetAngle", () => {
  it("deja el centro del sector elegido bajo la flecha", () => {
    const players = ["a", "b", "c", "d"];
    // Sector de "b": 90..180, centro 135. Girar 360-135=225 lo sube arriba.
    expect(wheelTargetAngle(players, "b", 0)).toBe(225);
    expect(wheelTargetAngle(players, "b", 4)).toBe(4 * 360 + 225);
  });
  it("primer sector con centro en 45: gira 315", () => {
    expect(wheelTargetAngle(["a", "b", "c", "d"], "a", 0)).toBe(315);
  });
});

describe("fillerFaces", () => {
  it("respeta el rango 1..sides con RNG inyectado", () => {
    expect(fillerFaces(6, 3, () => 0)).toEqual([1, 1, 1]);
    expect(fillerFaces(6, 2, () => 0.999)).toEqual([6, 6]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/components/play/random/stage/stage-helpers.test.ts`
Expected: FAIL — módulo `./stage-helpers` no existe.

- [ ] **Step 3: Implementación**

```ts
// src/components/play/random/stage/stage-helpers.ts
// Helpers puros de la capa de escenarios del Aleatorio (spec visual §6).
// Solo geometría, hashes y vibración: nada de estado, nada de DOM (salvo
// buzz, que degrada a no-op), nada del motor.

const PALETTE_SIZE = 6;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Color estable por nombre sobre los 6 tokens de asiento de Play. Dos nombres
// distintos PUEDEN chocar (paleta de 6): asumido, el color es apoyo visual.
export function stableColor(name: string): string {
  return `var(--play-seat-${(hashString(name) % PALETTE_SIZE) + 1})`;
}

// Cara del cubo (0..5) en la que aterriza una tirada, estable por id de evento.
export function stableFace(id: string): number {
  return hashString(id) % 6;
}

// Rotación del cubo que trae la cara `face` al frente. Consistente con
// FACE_TRANSFORMS de dice-stage: 0 front, 1 back, 2 right, 3 left, 4 top, 5 bottom.
export function faceRotation(face: number): { x: number; y: number } {
  switch (face) {
    case 1:
      return { x: 0, y: 180 };
    case 2:
      return { x: 0, y: -90 };
    case 3:
      return { x: 0, y: 90 };
    case 4:
      return { x: -90, y: 0 };
    case 5:
      return { x: 90, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

// Sectores de la ruleta. Convención: 0° arriba, crece en sentido horario.
export function wheelSectors(
  players: string[],
): { name: string; start: number; end: number; color: string }[] {
  const step = 360 / players.length;
  return players.map((name, i) => ({
    name,
    start: i * step,
    end: (i + 1) * step,
    color: stableColor(name),
  }));
}

// Ángulo final (turns vueltas enteras + resto) que deja el CENTRO del sector
// de `picked` bajo la flecha (arriba). Girar la rueda +r mueve los sectores r
// grados en horario, así que para subir el centro c se gira 360-c.
export function wheelTargetAngle(players: string[], picked: string, turns: number): number {
  const i = Math.max(0, players.indexOf(picked));
  const step = 360 / players.length;
  const center = i * step + step / 2;
  return turns * 360 + ((360 - center) % 360);
}

// Números de relleno para las caras no ganadoras del cubo (teatro visual).
export function fillerFaces(
  sides: number,
  count: number,
  rng: () => number = Math.random,
): number[] {
  return Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
}

// Vibración sutil al aterrizar. No-op donde no hay soporte (iOS Safari, SSR).
export function buzz(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
}
```

```ts
// src/components/play/random/stage/use-reduced-motion.ts
"use client";

import { useEffect, useState } from "react";

// prefers-reduced-motion como estado React. Arranca en false (SSR) y se
// corrige al montar — mismo patrón de carga-en-efecto que el resto de Play
// (deuda de lint #856 asumida en este patrón).
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/components/play/random/stage/stage-helpers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/play/random/stage/stage-helpers.ts src/components/play/random/stage/stage-helpers.test.ts src/components/play/random/stage/use-reduced-motion.ts
git commit -m "feat(play): helpers puros y hook reduced-motion para los escenarios del Aleatorio"
```

---

### Task 2: CSS compartido + escenario de dados (cubo 3D)

**Files:**
- Create: `src/components/play/random/stage/stage.module.css`
- Create: `src/components/play/random/stage/dice-stage.tsx`
- Modify: `src/components/play/random/dice-section.tsx`
- Modify: `messages/es.json` (clave `play.random.dice.tap`)

**Interfaces:**
- Consumes: Task 1 (`buzz`, `faceRotation`, `fillerFaces`, `stableFace`, `useReducedMotion`).
- Produces: `DiceStage({ roll: { id: string; sides: number; results: number[] } | null; resultText: string | null; onRoll: () => void; label: string })`; clases CSS compartidas para el resto de tasks: `stage`, `objectButton`, `resultZone`, `pop`, `miniRow`, `miniDie`, `cubeScene`, `cubeSpin`, `tumble`, `cube`, `face`, `coinScene`, `coinSpin`, `coinFlip`, `coin`, `coinFace`, `coinBack`, `wheelWrap`, `wheel`, `wheelArrow`, `reveal`, `card`, `bagShake`, `tokenPop`, `token`, `pile`, `pileDot`.

- [ ] **Step 1: CSS del escenario (completo, para todas las tasks)**

```css
/* src/components/play/random/stage/stage.module.css
   Escenarios del Aleatorio (spec visual). Solo tokens existentes. Las
   duraciones son las de la spec; reduced-motion anula todo al final. */

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 260px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background:
    radial-gradient(
      ellipse at 50% 38%,
      color-mix(in srgb, var(--surface-muted) 70%, transparent),
      transparent 72%
    ),
    var(--surface);
  overflow: hidden;
}

.objectButton {
  appearance: none;
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  border-radius: 16px;
}
.objectButton:focus-visible {
  outline: 2px solid var(--accent-ink);
  outline-offset: 2px;
}
.objectButton:disabled {
  cursor: default;
  opacity: 0.45;
}

.resultZone {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.pop {
  animation: pop 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  60% {
    transform: scale(1.06);
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* ---- dados ---- */
.cubeScene {
  display: block;
  width: 96px;
  height: 96px;
  perspective: 480px;
}
.cubeSpin {
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}
.tumble {
  animation: tumble 900ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@keyframes tumble {
  from {
    transform: rotateX(660deg) rotateY(810deg);
  }
  to {
    transform: none;
  }
}
.cube {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}
.face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--surface-3);
  backface-visibility: hidden;
}
.miniRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.miniDie {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-3);
  animation: pop 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* ---- moneda ---- */
.coinScene {
  display: block;
  width: 110px;
  height: 110px;
  perspective: 600px;
}
.coinSpin {
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}
.coinFlip {
  animation: coinflip 1100ms cubic-bezier(0.3, 0.7, 0.2, 1) both;
}
@keyframes coinflip {
  from {
    transform: rotateX(1800deg);
  }
  to {
    transform: none;
  }
}
.coin {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}
.coinFace {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 50%;
}
.coinBack {
  transform: rotateX(180deg);
}

/* ---- ruleta ---- */
.wheelWrap {
  position: relative;
  display: block;
  width: 220px;
  height: 220px;
}
.wheel {
  width: 100%;
  height: 100%;
  transition: transform 2200ms cubic-bezier(0.12, 0.8, 0.2, 1);
  will-change: transform;
}
.wheelArrow {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 14px solid var(--foreground);
  z-index: 1;
}

/* ---- revelados (orden y equipos) ---- */
.reveal {
  animation: rise 300ms ease-out both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.card {
  animation: flipin 400ms ease-out both;
}
@keyframes flipin {
  from {
    opacity: 0;
    transform: rotateY(90deg);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---- bolsa ---- */
.bagShake {
  animation: shake 500ms ease-in-out both;
  transform-origin: 50% 88%;
}
@keyframes shake {
  0% {
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(-8deg);
  }
  40% {
    transform: rotate(7deg);
  }
  60% {
    transform: rotate(-5deg);
  }
  80% {
    transform: rotate(3deg);
  }
  100% {
    transform: rotate(0deg);
  }
}
.tokenPop {
  animation: tokenup 400ms 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes tokenup {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.4);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 10px 18px;
  border-radius: 999px;
  font-weight: 600;
  color: var(--surface);
}
.pile {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.pileDot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--border);
}

/* Reduced motion: sin teatro; el gating de aterrizaje lo salta el hook. */
@media (prefers-reduced-motion: reduce) {
  .tumble,
  .coinFlip,
  .pop,
  .miniDie,
  .reveal,
  .card,
  .bagShake,
  .tokenPop {
    animation: none;
  }
  .wheel {
    transition: none;
  }
}
```

- [ ] **Step 2: Componente DiceStage**

```tsx
// src/components/play/random/stage/dice-stage.tsx
"use client";

import { useMemo, useState } from "react";
import styles from "./stage.module.css";
import { buzz, faceRotation, fillerFaces, stableFace } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

// Colocación física de las 6 caras; el índice casa con faceRotation.
const FACE_TRANSFORMS = [
  "rotateY(0deg) translateZ(48px)",
  "rotateY(180deg) translateZ(48px)",
  "rotateY(90deg) translateZ(48px)",
  "rotateY(-90deg) translateZ(48px)",
  "rotateX(90deg) translateZ(48px)",
  "rotateX(-90deg) translateZ(48px)",
];

/**
 * Cubo 3D que rueda al tirar y aterriza mostrando el primer resultado en una
 * cara estable por id de evento (teatro determinista: el resultado ya está
 * emitido). Con N>1, al aterrizar aparecen mini-dados escalonados y el texto
 * completo con el total.
 */
export function DiceStage({
  roll,
  resultText,
  onRoll,
  label,
}: {
  roll: { id: string; sides: number; results: number[] } | null;
  resultText: string | null;
  onRoll: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const landed = roll !== null && (reduced || landedId === roll.id);

  // Cara ganadora + relleno, estables por tirada (no cambian entre renders).
  const view = useMemo(() => {
    if (!roll) return { face: 0, faces: ["?", "2", "3", "4", "5", "6"] };
    const face = stableFace(roll.id);
    const filler = fillerFaces(roll.sides, 5);
    let f = 0;
    const faces = Array.from({ length: 6 }, (_, i) =>
      i === face ? String(roll.results[0]) : String(filler[f++]),
    );
    return { face, faces };
  }, [roll]);

  const rot = faceRotation(view.face);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onRoll} className={styles.objectButton}>
        <span className={styles.cubeScene}>
          <span
            key={roll?.id ?? "idle"}
            className={roll && !reduced ? `${styles.cubeSpin} ${styles.tumble}` : styles.cubeSpin}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && roll) {
                setLandedId(roll.id);
                buzz();
              }
            }}
          >
            <span
              className={styles.cube}
              style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
            >
              {view.faces.map((n, i) => (
                <span key={i} className={styles.face} style={{ transform: FACE_TRANSFORMS[i] }}>
                  {n}
                </span>
              ))}
            </span>
          </span>
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && roll ? (
          <>
            {roll.results.length > 1 ? (
              <div className={styles.miniRow}>
                {roll.results.map((r, i) => (
                  <span key={i} className={styles.miniDie} style={{ animationDelay: `${i * 80}ms` }}>
                    {r}
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

- [ ] **Step 3: Reescribir dice-section para montar el escenario**

Sustituir el contenido de `src/components/play/random/dice-section.tsx` por:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DICE_MAX_COUNT, DICE_MAX_SIDES, rollDice } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";
import { DiceStage } from "./stage/dice-stage";

const QUICK_DICE = [4, 6, 8, 10, 12, 20];

/**
 * Dados: el cubo del escenario tira con la config actual de los inputs NdX
 * (vacíos = 1d6); los chips d4–d20 y el botón «Tirar» también disparan. El
 * azar se resuelve AQUÍ (rollDice) y el resultado viaja en el payload.
 */
export function DiceSection({
  lastRoll,
  onEmit,
}: {
  lastRoll: RandomEvent | undefined;
  onEmit: (payload: { count: number; sides: number; results: number[] }) => void;
}) {
  const t = useTranslations("play.random.dice");
  const [count, setCount] = useState("");
  const [sides, setSides] = useState("");

  function roll(countValue: number, sidesValue: number) {
    const results = rollDice(countValue, sidesValue);
    onEmit({ count: countValue, sides: sidesValue, results });
  }

  const parsedCount = Number(count || "1");
  const parsedSides = Number(sides || "6");
  const customValid =
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= DICE_MAX_COUNT &&
    Number.isInteger(parsedSides) &&
    parsedSides >= 2 &&
    parsedSides <= DICE_MAX_SIDES;

  const last = lastRoll && lastRoll.type === "dice_rolled" ? lastRoll : null;
  const resultText = last ? t("result", describeRandomEvent(last).params) : null;

  return (
    <div>
      <DiceStage
        roll={
          last
            ? { id: last.id, sides: last.payload.sides, results: last.payload.results }
            : null
        }
        resultText={resultText}
        onRoll={() => (customValid ? roll(parsedCount, parsedSides) : roll(1, 6))}
        label={t("tap")}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_DICE.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => roll(1, d)}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            d{d}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {t("countLabel")}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={DICE_MAX_COUNT}
            value={count}
            placeholder="1"
            onChange={(e) => setCount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {t("sidesLabel")}
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={DICE_MAX_SIDES}
            value={sides}
            placeholder="6"
            onChange={(e) => setSides(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={!customValid}
          onClick={() => roll(parsedCount, parsedSides)}
          className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          {t("roll")}
        </button>
      </div>
    </div>
  );
}
```

Nota: `last.id` — los `PlayEvent` de `makeEvent` llevan `id` string (se usa como key en el feed). Si el campo tuviera otro nombre en `src/lib/play/core/types.ts`, usar el real; NO cambiar el tipo.

- [ ] **Step 4: Clave i18n `dice.tap`**

En `messages/es.json`, namespace `play.random.dice` (buscar `"countLabel"` dentro de `random`), añadir:

```json
"tap": "Tirar el dado",
```

El aria-label del cubo NO puede ser «Tirar» a secas: chocaría con el botón «Tirar» de NdX (strict mode de Playwright y confusión de lectores).

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — Expected: limpio.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 4 passed (los e2e de dados esperan `dice-result`, que ahora aparece al aterrizar ~1 s; los `expect` de Playwright auto-esperan).

- [ ] **Step 6: Commit**

```bash
git add src/components/play/random/stage/stage.module.css src/components/play/random/stage/dice-stage.tsx src/components/play/random/dice-section.tsx messages/es.json
git commit -m "feat(play): escenario de dados -- cubo 3D que rueda hacia el resultado emitido"
```

---

### Task 3: Escenario de moneda (flip 3D)

**Files:**
- Create: `src/components/play/random/stage/coin-stage.tsx`
- Modify: `src/components/play/random/coin-section.tsx`

**Interfaces:**
- Consumes: Task 1 (`buzz`, `useReducedMotion`), Task 2 (clases `stage`, `objectButton`, `resultZone`, `pop`, `coinScene`, `coinSpin`, `coinFlip`, `coin`, `coinFace`, `coinBack`).
- Produces: `CoinStage({ flip: { id: string; result: "heads" | "tails" } | null; resultText: string | null; onFlip: () => void; label: string })`.

- [ ] **Step 1: Componente CoinStage**

```tsx
// src/components/play/random/stage/coin-stage.tsx
"use client";

import { useState } from "react";
import styles from "./stage.module.css";
import { buzz } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

// Cara: sol. Cruz: aspa con laurel. Misma familia visual que random-table-mark.
function HeadsFace() {
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="55" r="53" fill="var(--surface-3)" stroke="var(--border)" strokeWidth="3" />
      <circle cx="55" cy="55" r="18" fill="none" stroke="var(--gold-graphic)" strokeWidth="4" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={55 + 26 * Math.cos(a)}
            y1={55 + 26 * Math.sin(a)}
            x2={55 + 38 * Math.cos(a)}
            y2={55 + 38 * Math.sin(a)}
            stroke="var(--gold-graphic)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function TailsFace() {
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="55" r="53" fill="var(--surface-3)" stroke="var(--border)" strokeWidth="3" />
      <path
        d="M38 38 L72 72 M72 38 L38 72"
        stroke="var(--gold-graphic)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M30 78 Q55 92 80 78"
        fill="none"
        stroke="var(--gold-graphic)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Moneda 3D: varias revoluciones y cae del lado emitido. */
export function CoinStage({
  flip,
  resultText,
  onFlip,
  label,
}: {
  flip: { id: string; result: "heads" | "tails" } | null;
  resultText: string | null;
  onFlip: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const landed = flip !== null && (reduced || landedId === flip.id);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onFlip} className={styles.objectButton}>
        <span className={styles.coinScene}>
          <span
            key={flip?.id ?? "idle"}
            className={flip && !reduced ? `${styles.coinSpin} ${styles.coinFlip}` : styles.coinSpin}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && flip) {
                setLandedId(flip.id);
                buzz();
              }
            }}
          >
            <span
              className={styles.coin}
              style={flip?.result === "tails" ? { transform: "rotateX(180deg)" } : undefined}
            >
              <span className={styles.coinFace}>
                <HeadsFace />
              </span>
              <span className={`${styles.coinFace} ${styles.coinBack}`}>
                <TailsFace />
              </span>
            </span>
          </span>
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && flip ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="coin-result">
            {resultText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir coin-section**

Sustituir el contenido de `src/components/play/random/coin-section.tsx` por:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { flipCoin } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { CoinStage } from "./stage/coin-stage";

// La moneda no tiene configuración: el escenario ES la sección entera.
export function CoinSection({
  lastFlip,
  onEmit,
}: {
  lastFlip: RandomEvent | undefined;
  onEmit: (payload: { result: "heads" | "tails" }) => void;
}) {
  const t = useTranslations("play.random.coin");
  const last = lastFlip && lastFlip.type === "coin_flipped" ? lastFlip : null;

  return (
    <CoinStage
      flip={last ? { id: last.id, result: last.payload.result } : null}
      resultText={last ? t(last.payload.result) : null}
      onFlip={() => onEmit({ result: flipCoin() })}
      label={t("flip")}
    />
  );
}
```

El botón viejo desaparece; la moneda hereda su accessible name («Lanzar moneda») — el e2e sigue clicando lo mismo.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` — Expected: limpio.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/random/stage/coin-stage.tsx src/components/play/random/coin-section.tsx
git commit -m "feat(play): escenario de moneda -- flip 3D con caras de sol y aspa"
```

---

### Task 4: Ruleta de jugadores + revelados de orden y equipos

**Files:**
- Create: `src/components/play/random/stage/players-wheel.tsx`
- Create: `src/components/play/random/stage/order-reveal.tsx`
- Create: `src/components/play/random/stage/teams-reveal.tsx`
- Modify: `src/components/play/random/players-section.tsx`
- Modify: `messages/es.json` (clave `play.random.players.team`)
- Modify: `e2e/partidas-aleatorio.spec.ts` (test «jugadores», expects de orden/equipos)

**Interfaces:**
- Consumes: Task 1 (`buzz`, `stableColor`, `wheelSectors`, `wheelTargetAngle`, `useReducedMotion`), Task 2 (clases CSS).
- Produces: `PlayersWheel({ players: string[]; spin: { id: string; picked: string } | null; onSpin: () => void; label: string; disabled: boolean })` — pinta él mismo `data-testid="players-result"` cuando aterriza; `OrderReveal({ id: string; order: string[] })` y `TeamsReveal({ id: string; teams: string[][]; teamLabel: (n: number) => string })` — cada uno monta su propio `data-testid="players-result"`. La sección garantiza que solo UNO está montado a la vez.

- [ ] **Step 1: PlayersWheel**

```tsx
// src/components/play/random/stage/players-wheel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./stage.module.css";
import { buzz, wheelSectors, wheelTargetAngle } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

function polar(r: number, angle: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180; // 0° arriba, horario
  return { x: 100 + r * Math.cos(rad), y: 100 + r * Math.sin(rad) };
}

function sectorPath(start: number, end: number): string {
  const a = polar(96, start);
  const b = polar(96, end);
  const large = end - start > 180 ? 1 : 0;
  return `M 100 100 L ${a.x} ${a.y} A 96 96 0 ${large} 1 ${b.x} ${b.y} Z`;
}

/**
 * Ruleta de primer jugador. La rotación solo avanza (acumula vueltas) para que
 * cada giro sea hacia delante; el resultado ya está emitido y la rueda
 * decelera hasta dejarlo bajo la flecha. El nombre (players-result) aparece al
 * parar la transición.
 */
export function PlayersWheel({
  players,
  spin,
  onSpin,
  label,
  disabled,
}: {
  players: string[];
  spin: { id: string; picked: string } | null;
  onSpin: () => void;
  label: string;
  disabled: boolean;
}) {
  const reduced = useReducedMotion();
  const [rotation, setRotation] = useState(0);
  const [landedId, setLandedId] = useState<string | null>(null);
  const lastId = useRef<string | null>(null);

  const sectors = useMemo(() => (players.length >= 2 ? wheelSectors(players) : []), [players]);

  useEffect(() => {
    if (!spin || spin.id === lastId.current) return;
    lastId.current = spin.id;
    if (reduced || !players.includes(spin.picked)) {
      // Sin animación (o la lista ya cambió): resultado directo.
      setLandedId(spin.id);
      return;
    }
    setRotation((prev) => {
      const base = ((prev % 360) + 360) % 360;
      return prev - base + wheelTargetAngle(players, spin.picked, 4);
    });
  }, [spin, players, reduced]);

  const landed = spin !== null && (reduced || landedId === spin.id);

  return (
    <div className={styles.stage}>
      <button
        type="button"
        aria-label={label}
        onClick={onSpin}
        disabled={disabled}
        className={styles.objectButton}
      >
        <span className={styles.wheelWrap}>
          <span className={styles.wheelArrow} aria-hidden="true" />
          <svg
            viewBox="0 0 200 200"
            className={styles.wheel}
            style={{ transform: `rotate(${rotation}deg)` }}
            onTransitionEnd={() => {
              if (spin) {
                setLandedId(spin.id);
                buzz();
              }
            }}
            aria-hidden="true"
          >
            {sectors.length === 0 ? (
              <circle cx="100" cy="100" r="96" fill="var(--surface-muted)" stroke="var(--border)" />
            ) : (
              sectors.map((s) => (
                <g key={s.name}>
                  <path d={sectorPath(s.start, s.end)} fill={s.color} stroke="var(--surface)" />
                  {(() => {
                    const mid = (s.start + s.end) / 2;
                    const p = polar(62, mid);
                    return (
                      <text
                        x={p.x}
                        y={p.y}
                        fill="var(--surface)"
                        fontSize="12"
                        fontWeight="600"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid} ${p.x} ${p.y})`}
                      >
                        {s.name.length > 9 ? `${s.name.slice(0, 8)}…` : s.name}
                      </text>
                    );
                  })()}
                </g>
              ))
            )}
          </svg>
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && spin ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="players-result">
            {spin.picked}
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: OrderReveal y TeamsReveal**

```tsx
// src/components/play/random/stage/order-reveal.tsx
"use client";

import styles from "./stage.module.css";

/** Orden de juego en cascada numerada. `key` por id de evento re-lanza la animación. */
export function OrderReveal({ id, order }: { id: string; order: string[] }) {
  return (
    <ol key={id} data-testid="players-result" className="mt-4 space-y-1" aria-live="polite">
      {order.map((name, i) => (
        <li
          key={name}
          className={`${styles.reveal} text-[16px] font-semibold`}
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <span className="font-serif">{i + 1}.</span> {name}
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// src/components/play/random/stage/teams-reveal.tsx
"use client";

import styles from "./stage.module.css";
import { stableColor } from "./stage-helpers";

/** Equipos como tarjetas que se voltean, agrupadas y coloreadas por equipo. */
export function TeamsReveal({
  id,
  teams,
  teamLabel,
}: {
  id: string;
  teams: string[][];
  teamLabel: (n: number) => string;
}) {
  return (
    <div key={id} data-testid="players-result" className="mt-4 space-y-3" aria-live="polite">
      {teams.map((team, ti) => (
        <div key={ti}>
          <p
            className="text-[12px] font-semibold uppercase tracking-widest"
            style={{ color: `var(--play-seat-${(ti % 6) + 1})` }}
          >
            {teamLabel(ti + 1)}
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {team.map((name, ni) => (
              <li
                key={name}
                className={`${styles.card} rounded-chip border px-3 py-1 text-[14px] font-semibold`}
                style={{
                  borderColor: `var(--play-seat-${(ti % 6) + 1})`,
                  animationDelay: `${(ti * team.length + ni) * 100}ms`,
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

(`stableColor` queda importado solo si se usa; en TeamsReveal el color va por índice de equipo, no por nombre — eliminar el import si el linter lo marca como no usado.)

- [ ] **Step 3: Reescribir players-section**

Sustituir en `src/components/play/random/players-section.tsx`: el import de `describeRandomEvent` desaparece; entran los tres componentes de stage. El cuerpo cambia así (código completo del componente):

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { drawTeams, pickFirst, shuffle } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { PlayersWheel } from "./stage/players-wheel";
import { OrderReveal } from "./stage/order-reveal";
import { TeamsReveal } from "./stage/teams-reveal";

/**
 * Lista compartida de jugadores + tres sorteos. La ruleta ES el sorteo de
 * primer jugador (tap para girar); orden y equipos animan su revelado bajo
 * ella. Solo un players-result montado a la vez: la ruleta pinta el suyo si el
 * último sorteo es first_picked; si no, lo pinta el revelado correspondiente.
 */
export function PlayersSection({
  identity,
  players,
  lastResult,
  onSetPlayers,
  onFirst,
  onOrder,
  onTeams,
}: {
  identity: string;
  players: string[];
  lastResult: RandomEvent | undefined;
  onSetPlayers: (players: string[]) => void;
  onFirst: (players: string[], picked: string) => void;
  onOrder: (players: string[], order: string[]) => void;
  onTeams: (players: string[], teams: string[][]) => void;
}) {
  const t = useTranslations("play.random.players");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState("");

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed)) return;
    onSetPlayers([...players, trimmed]);
    setName("");
  }

  const chips = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const parsedTeams = Number(teamCount || "2");
  const teamsValid =
    Number.isInteger(parsedTeams) && parsedTeams >= 2 && parsedTeams <= players.length - 1;
  const canDraw = players.length >= 2;

  const spin =
    lastResult && lastResult.type === "first_picked"
      ? { id: lastResult.id, picked: lastResult.payload.picked }
      : null;

  return (
    <div>
      <PlayersWheel
        players={players}
        spin={spin}
        onSpin={() => onFirst(players, pickFirst(players))}
        label={t("first")}
        disabled={!canDraw}
      />

      {lastResult?.type === "order_drawn" ? (
        <OrderReveal id={lastResult.id} order={lastResult.payload.order} />
      ) : null}
      {lastResult?.type === "teams_drawn" ? (
        <TeamsReveal
          id={lastResult.id}
          teams={lastResult.payload.teams}
          teamLabel={(n) => t("team", { n })}
        />
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => add(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(name);
          }}
          aria-label={t("nameLabel")}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => add(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>

      {players.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onSetPlayers(players.filter((x) => x !== p))}
                aria-label={t("remove", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button
          type="button"
          disabled={!canDraw}
          onClick={() => onOrder(players, shuffle(players))}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("order")}
        </button>
        <label className="flex items-end gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={2}
            value={teamCount}
            placeholder="2"
            onChange={(e) => setTeamCount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("teamCount")}
            className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <button
            type="button"
            disabled={!canDraw || !teamsValid}
            onClick={() => onTeams(players, drawTeams(players, parsedTeams))}
            className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
          >
            {t("teams")}
          </button>
        </label>
      </div>
    </div>
  );
}
```

Ojo: el botón «Primer jugador» desaparece — la ruleta hereda su accessible name (`t("first")`), así el e2e sigue clicando lo mismo.

- [ ] **Step 4: Clave i18n `players.team`**

En `messages/es.json`, namespace `play.random.players` (junto a `"first"`), añadir:

```json
"team": "Equipo {n}",
```

- [ ] **Step 5: Ajustar e2e del test «jugadores»**

En `e2e/partidas-aleatorio.spec.ts`, el resultado de orden ya no dice «Orden:» (cascada numerada) ni el de equipos «Equipos:» (tarjetas con «Equipo N»). Sustituir las dos expects:

```ts
  await page.getByRole("button", { name: /^orden aleatorio$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("1.");

  await page.getByLabel("Número de equipos").fill("2");
  await page.getByRole("button", { name: /^equipos$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("Equipo 1");
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` — Expected: limpio.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 4 passed (el sorteo de primero tarda ~2,2 s en aterrizar; auto-wait de Playwright cubre).

- [ ] **Step 7: Commit**

```bash
git add src/components/play/random/stage/players-wheel.tsx src/components/play/random/stage/order-reveal.tsx src/components/play/random/stage/teams-reveal.tsx src/components/play/random/players-section.tsx messages/es.json e2e/partidas-aleatorio.spec.ts
git commit -m "feat(play): ruleta de primer jugador y revelados en cascada de orden y equipos"
```

---

### Task 5: Escenario de bolsa (sacudida + ficha + pilas)

**Files:**
- Create: `src/components/play/random/stage/bag-stage.tsx`
- Modify: `src/components/play/random/bag-section.tsx`

**Interfaces:**
- Consumes: Task 1 (`buzz`, `stableColor`, `useReducedMotion`), Task 2 (clases CSS).
- Produces: `BagStage({ drawn: { id: string; name: string } | null; onDraw: () => void; label: string; disabled: boolean })`; `TokenPile({ name, count })` exportado desde el mismo fichero para las filas de edición.

- [ ] **Step 1: Componente BagStage (+ TokenPile)**

```tsx
// src/components/play/random/stage/bag-stage.tsx
"use client";

import styles from "./stage.module.css";
import { buzz, stableColor } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

function BagSvg() {
  return (
    <svg viewBox="0 0 120 130" width="110" height="120" aria-hidden="true">
      <path
        d="M38 34 Q28 22 40 16 Q60 6 80 16 Q92 22 82 34"
        fill="none"
        stroke="var(--foreground-soft)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M36 36 Q18 62 22 92 Q26 122 60 124 Q94 122 98 92 Q102 62 84 36 Q60 44 36 36 Z"
        fill="var(--surface-3)"
        stroke="var(--foreground-soft)"
        strokeWidth="4"
      />
      <path d="M36 36 Q60 48 84 36" fill="none" stroke="var(--foreground-soft)" strokeWidth="3" />
      <circle cx="46" cy="40" r="3.5" fill="var(--foreground-soft)" />
      <circle cx="74" cy="40" r="3.5" fill="var(--foreground-soft)" />
    </svg>
  );
}

/**
 * Bolsa que se sacude al tocarla y suelta la ficha con rebote (la sacudida
 * dura 500 ms; la ficha entra con esos 500 ms de delay — coreografía en CSS,
 * ver .tokenPop). El resultado ya está emitido: puro teatro.
 */
export function BagStage({
  drawn,
  onDraw,
  label,
  disabled,
}: {
  drawn: { id: string; name: string } | null;
  onDraw: () => void;
  label: string;
  disabled: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <div className={styles.stage}>
      <button
        type="button"
        aria-label={label}
        onClick={onDraw}
        disabled={disabled}
        className={styles.objectButton}
      >
        <span
          key={drawn?.id ?? "idle"}
          className={drawn && !reduced ? styles.bagShake : undefined}
          style={{ display: "block" }}
        >
          <BagSvg />
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {drawn ? (
          <span
            key={drawn.id}
            className={`${styles.token} ${reduced ? "" : styles.tokenPop} font-serif text-[20px]`}
            style={{ background: stableColor(drawn.name) }}
            onAnimationEnd={buzz}
          >
            <span data-testid="bag-result">{drawn.name}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Pila de circulitos por tipo: hasta 8 puntos, más allá «×N». Count 0 = ×0 apagado. */
export function TokenPile({ name, count }: { name: string; count: number }) {
  if (count === 0) return <span className="text-muted-foreground">×0</span>;
  return (
    <span className={styles.pile} aria-label={`×${count}`}>
      {Array.from({ length: Math.min(count, 8) }, (_, i) => (
        <span key={i} className={styles.pileDot} style={{ background: stableColor(name) }} />
      ))}
      {count > 8 ? <span className="text-[12px] text-muted-foreground">×{count}</span> : null}
    </span>
  );
}
```

- [ ] **Step 2: Reescribir bag-section**

En `src/components/play/random/bag-section.tsx`: entra `import { BagStage, TokenPile } from "./stage/bag-stage";`, sale el botón «Sacar ficha» y el `<p data-testid="bag-result">` del final (los pinta el escenario). Cuerpo completo del return (la lógica de arriba — `alive()`, `addValid`, `addItem` — NO cambia):

```tsx
  const drawn = lastDrawn && lastDrawn.type === "bag_drawn" ? lastDrawn : null;

  return (
    <div>
      <BagStage
        drawn={drawn ? { id: drawn.id, name: drawn.payload.name } : null}
        onDraw={() => onDraw(drawFromBag(bag.items))}
        label={t("draw")}
        disabled={remaining === 0}
      />

      <div className="mt-4 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("itemName")}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={count}
          placeholder="1"
          onChange={(e) => setCount(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("itemCount")}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          disabled={!addValid}
          onClick={addItem}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("add")}
        </button>
      </div>

      {bag.items.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {bag.items.map((item) => (
            <li key={item.name} className="flex items-center justify-between text-[14px]">
              <span className="flex items-center gap-2">
                {item.name} <TokenPile name={item.name} count={item.count} />
              </span>
              <button
                type="button"
                onClick={() =>
                  onBagSet(alive().filter((i) => i.name !== item.name), bag.withReplacement)
                }
                aria-label={t("remove", { name: item.name })}
                className="rounded-chip border border-border px-2 py-0.5 text-[12px]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={bag.withReplacement}
          onChange={(e) => onBagSet(alive(), e.target.checked)}
        />
        {t("withReplacement")}
      </label>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-[13px] text-muted-foreground">{t("remaining", { n: remaining })}</span>
        <button
          type="button"
          disabled={bag.initial.length === 0}
          onClick={() => onBagSet(bag.initial.map((i) => ({ ...i })), bag.withReplacement)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
```

La bolsa hereda el accessible name «Sacar ficha» y el `disabled` real de `<button>` — el `toBeDisabled()` del e2e sigue funcionando sin tocar nada.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` — Expected: limpio.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/random/stage/bag-stage.tsx src/components/play/random/bag-section.tsx
git commit -m "feat(play): escenario de bolsa -- sacudida, ficha con rebote y pilas por tipo"
```

---

### Task 6: E2e de reduced motion, verificación completa y cierre documental

**Files:**
- Modify: `e2e/partidas-aleatorio.spec.ts` (test nuevo)
- Modify: `docs/requirements/decisiones.md` (append-only)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: rama verificada entera (tsc + unit + e2e + build).

- [ ] **Step 1: E2e de reduced motion**

Añadir al final de `e2e/partidas-aleatorio.spec.ts`:

```ts
test("con reduced motion el resultado aparece al instante", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/partidas/aleatorio");
  await page.getByRole("button", { name: "d6", exact: true }).click();
  // Sin teatro: nada de esperar los ~900 ms del cubo.
  await expect(page.getByTestId("dice-result")).toBeVisible({ timeout: 1500 });
});
```

- [ ] **Step 2: Verificación completa**

Run (en orden; todo debe salir verde):

```bash
npx tsc --noEmit
fnm exec --using=22 -- npx.cmd vitest run src/lib/play src/components/play
fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts
npm run build
```

Expected: tsc limpio; unit todos verdes (incluye los 8 de stage-helpers); e2e 5 passed; build OK.

- [ ] **Step 3: Entrada en decisiones.md (append-only, vía Bash heredoc)**

```bash
cat >> docs/requirements/decisiones.md << 'EOF'

## Aleatorio visual: la animación es teatro hacia un resultado ya emitido (2026-08-31)

Los escenarios animados del Aleatorio (cubo 3D, moneda, ruleta, bolsa) se montan
como capa de presentación pura: el azar se resuelve y se emite ANTES de animar,
y la animación coreografía hacia ese resultado (crash-safe; el feed va por
delante del teatro ~1 s, asumido). Se descartó emitir al terminar la animación
(estado «pending» nuevo en el motor, tiradas perdibles al cerrar) y las librerías
de animación (+30 kB para lo que CSS 3D ya hace). El azar visual de relleno vive
en los componentes, jamás en el reducer. Spec:
docs/superpowers/specs/2026-08-31-play-randomizer-visual-design.md
EOF
```

- [ ] **Step 4: Commit final**

```bash
git add e2e/partidas-aleatorio.spec.ts docs/requirements/decisiones.md
git commit -m "test(play): e2e de reduced motion y acta del teatro determinista del Aleatorio"
```
