# Notas desde el cronómetro de portada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder capturar notas/citas mientras corre el cronómetro rápido de
la tarjeta de portada, sin duplicar UI de composición — un enlace a la hoja
completa que no para el reloj compartido.

**Architecture:** `BookTimer` (`today-actions.tsx`) gana un tercer botón
"+ Nota" que navega a `sessionHref` sin `clearTimer` ni `?minutos=`.
`BookProgressField` deja de arrancar el modo de duración fijo en
`"manual"` — lo deriva de si ya hay cronómetro con tiempo para ese pase
(`useTimerState`, hidratación-segura).

**Tech Stack:** Next.js App Router, TypeScript, next-intl.

## Global Constraints

- No leer `localStorage` directamente en un inicializador de `useState` —
  desincroniza servidor/cliente. Usar `useTimerState` (ya existe,
  `useSyncExternalStore`).
- `SessionNotebook` no se toca — ya es hermano de `BookProgressField`, no
  depende del modo de duración.
- Spec de referencia: `docs/superpowers/specs/2026-07-29-notas-desde-cronometro-portada-design.md`.

---

### Task 1: Botón "+ Nota" en el cronómetro de portada

**Files:**
- Modify: `src/components/stats/today-actions.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `TodayActionsLabels` (ya existe) — gana el campo `timerNotes`.

- [ ] **Step 1: Ampliar `TodayActionsLabels` y el botón**

En `src/components/stats/today-actions.tsx`, añadir el campo al tipo
(línea ~27-34):

```typescript
export type TodayActionsLabels = {
  session: string;
  log: string;
  cancel: string;
  register: string;
  notes: string;
  timerLabel: string;
  nextEpisode: string | null;
};
```

En `BookTimer` (línea ~189-215), insertar el nuevo botón entre "Cancelar"
y "Registrar":

```tsx
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => clearTimer(passId)}
          className="flex-1 rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
        >
          {labels.cancel}
        </button>
        {/* Sin clearTimer ni ?minutos=: navegación pura. El reloj compartido
            (misma clave de localStorage que la hoja de sesión, ver timer.ts)
            sigue corriendo al llegar — BookProgressField lo detecta y abre
            ya en pestaña Cronómetro (Tarea 2). */}
        <Link
          href={sessionHref}
          className="flex flex-1 items-center justify-center rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
        >
          {labels.notes}
        </Link>
        <button
          type="button"
          onClick={() => {
```

(el resto del botón "Registrar" no cambia).

`Link` ya está importado (línea 5) — no hace falta nuevo import.

- [ ] **Step 2: Pasar la nueva etiqueta desde `today-card.tsx`**

En `src/components/stats/today-card.tsx:151-156`, dentro del objeto
`labels` que se pasa a `TodayActions`, añadir la línea `notes`:

```typescript
          session: t("session"),
          log: t("log"),
          cancel: t("timerCancel"),
          register: t("timerRegister"),
          notes: t("timerNotes"),
          timerLabel: t("timerLabel"),
          nextEpisode: nextEpisode
```

- [ ] **Step 3: Traducción**

En `messages/es.json`, junto a `"timerCancel"`/`"timerRegister"` (bajo el
namespace `today`, líneas ~137-139):

```json
    "timerNotes": "+ Nota",
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/stats/today-actions.tsx messages/es.json
# + el fichero de today-card.tsx que se haya tocado en el Step 2
git commit -m "feat(sesiones): boton + Nota en el cronometro de portada"
```

---

### Task 2: `BookProgressField` abre en modo Cronómetro si ya hay reloj corriendo

**Files:**
- Modify: `src/components/session/book-progress-field.tsx`

**Interfaces:**
- Consumes: `useTimerState(passId)` + `hasTime` (ya existen,
  `src/lib/sessions/use-timer-state.ts`).

- [ ] **Step 1: Importar y derivar el modo**

En `src/components/session/book-progress-field.tsx`, añadir el import:

```typescript
import { hasTime, useTimerState } from "@/lib/sessions/use-timer-state";
```

Sustituir (línea 58):

```typescript
  const [durationMode, setDurationMode] = useState<"manual" | "timer">("manual");
```

por:

```typescript
  // No fijo en "manual": si ya hay cronómetro con tiempo para este pase
  // (arrancado desde la tarjeta de portada, misma clave de localStorage),
  // la hoja abre directo en pestaña Cronómetro — "sigue en vivo" tiene que
  // VERSE, no solo persistir en el estado. useTimerState, no una lectura
  // directa de localStorage: esto último desincroniza servidor/cliente en
  // el primer render (el servidor no tiene localStorage).
  const timerState = useTimerState(passId);
  const [durationModeOverride, setDurationModeOverride] = useState<
    "manual" | "timer" | null
  >(null);
  const durationMode = durationModeOverride ?? (hasTime(timerState) ? "timer" : "manual");
```

- [ ] **Step 2: El clic manual en las pestañas manda siempre**

Buscar `onClick={() => setDurationMode(mode)}` (línea ~174, dentro del
`.map` de las pestañas Manual/Cronómetro) y cambiarlo a:

```tsx
              onClick={() => setDurationModeOverride(mode)}
```

Una vez el usuario toca la pestaña a mano, su elección manda siempre —
incluso si hay cronómetro corriendo, no se le pisa la elección explícita
en renders posteriores.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/session/book-progress-field.tsx
git commit -m "feat(sesiones): la hoja abre en modo cronometro si ya hay uno corriendo"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` limpio
- [ ] `npm test` sin regresiones (763 tests previos)
- [ ] `npm run lint` limpio en ficheros tocados
- [ ] QA manual en navegador real: arrancar cronómetro en portada, esperar
      unos segundos, pulsar "+ Nota", confirmar que la hoja abre con el
      reloj YA corriendo (no en 00:00:00, no en modo manual) desde el
      tiempo acumulado real, y que se puede guardar una nota de inmediato
      con `SessionNotebook`. Confirmar también que "Cancelar" y
      "Registrar" siguen igual que antes.
