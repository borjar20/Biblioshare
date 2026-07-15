# Reactividad Fase 0+1 — Fundación + barrido de correctitud

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la revalidación en helpers por entidad y añadir la revalidación que falta (clubs), de forma que toda mutación se refleje sin recargar.

**Architecture:** Un módulo servidor `src/lib/reactivity/revalidate.ts` es la única fuente de verdad de "qué rutas afecta mutar X". Todas las server actions dejan de llamar a `revalidatePath` directamente y pasan por sus helpers. Se añade cobertura de `/club/[slug]` a las acciones de club (hoy sin revalidación) y a las reacciones/comentarios sobre posts de club.

**Tech Stack:** Next.js 16.2.10 (App Router, modelo de caché *anterior* — sin `cacheComponents`), React 19.2, Supabase, next-intl, Vitest 4, Playwright.

## Global Constraints

- **Node 22 para el runner de tests.** El shell arranca en Node 20.9; hay que activar fnm Node 22 antes de `vitest`/`playwright` (`fnm use 22` o el `.nvmrc` del repo). Ver memoria `node-y-vitest`.
- **Sin `revalidateTag`/`use cache`/Cache Components.** El proyecto usa el modelo de caché anterior; las lecturas son dinámicas, por-usuario y con RLS. Solo `revalidatePath`.
- **AGENTS.md:** "This is NOT the Next.js you know." Consultar `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` antes de tocar semántica de revalidación.
- **La barrida es behavior-preserving.** Centralizar las llamadas actuales *verbatim* (mismas rutas). Añadir rutas nuevas SOLO donde hay bug evidenciado (clubs). Nada de rutas especulativas.
- **Comentarios y copy en español**, siguiendo el estilo del código existente.

---

### Task 1: Módulo de helpers de revalidación (`revalidate.ts`)

**Files:**
- Create: `src/lib/reactivity/revalidate.ts`
- Test: `src/lib/reactivity/revalidate.test.ts`

**Interfaces:**
- Consumes: `itemHref`, `sagaHref` de `@/lib/catalog/item-href`; `ItemType` de `@/lib/catalog/types`.
- Produces (usados por Tasks 3–5):
  - `revalidateFeed(): void`
  - `revalidateItemPage(itemType: ItemType, id: string): void`
  - `revalidateAllItemPages(): void`
  - `revalidateProfilePages(): void`
  - `revalidateProfile(username: string): void`
  - `revalidateLibrary(): void`
  - `revalidateSagaPage(id: string): void`
  - `revalidateClubPages(): void`
  - `revalidateReadingLog(itemType: ItemType, id: string): void`
  - `revalidateInteraction(): void`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/reactivity/revalidate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de next/cache: capturamos cada llamada a revalidatePath.
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import {
  revalidateFeed,
  revalidateItemPage,
  revalidateAllItemPages,
  revalidateProfilePages,
  revalidateProfile,
  revalidateLibrary,
  revalidateSagaPage,
  revalidateClubPages,
  revalidateReadingLog,
  revalidateInteraction,
} from "./revalidate";

beforeEach(() => revalidatePath.mockClear());

// Todas las rutas (path + type) que un helper pidió revalidar.
function calls() {
  return revalidatePath.mock.calls.map((c) => c.join(" "));
}

