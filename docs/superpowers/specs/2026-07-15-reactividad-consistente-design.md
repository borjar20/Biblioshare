# Reactividad consistente en toda la app

**Fecha:** 2026-07-15
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Enfoque:** A (fundación correcta + capa optimista reutilizable) con la disciplina de B (optimista solo donde aporta)

## Problema

Muchos formularios, comentarios y acciones no se reflejan en la UI hasta que
el usuario recarga la página manualmente. La causa no es una sola: conviven
varios patrones de reactividad, cada uno con su propia forma de fallar.

### Diagnóstico (evidencia recogida)

1. **Las lecturas NO son el problema.** Los datos se leen en el servidor (RSC),
   no con el cliente Supabase de navegador (solo 5 ficheros usan el cliente de
   navegador, y son subidas de imagen / app-shell). Por tanto el fallo está en
   el **refresco tras mutar**, no en el origen de los datos.

2. **Dos patrones de mutación conviviendo:**
   - **Server-authoritative** (`revalidatePath` + `startTransition`, la UI
     deriva de props del servidor). Es el patrón de libros, biblioteca,
     social, catálogo, pases, sesiones, sagas, series, retos, perfil. Funciona:
     la doc de esta versión de Next confirma que `revalidatePath` desde un
     Server Action *actualiza la UI al momento si estás viendo la ruta
     afectada*.
   - **Cliente con estado local + callbacks** (los clubs). Los componentes de
     club mantienen su propia lista en `useState` y se refrescan re-llamando a
     un Server Action desde callbacks (`onPosted`, `onVoted`, `onDeleted`).
     Funciona *solo si* cada mutación está cableada a su callback; si alguna
     no lo está, no se ve hasta recargar.

3. **Bugs concretos identificados:**
   - Las acciones de club (`src/lib/clubs/**`) **no llaman a `revalidatePath`**
     — dependen 100% de callbacks de cliente.
   - `revalidateItemPages()` en `src/lib/social/interaction-actions.ts` revalida
     `/libro`, `/pelicula`, `/serie` y `/`, pero **no `/club/[slug]`**: un like
     o comentario a un post de club nunca revalida su propia página.
   - `ClubFeed` siembra `useState(initialPage.posts)` una sola vez en el
     montaje; aunque el servidor revalide y pase un `initialPage` nuevo, el
     estado local no se actualiza con el cambio de prop.

### Restricciones técnicas confirmadas (contra la doc de esta versión de Next)

- `next.config.ts` **no** tiene `cacheComponents: true` → estamos en el modelo
  de caché anterior. `revalidatePath` es el primitivo correcto: las lecturas
  son dinámicas, por-usuario y protegidas por RLS.
- **No** se migra a `revalidateTag` / `use cache` / Cache Components. Esos
  primitivos requieren envolver las lecturas en un caché tageado, lo que
  cachearía datos por-usuario (riesgo directo con RLS) y es un cambio
  arquitectónico grande, fuera de alcance.
- `useOptimistic` **no se usa hoy en ningún sitio** — introducirlo es partir de
  cero, sin legado que reconciliar.

## Principio rector: dos capas separadas

1. **Capa de verdad (servidor).** Cada mutación revalida *todas* las rutas
   afectadas, vía helpers centralizados. Es la capa que arregla el "no se
   refleja". **Obligatoria en toda mutación.**
2. **Capa de sensación (cliente).** `useOptimistic` pinta el cambio al instante
   en microacciones frecuentes; la capa de verdad reconcilia debajo. **Solo
   donde aporta** (disciplina B).

El optimismo es una capa *encima* de la revalidación, nunca *en lugar* de ella:
sin revalidación, el estado optimista y la verdad divergen y al navegar
reaparece lo viejo.

## Diseño por fases

Cada fase es un plan y un PR independientes, **en secuencia** (no apilados).
Empaquetado acordado: **Fase 0+1 en un PR**, luego Fase 2, luego Fase 3.

### Fase 0 — Fundación (habilitador, sin cambios visibles)

Ficheros nuevos:

- `src/lib/reactivity/revalidate.ts` — helpers de revalidación por entidad,
  única fuente de verdad de "qué rutas afecta mutar X". Ejemplos:
  - `revalidateItem(itemId)` → `/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`
    (page) + `/` (feed).
  - `revalidateItemAndClubs(itemId)` → lo anterior + `/club/[slug]` (page).
  - `revalidateClub(slug)` → `/club/[slug]` + `/clubes`.
  - `revalidateProfile(username)` → `/u/[username]` (+ subrutas relevantes).
  - `revalidateLibrary()` / `revalidateFeed()` según corresponda.
  - Se definirá el conjunto exacto durante el plan, catalogando cada ruta real
    del árbol `src/app`.
