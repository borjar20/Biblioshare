# Reactividad Fase 2 — Convergencia de clubs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la revalidación que la Fase 0+1 ya añadió a las acciones de club se **vea** sin recargar. Hoy no se ve porque los componentes de club siembran su estado local con `useState(initial…)` una sola vez y lo reconcilian con un re-fetch cliente propio; ese estado ignora las props frescas que el servidor entrega tras revalidar.

**Architecture:** Los componentes de club dejan de espejar datos de servidor en estado local y **derivan de props**. Así, cuando una server action de club revalida `/club/[slug]` (Fase 1), Next re-ejecuta la RSC y "actualiza la UI al momento si estás viendo la ruta afectada" (doc de esta versión de Next, `revalidatePath.md`) — el patrón server-authoritative que ya funciona en libros/biblioteca/social. Se elimina el re-fetch cliente bespoke (`listClubActivities`, `getActivity`, `listJoinRequests`, `listClubPosts`) y la telaraña de callbacks de reconciliación (`onChanged`/`onProposed`/`onPosted`/`onVoted`) que existía solo para compensar el estado sembrado-una-vez.

**Tech Stack:** Next.js 16.2.10 (App Router, modelo de caché *anterior* — sin `cacheComponents`), React 19.2, Supabase, next-intl, Vitest 4, Playwright.

## Global Constraints

- **Node 22 para el runner de tests.** El shell arranca en Node 20.9; activar fnm Node 22 antes de `vitest`/`playwright` (`fnm use 22`). Ver memoria `node-y-vitest`.
- **AGENTS.md:** "This is NOT the Next.js you know." El mecanismo base ya está verificado contra la doc local: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` → *"Server Functions: Updates the UI immediately (if viewing the affected path)."* No re-litigar esto; es la base del plan.
- **No tocar el servidor.** Las server actions de club NO se modifican: ya revalidan (Fase 1). Fase 2 es puramente de cliente (componentes en `src/components/clubs`).
- **Behavior-preserving salvo el bug.** El único cambio de comportamiento buscado es "se refleja sin recargar". No cambiar copy, layout, ni la lógica de permisos/gateo. El estado **puramente de UI** (formularios abiertos, `editing`, `error`, `pendingId`, `selectedOption` de un poll, estado de drag) se mantiene local — solo se deja de espejar **datos de servidor**.
- **No apilar PRs.** Esta rama sale de `main` ya con Fase 0+1 mergeada (#36). No depende de ramas abiertas.
- **Riesgo acotado en el subárbol profundo de actividad.** Los tableros por tipo (`tierlist`, `list-challenge`, `criteria-challenge`) y el subárbol de `checkpoints` tienen estado local propio (drag, edición). NO se refactorizan por dentro: se reconcilian repuntando su `onChanged` a `router.refresh()` desde el padre (Task 4). Solo se derivan-de-props los componentes *tope* de cada vista.
- **Comentarios y copy en español**, siguiendo el estilo del código existente.

### Principio de conversión (aplica a cada componente "tope")

Un componente que hoy hace:
```tsx
const [data, setData] = useState(initialData);      // espejo sembrado una vez
function refresh() { startTransition(async () => setData(await refetch())); }
// ...pasa refresh como onChanged a los hijos
```
pasa a:
```tsx
const data = initialData;                            // deriva de props
// ...la server action del hijo revalida (Fase 1) → la RSC re-ejecuta →
//    este componente recibe initialData fresco → se re-renderiza.
```
El `refresh`/re-fetch y los callbacks de reconciliación se **eliminan** (Tasks 1–3), salvo el subárbol profundo de actividad, donde el callback se **repunta a `router.refresh()`** (Task 4).

---

### Task 1: `JoinRequestList` deriva de props

**Files:**
- Modify: `src/components/clubs/join-request-list.tsx`

**Contexto:** hoy `useState(initialRequests)` + re-fetch `listJoinRequests(clubId)` tras cada decisión. `approveJoinRequest`/`rejectJoinRequest` ya revalidan (Fase 1).

- [ ] **Step 1: Derivar de props**
  - Sustituir `const [requests, setRequests] = useState(initialRequests);` por derivar de la prop: `const requests = initialRequests;`.
  - Borrar el import y la llamada a `listJoinRequests` y el `setRequests(await listJoinRequests(clubId));`.
  - Mantener `pendingId` (estado de UI: qué fila está resolviéndose) y el `startTransition`. `decide()` queda: `setPendingId(userId); startTransition(async () => { await (approve|reject); setPendingId(null); });`. La solicitud aprobada/rechazada desaparece porque la revalidación entrega un `initialRequests` sin ella.
  - Si `useTransition` deja de usarse, quitarlo; si `pendingId` basta para deshabilitar, mantener `startTransition` solo si sigue aportando (revisar que el botón se rehabilita bien).

- [ ] **Step 2: Tipos y lint**
  Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/components/clubs/join-request-list.tsx`
  Expected: sin errores.