describe("revalidate helpers", () => {
  it("revalidateFeed revalida el feed de inicio", () => {
    revalidateFeed();
    expect(calls()).toEqual(["/"]);
  });

  it("revalidateItemPage usa la ruta literal del item", () => {
    revalidateItemPage("book", "abc");
    expect(calls()).toEqual(["/libro/abc"]);
  });

  it("revalidateAllItemPages cubre libro, pelicula y serie como page pattern", () => {
    revalidateAllItemPages();
    expect(calls()).toEqual([
      "/libro/[id] page",
      "/pelicula/[id] page",
      "/serie/[id] page",
    ]);
  });

  it("revalidateProfile usa la ruta literal del usuario", () => {
    revalidateProfile("borja");
    expect(calls()).toEqual(["/u/borja"]);
  });

  it("revalidateClubPages cubre ficha de club, actividad y listado", () => {
    revalidateClubPages();
    expect(calls()).toEqual([
      "/club/[slug] page",
      "/club/[slug]/actividad/[id] page",
      "/clubes",
    ]);
  });

  it("revalidateReadingLog toca ficha + perfiles + feed", () => {
    revalidateReadingLog("movie", "xyz");
    expect(calls()).toEqual(["/pelicula/xyz", "/u/[username] page", "/"]);
  });

  it("revalidateInteraction incluye las fichas de club (bug arreglado)", () => {
    revalidateInteraction();
    expect(calls()).toEqual([
      "/libro/[id] page",
      "/pelicula/[id] page",
      "/serie/[id] page",
      "/",
      "/club/[slug] page",
      "/club/[slug]/actividad/[id] page",
      "/clubes",
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `fnm use 22 && npx vitest run src/lib/reactivity/revalidate.test.ts`
Expected: FAIL — `Cannot find module './revalidate'`.

- [ ] **Step 3: Implementar el módulo**

`src/lib/reactivity/revalidate.ts`:

```ts
import "server-only";
import { revalidatePath } from "next/cache";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";

// Única fuente de verdad de "qué rutas afecta mutar X". Toda server action
// revalida a través de estos helpers en vez de llamar a revalidatePath suelto,
// para que "olvidar una ruta" deje de ser posible. Modelo de caché anterior
// (sin cacheComponents): revalidatePath basta y actualiza la UI al momento si
// estás viendo la ruta afectada.

// --- Primitivas de ruta (una por zona de la app) ---

/** Feed de inicio. */
export function revalidateFeed(): void {
  revalidatePath("/");
}

/** La ficha concreta de un item (p.ej. /libro/123). */
export function revalidateItemPage(itemType: ItemType, id: string): void {
  revalidatePath(itemHref(itemType, id));
}

/** Las tres fichas como patrón dinámico: cuando no se sabe el tipo (p.ej. una
 *  reseña puede vivir en cualquiera). */
export function revalidateAllItemPages(): void {
  revalidatePath("/libro/[id]", "page");
  revalidatePath("/pelicula/[id]", "page");
  revalidatePath("/serie/[id]", "page");
}

/** Todos los perfiles (patrón dinámico): cuando no se conoce el username. */
export function revalidateProfilePages(): void {
  revalidatePath("/u/[username]", "page");
}

/** Un perfil concreto. */
export function revalidateProfile(username: string): void {
  revalidatePath(`/u/${username}`);
}

/** La colección/biblioteca del usuario. */
export function revalidateLibrary(): void {
  revalidatePath("/coleccion");
}

/** La ficha de una saga concreta. */
export function revalidateSagaPage(id: string): void {
  revalidatePath(sagaHref(id));
}

/** Fichas de club + sus actividades + el listado. Las acciones de club manejan
 *  clubId, no slug, así que se usa el patrón dinámico "/club/[slug]" en vez de
 *  la ruta literal. */
export function revalidateClubPages(): void {
  revalidatePath("/club/[slug]", "page");
  revalidatePath("/club/[slug]/actividad/[id]", "page");
  revalidatePath("/clubes");
}

// --- Helpers compuestos por forma de mutación ---

/** Registro de lectura (pase, sesión, episodio visto): ficha + perfiles + feed. */
export function revalidateReadingLog(itemType: ItemType, id: string): void {
  revalidateItemPage(itemType, id);
  revalidateProfilePages();
  revalidateFeed();
}

/** Reacción/comentario: puede vivir en una ficha, en el feed o en un post de
 *  club — por eso revalida las tres zonas. La inclusión de las fichas de club
 *  es el arreglo del bug: antes un like a un post de club nunca revalidaba
 *  /club/[slug]. */
export function revalidateInteraction(): void {
  revalidateAllItemPages();
  revalidateFeed();
  revalidateClubPages();
}
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `fnm use 22 && npx vitest run src/lib/reactivity/revalidate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reactivity/revalidate.ts src/lib/reactivity/revalidate.test.ts
git commit -m "feat(reactivity): helpers centralizados de revalidacion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Enrutar reacciones/comentarios y arreglar `/club/[slug]`

**Files:**
- Modify: `src/lib/social/interaction-actions.ts:14-23` (la función `revalidateItemPages`)

**Interfaces:**
- Consumes: `revalidateInteraction` de `@/lib/reactivity/revalidate` (Task 1).

- [ ] **Step 1: Reemplazar la función local por el helper**

En `src/lib/social/interaction-actions.ts`, borrar la función `revalidateItemPages` (líneas 14–23) y su import implícito de `revalidatePath`, y sustituir sus 3 usos (`toggleReaction`, `addComment`, `deleteComment`) por `revalidateInteraction()`.

Añadir al principio del fichero:

```ts
import { revalidateInteraction } from "@/lib/reactivity/revalidate";
```

Quitar `import { revalidatePath } from "next/cache";` si ya no se usa en el fichero.

Cada `revalidateItemPages();` pasa a ser `revalidateInteraction();`.

- [ ] **Step 2: Verificar tipos y lint**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/lib/social/interaction-actions.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/interaction-actions.ts
git commit -m "fix(social): las reacciones/comentarios revalidan tambien /club/[slug]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Revalidación en las acciones de club (nuevo comportamiento)

**Files:**
- Modify: `src/lib/clubs/posts.ts` (createTextPost, createShareActivityPost, createPoll, votePoll, deletePost)
- Modify: `src/lib/clubs/membership.ts` (joinClub, leaveClub, inviteMember, acceptInvite, declineInvite, removeMember, setMemberRole, transferOwnership)
- Modify: `src/lib/clubs/join-requests.ts` (requestJoinClub, withdrawJoinRequest, approveJoinRequest, rejectJoinRequest)
- Modify: `src/lib/clubs/clubs.ts` (createClub, updateClub)
- Modify: `src/lib/clubs/activities/core.ts` (proposeActivity, updateActivityConfig, activateActivity, finishActivity, archiveActivity, joinActivity, leaveActivity, addActivityItem, removeActivityItem, addOpinion)
- Modify: `src/lib/clubs/activities/checkpoints.ts` (createCheckpoint, updateCheckpoint, deleteCheckpoint, reorderCheckpoints, confirmCheckpoint)
- Modify: `src/lib/clubs/activities/tierlist.ts` (setPlacement, clearPlacement)
- Modify: `src/lib/clubs/activities/list-challenge.ts` (setCompletionMode)
- Modify: `src/lib/clubs/activities/propose.ts` (proposeActivityWithSetup)

**Interfaces:**
- Consumes: `revalidateClubPages` de `@/lib/reactivity/revalidate` (Task 1).

> **Contexto:** hoy ninguna de estas acciones revalida. Aun así, muchas de sus
> vistas usan estado local (se convergen en la Fase 2), así que el efecto
> visible completo llega con la Fase 2 — pero añadir la revalidación aquí es
> correcto (arregla navegar-fuera-y-volver y cualquier subvista de club que ya
> derive de props de servidor) y es la base sobre la que se apoya la Fase 2.

- [ ] **Step 1: Añadir el import y la llamada en cada acción mutadora**

En cada fichero de la lista, añadir el import:

```ts
import { revalidateClubPages } from "@/lib/reactivity/revalidate";
```

y llamar a `revalidateClubPages();` como última sentencia de cada función mutadora listada (justo antes de retornar / al final del cuerpo, tras el `if (error) throw error;`). Ejemplo en `createTextPost`:

```ts
export async function createTextPost(clubId: string, body: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("body_required");
  if (trimmed.length > MAX_BODY_LENGTH) throw new Error("body_too_long");

  const { error } = await supabase
    .from("club_posts")
    .insert({ club_id: clubId, author_id: userId, kind: "text", body: trimmed });
  if (error) throw error;

  await notifyNewPost(supabase, clubId, userId);
  revalidateClubPages();
}
```

Aplicar el mismo patrón (añadir `revalidateClubPages();` al final del cuerpo, después de la última operación que muta) a TODAS las funciones listadas en **Files**. No tocar las funciones de solo lectura (getClub, listMembers, listClubPosts, listClubActivities, getActivity, etc.).

- [ ] **Step 2: Verificar tipos y lint**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/lib/clubs`
Expected: sin errores.

- [ ] **Step 3: E2E existente de club sigue verde**

Run: `fnm use 22 && npx playwright test e2e/club-join-request.spec.ts`
Expected: PASS (la revalidación añadida no rompe el flujo de solicitud de ingreso).

- [ ] **Step 4: Commit**

```bash
git add src/lib/clubs
git commit -m "fix(clubs): las mutaciones de club revalidan /club/[slug] y /clubes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Enrutar el resto de acciones server-authoritative (refactor sin cambio de comportamiento)

**Files:** (sustituir las llamadas `revalidatePath` actuales por helpers, *mismas rutas*)
- Modify: `src/lib/sessions/actions.ts:29-31` → `revalidateReadingLog(itemType, itemId)`
- Modify: `src/lib/passes/actions.ts:20-22` → `revalidateReadingLog(itemType, itemId)`
- Modify: `src/lib/series/episode-actions.ts:16-18` → `revalidateReadingLog("series", seriesId)`
- Modify: `src/lib/library/manage-actions.ts:19-21` → `revalidateReadingLog(itemType, itemId)`; línea 146 → `revalidateLibrary()`
- Modify: `src/lib/library/favorite-actions.ts:81-82` → `revalidateLibrary()` + `revalidateProfilePages()`
- Modify: `src/lib/library/add-existing-item.ts:45` → `revalidateItemPage(itemType, itemId)`
- Modify: `src/lib/catalog/edit-actions.ts:185,240,298,345,374` → `revalidateItemPage(...)`
- Modify: `src/lib/editions/actions.ts:70` → `revalidateItemPage(itemType, itemId)`
- Modify: `src/lib/sagas/manage-saga-actions.ts:81-82,104` → `revalidateItemPage(itemType, itemId)` + `revalidateSagaPage(sagaId)`
- Modify: `src/lib/social/actions.ts:16` → `revalidateProfilePages()`
- Modify: `src/lib/challenges/actions.ts:84,110,133,150` → `revalidateProfilePages()`
- Modify: `src/lib/profile/actions.ts:46,96` → `revalidateProfile(username)` / `revalidateFeed()`
- Modify: `src/app/coleccion/actions.ts:34,83,109,129` → `revalidateLibrary()`
- Modify: `src/app/u/[username]/actions.ts:27` → `revalidateProfile(username)`
- Modify: `src/app/admin/actions.ts:38` → dejar `revalidatePath("/admin")` (sin helper: ruta única, no reutilizada — no aporta centralizar)
- Modify: `src/app/importar/actions.ts:228,246` → dejar `revalidatePath("/importar/pendientes")` (igual: ruta única)
- Modify: `src/app/buscar/actions.ts:74` → dejar `revalidatePath("/buscar")` (ruta única)
- Modify: `src/lib/social/notification-actions.ts:23` → dejar `revalidatePath("/", "layout")` (revalida el layout completo por el badge de notificaciones; semántica distinta de `revalidateFeed`, no tocar)

> **Principio:** esto es refactor mecánico *sin cambiar rutas*. Cada helper
> produce exactamente las mismas rutas que la llamada que sustituye (ver los
> tests de Task 1). Las rutas únicas y no reutilizadas (/admin, /buscar,
> /importar/pendientes, y el "/" layout de notificaciones) se dejan como están:
> centralizarlas no aporta y añadiría helpers de un solo uso.

- [ ] **Step 1: Sustituir en cada fichero**

Para cada fichero de la lista, añadir el import de los helpers usados desde `@/lib/reactivity/revalidate` y reemplazar el bloque de `revalidatePath` por la llamada al helper indicada. Quitar `import { revalidatePath } from "next/cache"` de los ficheros donde ya no quede ningún uso directo. Ejemplo (`src/lib/passes/actions.ts`):

```ts
// antes:
//   revalidatePath(itemHref(itemType, itemId));
//   revalidatePath("/u/[username]", "page");
//   revalidatePath("/");
// después:
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";
// ...
revalidateReadingLog(itemType, itemId);
```

Verificar en cada fichero que las rutas del helper coinciden con las que había (si no coinciden, NO cambiar el comportamiento: usar las primitivas sueltas para reproducir exactamente las rutas anteriores).

- [ ] **Step 2: Verificar tipos y lint de todo lo tocado**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib src/app
git commit -m "refactor(reactivity): enrutar revalidaciones por helpers centralizados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Documento de convención de reactividad

**Files:**
- Create: `docs/reactividad.md`

- [ ] **Step 1: Escribir la convención**

`docs/reactividad.md`:

```markdown
# Convención de reactividad

Dos capas separadas:

1. **Verdad (servidor).** Toda server action mutadora revalida vía los helpers
   de `src/lib/reactivity/revalidate.ts`. Nunca llames a `revalidatePath`
   directo desde una action salvo rutas únicas no reutilizadas (p.ej. /admin).
   Si una mutación afecta a una zona nueva, añade/usa un helper — no dupliques
   rutas por el código.
2. **Sensación (cliente).** `useOptimistic` (vía el hook de Fase 3) para
   microacciones frecuentes; la capa de verdad reconcilia debajo. El optimismo
   va ENCIMA de la revalidación, nunca en su lugar.

## Cómo obtener datos y reflejar cambios

- **Vista no paginada:** deriva de props del servidor. Con la revalidación
  correcta, se actualiza sola tras la acción.
- **Vista paginada (feed con "cargar más"):** estado local sembrado del
  servidor; reconcilia la primera página con `router.refresh()`/re-fetch tras
  CADA mutación. No dejes ninguna mutación sin su refresco.
- **Microacción (like, follow, voto, comentario):** `useOptimisticAction`
  (Fase 3) para respuesta instantánea + rollback en error.

## Modelo de caché

El proyecto usa el modelo anterior (sin `cacheComponents`). `revalidatePath` es
el primitivo correcto: lecturas dinámicas, por-usuario, con RLS. No introducir
`revalidateTag`/`use cache`/Cache Components (cachearía datos por-usuario).
```

- [ ] **Step 2: Commit**

```bash
git add docs/reactividad.md
git commit -m "docs: convencion de reactividad

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Revertir la preferencia de testing del repo a E2E automático

**Files:**
- Modify: `docs/TESTING.md`
- Modify: `.claude/agents/qa-verifier.md` (si existe la guía de "default manual")
- Modify: `.claude/agents/test-author.md` (si existe)

> Leer primero cada fichero para ver el texto exacto que declara el default
> manual (fechado 2026-07-12) y sustituirlo por: el default de verificación de
> UI del proyecto vuelve a ser **E2E automático con Playwright** (`npm run
> test:e2e`), a partir de 2026-07-15.

- [ ] **Step 1: Leer y localizar la declaración del default**

Run: `grep -rn "manual" docs/TESTING.md .claude/agents/qa-verifier.md .claude/agents/test-author.md`

- [ ] **Step 2: Reescribir el default a E2E automático**

En `docs/TESTING.md`, reemplazar la sección/frase que fija el default en checklist manual por un bloque que diga que, desde 2026-07-15, la verificación de UI del proyecto es E2E automático con Playwright (`npm run test:e2e`), y que los checklists manuales quedan como opción puntual, no como default. Ajustar en las guías de agente cualquier frase equivalente ("as of 2026-07-12 the project default ... is a manual checklist").

- [ ] **Step 3: Verificar coherencia**

Run: `grep -rn "2026-07-12\|checklist manual\|manual checklist" docs/TESTING.md .claude/agents/`
Expected: ya no queda ninguna afirmación de que el default sea manual (solo, como mucho, la nota histórica).

- [ ] **Step 4: Commit**

```bash
git add docs/TESTING.md .claude/agents
git commit -m "docs(testing): el default de verificacion vuelve a E2E automatico

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Verificación integral y suite existente

**Files:** ninguno (solo ejecución)

> La red de seguridad automática de este PR son los tests unitarios de Task 1
> (contrato "qué rutas revalida cada mutación" — el guardián real contra
> "olvidé una ruta") más la suite existente verde. Los E2E de *comportamiento*
> de reactividad de club llegan en la Fase 2, donde el cambio es visible (el
> feed de club deja el estado local); añadirlos aquí sería teatro, porque en
> Fase 0+1 el feed de club aún no se actualiza en pantalla (estado local).

- [ ] **Step 1: Unit tests completos**

Run: `fnm use 22 && npx vitest run`
Expected: PASS, incluidos los 7 de `revalidate.test.ts`.

- [ ] **Step 2: Tipos y lint del proyecto**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `fnm use 22 && npm run build`
Expected: build OK (ninguna action rompe por el cambio de imports).

- [ ] **Step 4: Suite E2E existente**

Run: `fnm use 22 && npx playwright test`
Expected: PASS (happy-path, club-join-request, propose-wizard, signup, busqueda-hidratacion). Si algún spec falla por datos/entorno y no por el cambio, anotarlo pero no bloquear.

- [ ] **Step 5: Commit (si hubo ajustes) y cierre**

Si algún paso obligó a un ajuste, commitear. Si todo pasó sin cambios, no hay commit.

---

## Self-Review

- **Cobertura del spec (Fase 0+1):**
  - Fundación `revalidate.ts` → Task 1. ✓
  - Convención `docs/reactividad.md` → Task 5. ✓
  - Barrido de correctitud (enrutar + añadir rutas que faltan) → Tasks 2, 3, 4. ✓
  - Fix `/club/[slug]` en interacciones → Task 2. ✓
  - Revalidación en acciones de club → Task 3. ✓
  - Revertir preferencia de testing del repo → Task 6. ✓
  - Verificación E2E/automática → Task 7. ✓
  - **Desviación consciente:** el hook `useOptimisticAction` se mueve a la Fase 3
    (donde tiene consumidor y es testeable; no hay testing-library/jsdom para
    testear un hook huérfano ahora). El spec lo ponía en Fase 0. Señalado aquí
    para revisión del usuario.
- **Placeholders:** ninguno; cada paso trae código o comando concreto. Los
  ficheros de agente en Task 6 llevan "si existe" porque su ruta exacta se
  confirma con el grep del Step 1 — el contenido a cambiar sí está definido.
- **Consistencia de tipos:** los nombres de helper usados en Tasks 2–4 son
  exactamente los del bloque *Produces* de Task 1 y los del test de Task 1.
```