- `src/lib/reactivity/use-optimistic-action.ts` — hook cliente reutilizable
  sobre `useOptimistic` + `startTransition`, con:
  - estado optimista derivado de las props del servidor (no autoritativo),
  - estado `isPending`,
  - **rollback automático en error** (revierte al valor de servidor y expone el
    error para pintarlo).
  - Firma pensada para toggles/contadores (like, follow, voto) y para
    "append" (comentario nuevo).
- `docs/reactividad.md` — convención corta: cuándo derivar-de-props, cuándo
  estado-local + refresco (listas paginadas), cuándo optimista. Referencia
  obligada para features nuevas.

### Fase 1 — Barrido de correctitud (arregla el bug real) — *mismo PR que Fase 0*

- Auditar las ~20 acciones que hoy usan `revalidatePath` y enrutar cada una por
  los helpers de la Fase 0, **añadiendo las rutas que faltan**.
- **Añadir revalidación a las acciones de club** (`src/lib/clubs/posts.ts`,
  `activities/**`, `membership.ts`, `join-requests.ts`, `clubs.ts`, y los
  action-files de `src/components/clubs/*-actions.ts`), hoy sin `revalidatePath`.
- Corregir `revalidateItemPages()` para incluir `/club/[slug]` en likes y
  comentarios sobre posts de club.
- **Criterio de salida:** toda mutación de la app se refleja tras completarse,
  sin recargar (aún sin optimismo). Verificado con E2E (ver Fase 4).

### Fase 2 — Convergencia de clubs (PR propio)

- Componentes de club **no paginados**: derivar de props del servidor (que ya
  reciben la revalidación de la Fase 1) en lugar de sembrar `useState` una vez.
- **Feed de club** (`ClubFeed`, tiene "cargar más" → necesita estado local para
  acumular páginas): mantener el estado local pero **reconciliar la primera
  página** vía `router.refresh()` / re-fetch tras *cada* mutación, y garantizar
  que **toda** mutación (post, voto, borrado, actividad compartida) dispara ese
  refresco — hoy solo algunas lo hacen.
- Revisar `ClubPostComposer` / `ClubPostCard` para que sus callbacks
  (`onPosted`, `onVoted`, `onDeleted`) estén siempre cableados.

### Fase 3 — Capa optimista (PR propio, disciplina B)

Aplicar `useOptimisticAction` **solo a microacciones frecuentes**:

- Likes / reacciones (`ReviewInteractions`, incluidos likes de comentarios).
- Follows (`FollowButton`).
- Votos de encuesta (club posts tipo poll).
- Alta / borrado de comentario (aparición/desaparición inmediata).
- Toggles frecuentes: marcar episodio visto, favorito, checkpoint.

**Se quedan fuera del optimismo** (siguen con "cierra + refresca fiable"):
editor de catálogo, crear/editar club, alta de pase, importación, y demás
formularios multi-campo — el optimismo ahí es coste sin retorno.

### Fase 4 — Verificación (parte de cada PR)

- **E2E automáticos con Playwright** (`npm run test:e2e`). Se revierte la
  preferencia de checklist manual: a partir de ahora la verificación de UI de
  este proyecto vuelve a ser E2E automático.
- **Tarea de repo (incluida en el PR de Fase 0+1):** actualizar
  `docs/TESTING.md` y la guía de los agentes `qa-verifier` / `test-author` para
  reflejar que el default del proyecto vuelve a ser E2E automático, no checklist
  manual.
- Cada fase añade/extiende specs Playwright que ejerciten el flujo arreglado y
  fallen si vuelve la regresión (like/comentario se refleja sin recargar, post
  de club aparece sin recargar, voto se refleja, etc.).
- Nota de entorno: activar fnm Node 22 antes de correr el runner (ver memoria
  `node-y-vitest`).

## Fuera de alcance

- Migración a Cache Components (`cacheComponents: true`) / `revalidateTag` /
  `use cache`.
- Cambiar el origen de datos a lecturas en cliente.
- Optimismo en formularios multi-campo.
- Rediseño visual de ningún flujo (solo comportamiento de reactividad).

## Riesgos y notas

- `revalidatePath` con patrón de ruta dinámica (`/libro/[id]`, "page") revalida
  *todas* las instancias de esa ruta; es coarse pero correcto para este caso y
  es el patrón ya en uso. Aceptado.
- La convergencia de clubs (Fase 2) es el trozo con más refactor real; el resto
  es sobre todo cableado y centralización.
- No apilar los 3 PRs simultáneamente: mergear 0+1 antes de abrir el de 2, etc.
  (lección registrada en memoria del proyecto).