- [ ] **Step 3: Commit**
  ```bash
  git add src/components/clubs/join-request-list.tsx
  git commit -m "refactor(clubs): JoinRequestList deriva de props

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 2: `ActivityList` + `ClubManagement` + `ProposalModeration` + `ActivityComposer` derivan de props

**Files:**
- Modify: `src/components/clubs/activity-list.tsx`
- Modify: `src/components/clubs/club-management.tsx`
- Modify: `src/components/clubs/proposal-moderation.tsx`
- Modify: `src/components/clubs/activity-composer.tsx`

**Contexto:** `ActivityList` y `ClubManagement` espejan `initialActivities` en `useState` y re-fetchean con `listClubActivities`. `ProposalModeration` y `ActivityComposer` ya derivan de props pero llaman `onChanged`/`onProposed` al padre para forzar ese re-fetch. Todas las acciones subyacentes (`proposeActivity`, `activateActivity`, `archiveActivity`) revalidan (Fase 1).

- [ ] **Step 1: `ActivityList` deriva de props**
  - `const activities = initialActivities;` (quitar `useState` y `useTransition`).
  - Borrar `refresh()` y el import/uso de `listClubActivities`.
  - `<ActivityComposer clubId={clubId} />` (sin `onProposed`).
  - `<ProposalModeration proposals={proposed} clubSlug={clubSlug} canModerate={isModerator} />` (sin `onChanged`).

- [ ] **Step 2: `ClubManagement` deriva de props**
  - `const activities = initialActivities;` (quitar `useState`/`useTransition`/`refresh`/`listClubActivities`).
  - `<ProposalModeration ... />` sin `onChanged`.
  - `JoinRequestList` y `ManageMembers` se quedan igual (Task 1 y fuera de alcance respectivamente).

- [ ] **Step 3: `ProposalModeration` — quitar `onChanged`**
  - Borrar `onChanged` del tipo de props y del destructuring.
  - En `moderate()`, quitar la línea `onChanged();`. Queda: `setPendingId(id); startTransition(async () => { await (activate|archive); setPendingId(null); });`.
  - La propuesta aprobada/rechazada cambia de grupo porque la revalidación entrega `activities` frescas al padre, que recalcula `proposed`.

- [ ] **Step 4: `ActivityComposer` — quitar `onProposed`**
  - Leer el fichero primero. Borrar `onProposed` del tipo y del destructuring, y la llamada `onProposed();` tras proponer. Mantener cualquier reset de formulario local. La nueva propuesta aparece vía revalidación → props frescas.
  - `ActivityComposer` usa `propose-wizard` (que tiene su propio `onProposed`): revisar si el wizard necesita seguir notificando al composer para **cerrarse** (UI local, legítimo) vs. para reconciliar datos (ya no hace falta). Conservar solo lo que sea estado de UI (cerrar el wizard); quitar lo que fuera para re-fetch.

- [ ] **Step 5: Tipos y lint**
  Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/components/clubs`
  Expected: sin errores (ningún call-site huérfano de `onChanged`/`onProposed`).

