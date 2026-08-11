---
title: "Fase 4 — Cache Components: rebanada de cimientos"
status: draft
date: 2026-08-05
issue: 448
depends_on: [436, 437, 435, 442]
---

# Fase 4 (Cache Components) — rebanada de cimientos

Primera rebanada de la Fase 4 de la auditoría Next.js 16 (#448). Objetivo: aterrizar el
**primer `use cache` del repositorio en producción, sin fuga entre cuentas (#437) y sin
regresión de "no veo lo que acabo de guardar"** (#36/#37/#39/#66, la clase de bug más cara
del proyecto). No intenta cerrar la Fase 4 entera: `getEditions`, la migración completa de
`revalidatePath`→`updateTag` (#443), el barrido de insights ruta a ruta y el ISR
(`generateStaticParams`) quedan como issues de seguimiento.

## Contexto: lo que la Fase 3 ya dejó listo

- `createPublicClient()` (`src/lib/supabase/server.ts`): cliente SÍNCRONO, rol anónimo, **sin
  leer cookies**. No toca APIs de request → una función que solo lo use puede envolverse en
  `use cache`. Es la pieza que #436 construyó precisamente para este paso.
- Cuatro lecturas puras ya montadas sobre él: `getEditions`, `getItemCredits`, `getItemSagas`
  y el agregado público `getRatingSummary`. Argumentos escalares (`itemType`, `itemId`),
  resultado idéntico para todo el mundo (subconjunto público que ve un anónimo).
- `getRatingSummary` ya es, por diseño (#436), la media de perfiles PÚBLICOS — no cuenta el
  voto del espectador. Ese cambio de comportamiento ya se decidió y registró en
  `decisiones.md`. Es requisito para poder cachearla.

## Alcance

### 1. Activar Cache Components

`next.config.ts`: `experimental.cacheComponents: true` (obligatorio; `use cache` no compila
sin él). Habilitarlo endurece el resto de rutas: puede emitir *insights* o romper el build en
páginas que aún no producen shell estático. **Regla de esta rebanada:** dejar el build en
verde arreglando solo lo que lo BLOQUEE, de forma mínima; los insights no bloqueantes se
anotan como issue de seguimiento, no se persiguen aquí. No es objetivo prerenderizar las 46
rutas en este PR.

### 2. Qué se cachea — y qué NO, a propósito

| Lectura | ¿Cache? | `cacheLife` | `cacheTag` | Invalidación |
|---|---|---|---|---|
| `getItemCredits(type,id)` | ✅ | `days` | `credits:${type}:${id}` | Ninguna en esta rebanada. El espectador NUNCA escribe créditos (backfill de `ensureItemEnriched` / admin). `cacheLife` acota la rareza de un re-enriquecido. |
| `getItemSagas(type,id)` | ✅ | `days` | `saga-membership:${type}:${id}` | Ninguna en esta rebanada (el espectador no edita sagas; son admin). Ver seguimiento. |
| `getRatingSummary(type,id)` | ✅ | `hours` | `ratings:${type}:${id}` | **`updateTag` en el camino de escritura de nota** (ver §3). Es lo que desbloquea un shell estático del hero de la ficha. |
| `getEditions(...)` | ❌ **se aplaza** | — | — | Enredada con el hack `freshRead` + sync-en-render (`loadBookEditions`). `use cache` reintroduce el bug "la tira se queda en el placeholder" que ese hack arregló, y su escritor corre en render (no es Server Action → no puede `updateTag`). → issue de seguimiento. |

Mecánica por función (todas ya usan `createPublicClient`, argumentos escalares):

```ts
export async function getItemCredits(itemType: ItemType, itemId: string): Promise<ItemCredits> {
  "use cache";
  cacheLife("days");
  cacheTag(`credits:${itemType}:${itemId}`);
  // …resto igual…
}
```

Análogo para `getItemSagas` (`saga-membership:…`, `days`) y `getRatingSummary`
(`ratings:…`, `hours`). `getEditions` NO se toca.

**Respuesta escrita a la regla #437 (obligatoria por PR):**
1. ¿El dato es el mismo para anónimo, dueño y tercero? **Sí** para las tres: son lecturas del
   subconjunto público con rol anónimo. `getRatingSummary` es la media de perfiles públicos
   por diseño (#436).
2. ¿Tocan `cookies()`/`headers()`/`searchParams`? **No**: usan `createPublicClient()`, que es
   síncrono y no lee cookies. Reciben solo escalares.

### 3. Invalidación de la nota (read-your-own-writes)

Cachear `getRatingSummary` sin invalidar cuando el espectador cierra un pase con nota SERÍA el
bug de "no veo mi voto". Toda escritura de nota fluye por
`revalidateReadingLog(itemType, id)` (verificado: `passes/actions.ts`, `sessions/actions.ts`,
`series/episode-actions.ts`, `library/manage-actions.ts`). Ese es el punto preciso —no
`revalidateItemPage`, que también dispara en ediciones de metadatos que no cambian la nota.

En `src/lib/reactivity/revalidate.ts`, dentro de `revalidateReadingLog`, añadir:

```ts
import { revalidatePath, updateTag } from "next/cache";

export function revalidateReadingLog(itemType: ItemType, id: string): void {
  updateTag(`ratings:${itemType}:${id}`); // Fase 4: la media cacheada se refresca ya
  revalidateItemPage(itemType, id);
  revalidateProfilePages();
  revalidateFeed();
}
```

`updateTag` (no `revalidateTag`): expira ya y la siguiente petición espera al dato fresco
—read-your-own-writes—, que es la semántica correcta para este proyecto (#443). Todos los
llamantes de `revalidateReadingLog` son Server Actions, requisito de `updateTag`. El resto de
la migración de `revalidatePath` (58 sitios más) es #443, PR aparte; aquí solo entra la
etiqueta `ratings`.

### 4. Fuera de alcance (issues de seguimiento a abrir)

- **Cachear `getEditions`** con seguridad (desenredar `freshRead`/sync-en-render). `tipo:deuda`.
- **Barrido de insights de `cacheComponents` ruta a ruta** (las 46). `tipo:deuda`.
- **`generateStaticParams`/ISR en las fichas más visitadas**. `tipo:feature`.
- **#443**: migración completa `revalidatePath`→`updateTag` (**61** sitios reales, no ~20:
  corregir el conteo en #443).

## Verificación

`use cache` **pasa `next build` pero falla en `next start`** si algo cacheado toca APIs de
request; por eso NO basta `next dev`. Secuencia:

1. `npm install` en el worktree (no tiene `node_modules`), luego `npx tsc --noEmit` → 0 errores.
2. `npm run build` → exit 0. Anotar cuántas rutas pasan de `ƒ Dynamic` a estáticas/ISR (hoy 0).
3. `next build` + `next start` y navegar `/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`:
   hero con nota, créditos y sagas correctos.
4. `vitest` (unitarios) incl. `revalidate.test.ts` actualizado para la nueva etiqueta.
5. e2e de reactividad (`club-reactivity` y compañía) **contra el build de producción**, no
   `next dev`.
6. **Prueba de fuga con 2 cuentas** (regla del repo: con una sola cuenta la caché siempre
   acierta y la fuga no se ve). Cuenta A y cuenta B ven la MISMA media pública en una ficha con
   pases privados de A → confirma que el valor cacheado es el subconjunto público, no el de
   quien calentó la caché. Cerrar un pase con nota como A y comprobar que A ve su voto contado
   de inmediato (updateTag) y B también.

## Definición de "hecho" (AGENTS.md)

- Regla #437 ya copiada a `AGENTS.md` (commit `0717534`) — condición innegociable cumplida.
- `docs/requirements/decisiones.md`: entrada al final registrando el primer `use cache` y la
  elección de `updateTag` para la etiqueta `ratings`.
- `docs/requirements/backlog.md`: marcar el sub-punto de Fase 4 correspondiente.
- No toca esquema → `data-model.md` sin cambios.
- Abrir las 4 issues de seguimiento de §4.
