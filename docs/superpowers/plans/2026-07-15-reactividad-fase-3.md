# Reactividad Fase 3 — Capa optimista

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Respuesta instantánea en microacciones frecuentes con `useOptimistic` + rollback en error, ENCIMA de la revalidación (nunca en su lugar). Disciplina B: solo donde aporta.

**Architecture:** Un hook cliente reutilizable `useOptimisticAction` (sobre `useOptimistic` + `useTransition`) pinta el cambio al instante y, como el estado real (props revalidadas) no cambia en error, revierte solo. La lógica por-feature vive en **reducers puros** en `.ts` (unit-testeables en node — el runner es node-only, sin jsdom), y el componente los cablea.

**Tech Stack:** Next.js 16.2.10, React 19.2 (`useOptimistic`), Supabase, next-intl, Vitest 4 (node), Playwright.

## Global Constraints

- **Node 22** para tests (`fnm use 22`). Ver memoria `node-y-vitest`.
- **El optimismo va ENCIMA de la revalidación.** Cada microacción sigue llamando a su server action (que revalida, Fase 0+1); el optimismo solo adelanta el pintado. Sin revalidación, la verdad y lo optimista divergen.
- **Sin jsdom.** No se testea el hook con testing-library (no está y montarlo es fuera de alcance). Se testean los **reducers puros** en `.ts`. El comportamiento optimista se cubre con E2E (que confirma "se refleja sin recargar" y que persiste).
- **Disciplina B — solo donde aporta.** Se aplica a superficies que HOY no tienen optimismo (round-trip visible): `FollowButton`, `ReviewInteractions`, favorito de `LibraryItemCard`.
  - **NO se tocan** (ya optimistas): voto de encuesta en `ClubPostCard` (ya tiene rollback) y `EpisodeItem` (visto, ya pinta al instante). Convertirlos sería churn sin ganancia de comportamiento. Desviación consciente del listado del spec, justificada.
  - **Diferido:** `confirmCheckpoint` (subárbol profundo de club, baja frecuencia) — follow-up si se quiere.
- **Comentarios y copy en español.**

---

### Task 1: Hook `useOptimisticAction`

**Files:**
- Create: `src/lib/reactivity/use-optimistic-action.ts`

- [ ] **Step 1: Implementar**
  ```ts
  "use client";
  import { useOptimistic, useState, useTransition } from "react";

  // Capa de "sensación": pinta el cambio al instante y deja que la capa de
  // verdad (revalidación del server action) reconcilie debajo. En error, el
  // estado real (props) no cambió, así que useOptimistic revierte solo (rollback).
  // El reducer es puro y se testea aparte; el hook es glue.
  export function useOptimisticAction<TState, TAction>({
    state,
    reducer,
  }: {
    state: TState;
    reducer: (state: TState, action: TAction) => TState;
  }): {
    state: TState;
    isPending: boolean;
    failed: boolean;
    run: (action: TAction, mutate: () => Promise<void>) => void;
  } {
    const [optimisticState, applyOptimistic] = useOptimistic(state, reducer);
    const [isPending, startTransition] = useTransition();
    const [failed, setFailed] = useState(false);

    function run(action: TAction, mutate: () => Promise<void>) {
      setFailed(false);
      startTransition(async () => {
        applyOptimistic(action);
        try {
          await mutate();
        } catch {
          setFailed(true);
        }
      });
    }

    return { state: optimisticState, isPending, failed, run };
  }
  ```

- [ ] **Step 2: Tipos/lint** — `fnm use 22 && npx tsc --noEmit && npx eslint src/lib/reactivity/use-optimistic-action.ts`.
- [ ] **Step 3: Commit** — `feat(reactivity): hook useOptimisticAction (optimista + rollback)`.

---

### Task 2: `FollowButton` optimista

**Files:**
- Create: `src/lib/social/follow-optimistic.ts` (reducer puro + test)
- Create: `src/lib/social/follow-optimistic.test.ts`
- Modify: `src/components/social/follow-button.tsx`

- [ ] **Step 1 (TDD): reducer + test**
  Reducer sobre `FollowState` (`none|pending|accepted|self`). Acción: `{ type: "toggle"; targetIsPublic: boolean }`.
  - Desde `accepted` o `pending` → `none` (dejar de seguir / cancelar solicitud).
  - Desde `none` → `accepted` si público, `pending` si privado.
  Test: las 3 transiciones + que `self` no se toca.

- [ ] **Step 2: cablear el componente**
  Usar `useOptimisticAction({ state, reducer })`. El label se deriva del `state` optimista. `onClick` → `run({ type:"toggle", targetIsPublic }, () => state==="none" ? followUser(id) : unfollowUser(id))`. Botones deshabilitados con `isPending`. (El estado real llega por props revalidadas; el optimista solo adelanta.)

- [ ] **Step 3: tsc/lint + commit** — `feat(social): FollowButton optimista`.

---

### Task 3: `ReviewInteractions` optimista (likes + comentarios)