- [ ] **Step 6: Commit**
  ```bash
  git add src/components/clubs/activity-list.tsx src/components/clubs/club-management.tsx src/components/clubs/proposal-moderation.tsx src/components/clubs/activity-composer.tsx
  git commit -m "refactor(clubs): lista y gestion de actividades derivan de props

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 3: `ClubFeed` — feed paginado con página 1 server-authoritative

**Files:**
- Modify: `src/components/clubs/club-feed.tsx`
- Modify: `src/components/clubs/club-post-composer.tsx`
- Modify: `src/components/clubs/club-post-card.tsx`

**Contexto:** el feed es el único con paginación ("cargar más") → **necesita** estado local para acumular páginas, así que no puede derivar-de-props del todo. Patrón de la convención (`docs/reactividad.md`): estado local, pero **reconciliar la primera página** con la verdad del servidor tras cada mutación. Las mutaciones (`createTextPost`/`createShareActivityPost`/`createPoll`, `votePoll`, `deletePost`) ya revalidan (Fase 1), lo que re-ejecuta la RSC y entrega un `initialPage` nuevo.

- [ ] **Step 1: Reconciliar página 1 desde props**
  - Mantener `const [posts, setPosts] = useState(initialPage.posts);` y `cursor`.
  - Añadir un efecto que resiembra la página 1 cuando el servidor entrega un `initialPage` nuevo (tras cualquier revalidación):
    ```tsx
    useEffect(() => {
      setPosts(initialPage.posts);
      setCursor(initialPage.nextCursor);
    }, [initialPage]);
    ```
    `initialPage` solo cambia de identidad cuando la RSC re-ejecuta (navegación/revalidación), no en re-renders de cliente — así que esto reconcilia sin bucles. Acumular más páginas se pierde al resembrar; es el trade-off aceptado por la convención ("reconcilia la primera página").
  - `loadMore()` se mantiene igual (append + avanzar cursor).

- [ ] **Step 2: Quitar el re-fetch bespoke y los callbacks de reconciliación**
  - Borrar el import y el uso de `listClubPosts` y la función `refresh(page)`.
  - `<ClubPostComposer clubId={clubId} />` sin `onPosted`.
  - `<ClubPostCard ... />` sin `onVoted` ni `onDeleted`. El borrado y el voto se reflejan porque la revalidación resiembra la página 1 (Step 1).

- [ ] **Step 3: `ClubPostComposer` — quitar `onPosted`**
  - Borrar `onPosted` del tipo/destructuring y sus 3 llamadas (`submitText`, `submitShare`, `submitPoll`). Mantener `reset()` (UI local: cierra y limpia el formulario). El post nuevo aparece vía resembrado.

- [ ] **Step 4: `ClubPostCard` — quitar `onVoted`/`onDeleted`**
  - Borrar ambos del tipo/destructuring y sus llamadas. Mantener el estado local de UI: `selectedOption` (feedback inmediato del radio + rollback en error) y el `confirm()` de borrado. Tras `votePoll`/`deletePost`, la revalidación resiembra la página 1 con los conteos/lista frescos.
  - `ReviewInteractions` (likes/comentarios del post) no se toca: gestiona su propio estado; su capa optimista es de la Fase 3.

- [ ] **Step 5: Tipos y lint**
  Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/components/clubs`
  Expected: sin errores.