**Files:**
- Create: `src/lib/social/interaction-optimistic.ts` (reducer puro + test)
- Create: `src/lib/social/interaction-optimistic.test.ts`
- Modify: `src/components/social/review-interactions.tsx`

- [ ] **Step 1 (TDD): reducer + test**
  Estado compuesto: `{ reactionCount, viewerReacted, commentCount, comments }`.
  Acciones:
  - `toggleTarget` → flip `viewerReacted`, `reactionCount ±1`.
  - `toggleComment(id)` → en ese comentario, flip `viewerReacted`, `reactionCount ±1`.
  - `addComment(body)` → append un comentario optimista (id temporal, `author` = t("you") lo pone el componente vía payload, `viewerReacted:false`, `reactionCount:0`, `isOwn:true`), `commentCount +1`.
  - `deleteComment(id)` → quitar de `comments`, `commentCount -1`.
  Test: cada acción sobre un estado base (incluye ida y vuelta del toggle, y que `commentCount` no sale de `comments.length` porque están capados).

- [ ] **Step 2: cablear el componente**
  - Base = `{ reactionCount, viewerReacted, commentCount, comments }` desde props.
  - `useOptimisticAction({ state: base, reducer })`; render desde `state` optimista.
  - Like target: `run({type:"toggleTarget"}, () => toggleReaction(targetType, targetId))`.
  - Like comentario: `run({type:"toggleComment", id:c.id}, () => toggleReaction("comment", c.id))`.
  - Añadir: `run({type:"addComment", body:value, author:t("you")}, () => addComment(targetType, targetId, value))`. El comentario optimista muestra "Tú" hasta que la revalidación trae el real (con id/autor reales) y useOptimistic lo sustituye.
  - Borrar: `run({type:"deleteComment", id:c.id}, () => deleteComment(c.id))`.
  - Añadir `you` a `messages/*.json` (namespace `social`) si no existe.

- [ ] **Step 3: tsc/lint + commit** — `feat(social): likes y comentarios optimistas`.

---

### Task 4: Favorito optimista en `LibraryItemCard`

**Files:**
- Modify: `src/components/library/library-item-card.tsx`

- [ ] **Step 1: cablear**
  Estado optimista booleano de "fijado" (deriva de `item.pinnedOrder !== null`). Reducer trivial: `toggle` → `!pinned` (inline; sin fichero aparte). `run("toggle", async () => { const r = await toggleFavorite(item.entryId); if (r.error) throw new Error(); })` — `toggleFavorite` devuelve `{error}`, se convierte a throw para el rollback del hook. El label pin/unpin y el icono derivan del estado optimista; `failed` pinta el error existente.

- [ ] **Step 2: tsc/lint + commit** — `feat(library): favorito optimista`.

---

### Task 5: E2E

**Files:**
- Create/extender: `e2e/social-optimista.spec.ts` (o extender uno existente)

- [ ] **Step 1: cubrir sin recargar**
  - Dar/quitar like a una reseña → el corazón y el contador cambian sin recargar y **persisten** (recargar y sigue).
  - Escribir un comentario → aparece sin recargar; recargar y sigue.
  - (El timing optimista puro es difícil de aseverar en E2E; se asegura "se refleja + persiste", que es lo que importa.)
  Reusar helpers de login/seed de los specs existentes. Autolimpieza (borrar el comentario / quitar el like).

- [ ] **Step 2: correr** — `fnm use 22 && npx playwright test e2e/social-optimista.spec.ts`.
- [ ] **Step 3: commit**.

---

### Task 6: Verificación + docs + memoria

- [ ] **Step 1: Suite** — `fnm use 22 && npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`.
- [ ] **Step 2: E2E completa** — `fnm use 22 && npx playwright test` (anotar el fallo preexistente de `propose-wizard` si sigue).
- [ ] **Step 3: `docs/reactividad.md`** — pasar la microacción de "Fase 3 (futuro)" a presente: `useOptimisticAction` existe; documentar la firma y que va ENCIMA de la revalidación; nota de que voto/episodio ya eran optimistas.
- [ ] **Step 4: commits + memoria** (controlador, tras review): `reactividad-consistente.md` Fase 3 completada en PR #NN; iniciativa cerrada.

---

## Self-Review

- **Cobertura del spec (Fase 3):** hook reutilizable ✓ (Task 1); likes/reacciones incl. comentarios ✓ (Task 3); follows ✓ (Task 2); alta/borrado de comentario ✓ (Task 3); toggle favorito ✓ (Task 4).
- **Desviación consciente:** voto de encuesta y "episodio visto" NO se convierten — ya son optimistas (el voto con rollback); convertirlos sería churn sin ganancia. `confirmCheckpoint` diferido (baja frecuencia, subárbol profundo). Señalado para revisión.
- **Testing:** reducers puros unit-testeados (node); comportamiento por E2E. El hook (glue) no se unit-testea por falta de jsdom — decisión explícita, no olvido.
- **Riesgo:** que un comentario optimista con id temporal no se sustituya limpio por el real. Mitigación: useOptimistic revierte al `comments` de props al asentar la transición (que ya incluye el real vía revalidación); el E2E de Task 5 confirma persistencia.