- [ ] **Step 6: Commit**
  ```bash
  git add src/components/clubs/club-feed.tsx src/components/clubs/club-post-composer.tsx src/components/clubs/club-post-card.tsx
  git commit -m "refactor(clubs): el feed reconcilia la pagina 1 desde el servidor

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 4: `ActivityDetailView` deriva de props; subárbol profundo reconcilia con `router.refresh()`

**Files:**
- Modify: `src/components/clubs/activity-detail.tsx`

**Contexto:** `ActivityDetailView` espeja `initialActivity`/`status`/`viewerIsParticipant` en `useState` y reconcilia con `getActivity`. Sus hijos (`ActivityItemPool`, `ActivityItemList`, `CompletionModeEditor`, y el `DetailExtension` de cada tipo: tierlist/list-challenge/criteria + el subárbol de checkpoints) reciben `onChanged`. Esos hijos tienen estado local propio (drag, edición) y **no se refactorizan** en esta fase.

**Decisión de diseño (acotar riesgo):** el componente *tope* deriva de props; para NO tocar los hijos frágiles, `refreshActivity` se reimplementa como `router.refresh()` y se sigue pasando como `onChanged`. Como el tope ya deriva de props, `router.refresh()` (re-ejecuta la RSC → `activity` fresco) sí se refleja. Esto reconcilia el subárbol con un cambio mínimo. Coste consciente: para mutaciones *de los hijos* hay un refresco redundante con el `revalidatePath` de la propia action (Fase 1); aceptable por frecuencia baja y a cambio de no tocar los tableros con drag. Documentar en el `docs/reactividad.md` (Task 6).

- [ ] **Step 1: Derivar los datos de servidor de la prop**
  - Renombrar el destructuring: usar `activity` (la prop) directamente. Quitar `const [activity, setActivity] = useState(initialActivity);`.
  - Quitar `const [status, setStatus] = useState(activity.status);` → `const status = activity.status;`.
  - Quitar `const [isParticipant, setIsParticipant] = useState(activity.viewerIsParticipant);` → `const isParticipant = activity.viewerIsParticipant;`.
  - Mantener estado **de UI**: `editing`, `error`, `isPending` (`useTransition`).

- [ ] **Step 2: `refreshActivity` → `router.refresh()`**
  - `import { useRouter } from "next/navigation";` y `const router = useRouter();`.
  - Sustituir el cuerpo de `refreshActivity` (que hacía `getActivity` + setters) por `router.refresh();`. Quitar el import/uso de `getActivity`.
  - Seguir pasando `onChanged={refreshActivity}` a `ActivityItemPool`, `CompletionModeEditor`, `DetailExtension`, `ActivityItemList` (sin cambios en esos ficheros).

- [ ] **Step 3: Botones propios del detalle — confiar en la revalidación**
  - Los botones de `ActivityDetailView` (join/leave/activate/finish/archive) usan `run(action, onSuccess)` donde `onSuccess` hacía `setStatus(...)`/`refreshActivity`. Como `status`/`isParticipant` ahora derivan de props y la action revalida, `onSuccess` sobra. Simplificar `run` para no exigir `onSuccess` (o pasar un no-op) y quitar los `setStatus`/`setIsParticipant`. Verificar que la vista de cada estado (proposed→active→finished/archived) se recalcula desde `activity.status`.
  - Alternativa válida si resulta más limpio: dejar que estos botones también usen `router.refresh()` como `onSuccess`, por consistencia con los hijos. Elegir la opción que deje el diff más claro; ambas son correctas porque el tope deriva de props.

- [ ] **Step 4: Tipos y lint**
  Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/components/clubs/activity-detail.tsx`
  Expected: sin errores.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/clubs/activity-detail.tsx
  git commit -m "refactor(clubs): el detalle de actividad deriva de props y reconcilia con router.refresh

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 5: E2E de reactividad de club (Playwright)

**Files:**
- Create: `e2e/club-reactivity.spec.ts` (nombre orientativo; alinear con la convención de la carpeta `e2e/`)

> Leer primero un spec existente (`e2e/club-join-request.spec.ts`) para reutilizar helpers de login/seed y la convención de localizadores (testids). Estos E2E son la red de seguridad de comportamiento que la Fase 0+1 dejó pendiente (allí el feed aún no se actualizaba en pantalla).

- [ ] **Step 1: Cubrir los flujos arreglados (sin recarga de página)**
  Cada aserción debe hacerse **sin** `page.reload()` — ese es el punto:
  - Crear un post de texto en el feed → aparece en la lista.
  - Votar una encuesta → el voto/estado se refleja.
  - Proponer una actividad → aparece en el grupo "propuestas".
  - Moderar (aprobar) una propuesta → se mueve de grupo (propuesta → activa).
  - (Si el seed lo permite) resolver una solicitud de ingreso → la fila desaparece.

- [ ] **Step 2: Ejecutar**
  Run: `fnm use 22 && npx playwright test e2e/club-reactivity.spec.ts`
  Expected: PASS. Si el entorno de datos bloquea algún flujo concreto, anotarlo y dejar cubierto lo que sí corre (no inventar seeds frágiles).

- [ ] **Step 3: Commit**
  ```bash
  git add e2e/club-reactivity.spec.ts
  git commit -m "test(e2e): reactividad de club sin recargar

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 6: Verificación integral + convención + memoria

**Files:**
- Modify: `docs/reactividad.md` (precisar el mecanismo)

- [ ] **Step 1: Suite completa**
  Run: `fnm use 22 && npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`
  Expected: PASS/limpio. (Los unit tests de `revalidate.test.ts` de Fase 0+1 siguen verdes; Fase 2 no toca servidor.)

- [ ] **Step 2: E2E completa**
  Run: `fnm use 22 && npx playwright test`
  Expected: PASS. Anotar cualquier fallo preexistente de entorno/datos que no sea regresión (p.ej. `propose-wizard.spec.ts` si sigue con el locator preexistente).

- [ ] **Step 3: Precisar `docs/reactividad.md`**
  - En la sección "Vista no paginada", dejar claro que el mecanismo es: la server action revalida (helpers de Fase 0+1) → la RSC re-ejecuta → el componente, si **deriva de props**, se actualiza al momento (doc de Next: *updates the UI immediately if viewing the affected path*).
  - Añadir la nota del subárbol profundo de actividad: cuando un componente hijo con estado local propio no se puede derivar-de-props sin refactor, se reconcilia repuntando su callback a `router.refresh()` desde un padre que sí deriva de props (patrón usado en `activity-detail`).

- [ ] **Step 4: Commit**
  ```bash
  git add docs/reactividad.md
  git commit -m "docs(reactividad): precisa el mecanismo de convergencia de clubs

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

- [ ] **Step 5: Memoria** (fuera del repo; lo hace el controlador tras el review final)
  Actualizar `reactividad-consistente.md`: Fase 2 completada en PR #NN; queda Fase 3 (optimista).

---

## Self-Review

- **Cobertura del spec (Fase 2):**
  - Componentes no paginados derivan de props → Tasks 1, 2, 4. ✓
  - Feed de club reconcilia la primera página tras cada mutación → Task 3. ✓
  - Callbacks siempre cableados / eliminados donde sobran → Tasks 2, 3. ✓
  - E2E automáticos de los flujos arreglados → Task 5. ✓
- **Desviación consciente y su justificación:** el subárbol profundo de actividad (tableros con drag, checkpoints) NO se deriva-de-props hoja por hoja; se reconcilia con `router.refresh()` desde `activity-detail` (Task 4). Motivo: esos hijos tienen estado local legítimo y refactorizarlos es alto riesgo / bajo valor frente a la queja del usuario (posts, comentarios, propuestas, participación). Coste: un refresco redundante en mutaciones de esos hijos. Señalado para revisión.
- **`ManageMembers` queda fuera:** hoy se auto-refetchea en cada mutación (funciona) y no recibe `initialMembers` de la page; derivarlo de props exigiría plumbing nuevo en la page RSC, sin resolver una queja real. Fuera de alcance de Fase 2.
- **Sin cambios de servidor:** ninguna server action se toca; la revalidación de Fase 1 es la única fuente de verdad.
- **Riesgo principal:** que algún componente derivado-de-props tenga un hijo con estado sembrado-una-vez que dependa de un callback ahora eliminado. Mitigación: Tasks 1–3 son componentes tope con hijos que ya derivan de props o son estado de UI; Task 4 conserva el callback (repuntado a `router.refresh()`) precisamente para no romper el subárbol profundo. El E2E de Task 5 ejercita los flujos reales sin recarga.
```
