# Feed: ventana de agrupación, colapso y orden real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordenar el feed por hora real de registro dentro de cada día, mostrar la antigüedad de las reseñas, acotar la agrupación a 2 días y colapsar las tarjetas de Colección largas.

**Architecture:** El invariante de orden del feed (clave, cursor y filtro de paginación) sale de `feed.ts` a un módulo puro nuevo, `feed-order.ts`, donde por fin es testeable sin base de datos; `getFeed` pasa a consumirlo y a rellenar un `sortDate` obligatorio en las cuatro fuentes. Sobre ese terreno, la agrupación gana una ventana de 2 días y la tarjeta de Colección reutiliza el helper de colapso del timeline.

**Tech Stack:** Next.js 16.2.10 App Router/RSC, React 19.2.4, Supabase JS 2.110.1, TypeScript 5, Vitest 4.1.10, Playwright 1.61.1, next-intl.

## Global Constraints

- Fuente de verdad del estado vivo: `passes`; nunca `library_entries`.
- Sin cambios de esquema, RLS ni migraciones: `created_at` ya existe en `passes`, `progress_sessions` y `episode_watches`.
- El único fichero de i18n que se toca es `messages/es.json`, y solo para añadir `feed.grouped.showMore`.
- El feed conserva su significado: sigue siendo «lo que ha pasado». Lo backdateado se queda en su fecha y no salta al principio.
- La clave de orden, el cursor y `isAfterCursor` son **un mismo invariante**: se cambian a la vez o la paginación pierde o repite filas.
- `Date.now()` / `new Date()` sin argumentos están prohibidos en los módulos puros de orden y agrupación: los días se comparan como enteros epoch/86400.
- TDD estricto: observar RED antes de tocar producción y GREEN después.
- Antes de editar cada símbolo: `node .gitnexus/run.cjs impact <symbol> --direction upstream`; parar y avisar si el riesgo es HIGH/CRITICAL.
- Antes de cualquier commit: `node .gitnexus/run.cjs detect_changes --scope staged`.
- Node 22 obligatorio (el shell resuelve v20 por defecto y rompe Vitest). Antes de cualquier test:
  ```bash
  NODE22="$(fnm exec --using 22 node -e 'process.stdout.write(process.execPath)')"
  export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH"
  ```
- Los e2e necesitan `.env.local` en el worktree; sin él la suite se auto-salta y sale verde **sin probar nada**.
- Un solo `next dev` en el puerto 3000; limpiar servidor y fixtures al acabar.

Spec: `docs/superpowers/specs/2026-08-02-feed-agrupacion-colapso-y-orden-design.md`.

---

## Estructura de ficheros

**Crear:**

- `src/lib/social/feed-order.ts` — clave de orden, comparador, cursor y filtro de paginación. Puro, sin Supabase ni `Date`.
- `src/lib/social/feed-order.test.ts` — contrato del invariante, incluido el recorrido completo de paginación.
- `src/components/social/feed-collapse.ts` — renombrado de `progress-collapse.ts`, ahora compartido por timeline y Colección.
- `src/components/social/feed-collapse.test.ts` — renombrado de `progress-collapse.test.ts`.

**Modificar:**

- `src/lib/social/feed.ts` — `sortDate` obligatorio, `created_at` en dos `select`, base del «hace x» de reseñas/episodios, y consumo de `feed-order.ts`.
- `src/components/social/review-card.tsx:91-93` — el «hace x» deja de depender de `hideActor`.
- `src/lib/social/group-feed-entries.ts` — `GROUP_WINDOW_DAYS`, span para altas, hueco para sesiones.
- `src/lib/social/group-feed-entries.test.ts` — casos de borde de la ventana nueva.
- `src/components/social/progress-timeline-card.tsx:12,31` — importa el helper renombrado.
- `src/components/social/collection-card.tsx` — colapso.
- `messages/es.json` — `feed.grouped.showMore`.
- `e2e/feed-tarjetas-por-tipo.spec.ts` — tarjeta de Colección colapsada.

**Borrar:**

- `src/components/social/progress-collapse.ts` y `progress-collapse.test.ts` (sustituidos por el rename; usar `git mv` para conservar la historia).

---

### Task 1: Módulo puro de orden y cursor

Esta tarea **no cambia el comportamiento**: crea el módulo y lo deja probado. `feed.ts` aún no lo usa.

**Files:**

- Create: `src/lib/social/feed-order.ts`
- Create: `src/lib/social/feed-order.test.ts`

**Interfaces:**

- Produces:
  - `type FeedCursor = { day: string; sortDate: string | null; id: string }`
  - `type OrderableEntry = { eventDate: string; sortDate: string; id: string }`
  - `compareEntries(a: OrderableEntry, b: OrderableEntry): number`
  - `makeCursor(entry: OrderableEntry): string`
  - `parseCursor(cursor: string): FeedCursor`
  - `isAfterCursor(entry: OrderableEntry, cursor: FeedCursor): boolean`
  - `dateUpperBound(cursor: FeedCursor): string`
  - `timestampUpperBound(cursor: FeedCursor): string`
- Consumes: nada.

- [ ] **Step 1: Analizar el impacto antes de crear el módulo**

```powershell
node .gitnexus/run.cjs impact getFeed --direction upstream
```

Riesgo esperado: LOW en esta tarea (no se edita `getFeed` todavía), pero conviene tener delante la lista de dependientes —`loadMoreFeed`, `loadMoreProfileFeed`, `FeedSection`, `ActivityTab`— porque la Task 2 sí los afecta. Si sale HIGH/CRITICAL, parar y avisar.

- [ ] **Step 2: Escribir el test que falla**

Crear `src/lib/social/feed-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  compareEntries,
  isAfterCursor,
  makeCursor,
  parseCursor,
  type OrderableEntry,
} from "./feed-order";

// Un alta de las 00:01 y una reseña de las 23:00, ambas del mismo día. La
// reseña tiene eventDate date-only (finished_on es una columna `date`), que es
// justo lo que antes la hundía por debajo del alta.
const alta: OrderableEntry = {
  eventDate: "2026-08-01T00:01:00.000+00:00",
  sortDate: "2026-08-01T00:01:00.000+00:00",
  id: "passes:aaa",
};
const resena: OrderableEntry = {
  eventDate: "2026-08-01",
  sortDate: "2026-08-01T23:00:00.000+00:00",
  id: "diary_entries:bbb",
};

describe("compareEntries", () => {
  it("ordena por hora real dentro del día, no por granularidad de la fecha", () => {
    expect([alta, resena].sort(compareEntries)).toEqual([resena, alta]);
  });

  it("ordena por día antes que por hora", () => {
    const ayer: OrderableEntry = {
      eventDate: "2026-07-31",
      sortDate: "2026-07-31T23:59:00.000+00:00",
      id: "diary_entries:ccc",
    };
    expect([ayer, alta].sort(compareEntries)).toEqual([alta, ayer]);
  });

  it("desempata por id cuando día y hora coinciden", () => {
    const a = { ...alta, id: "passes:aaa" };
    const b = { ...alta, id: "passes:zzz" };
    expect([a, b].sort(compareEntries)).toEqual([b, a]);
  });
});

describe("cursor", () => {
  it("un cursor nuevo lleva día, hora e id", () => {
    expect(makeCursor(resena)).toBe(
      "2026-08-01~2026-08-01T23:00:00.000+00:00~diary_entries:bbb",
    );
  });

  it("parsea el cursor nuevo conservando los ids con separadores raros", () => {
    expect(parseCursor("2026-08-01~2026-08-01T23:00:00.000+00:00~x~y")).toEqual({
      day: "2026-08-01",
      sortDate: "2026-08-01T23:00:00.000+00:00",
      id: "x~y",
    });
  });

  it("un cursor legado (fecha~id) se marca sin hora, para no perder filas", () => {
    expect(parseCursor("2026-08-01~diary_entries:bbb")).toEqual({
      day: "2026-08-01",
      sortDate: null,
      id: "diary_entries:bbb",
    });
  });
});

describe("isAfterCursor", () => {
  it("excluye el propio evento del cursor", () => {
    expect(isAfterCursor(resena, parseCursor(makeCursor(resena)))).toBe(false);
  });

  it("incluye lo que va estrictamente después en el orden total", () => {
    expect(isAfterCursor(alta, parseCursor(makeCursor(resena)))).toBe(true);
  });

  it("excluye lo que va antes", () => {
    expect(isAfterCursor(resena, parseCursor(makeCursor(alta)))).toBe(false);
  });

  it("un cursor legado usa la comparación antigua (eventDate, id): no pierde ni repite", () => {
    const legado = parseCursor("2026-08-01~passes:aaa");
    // Con la semántica antigua, "2026-08-01" < "2026-08-01T00:01..." como
    // cadena, así que la reseña date-only iba DESPUÉS del alta.
    expect(isAfterCursor(resena, legado)).toBe(true);
    expect(isAfterCursor(alta, legado)).toBe(false);
  });
});

describe("recorrido completo de paginación", () => {
  it("sirve cada fila exactamente una vez con fechas de granularidad mezclada", () => {
    const all: OrderableEntry[] = [
      alta,
      resena,
      { eventDate: "2026-08-01", sortDate: "2026-08-01T12:00:00.000+00:00", id: "episode_watches:d" },
      { eventDate: "2026-07-31", sortDate: "2026-07-31T09:00:00.000+00:00", id: "passes:e" },
      { eventDate: "2026-07-31", sortDate: "2026-07-31T09:00:00.000+00:00", id: "passes:f" },
      { eventDate: "2026-07-30T22:00:00.000+00:00", sortDate: "2026-07-30T22:00:00.000+00:00", id: "passes:g" },
    ];
    const sorted = [...all].sort(compareEntries);

    const served: string[] = [];
    let cursor: string | null = null;
    const PAGE = 2;
    for (let guard = 0; guard < 10; guard++) {
      const parsed = cursor ? parseCursor(cursor) : null;
      const fresh = parsed ? sorted.filter((e) => isAfterCursor(e, parsed)) : sorted;
      const page = fresh.slice(0, PAGE);
      if (page.length === 0) break;
      served.push(...page.map((e) => e.id));
      cursor = page.length < PAGE ? null : makeCursor(page[page.length - 1]);
      if (cursor === null) break;
    }

    expect(served).toEqual(sorted.map((e) => e.id));
    expect(new Set(served).size).toBe(all.length);
  });
});
```

Mutaciones que estos tests deben detectar: quitar el componente `sortDate` del comparador (vuelve el hundimiento), comparar `eventDate` completo en vez del día, o hacer que `isAfterCursor` no espeje exactamente a `compareEntries` (el recorrido completo pierde o repite filas).

- [ ] **Step 3: Ejecutar y observar RED**

```powershell
node node_modules/vitest/vitest.mjs run src/lib/social/feed-order.test.ts
```

Expected: FAIL — el módulo `./feed-order` no existe.

- [ ] **Step 4: Implementar el módulo**

Crear `src/lib/social/feed-order.ts`:

```ts
// Clave de orden del feed: (día, created_at, id), descendente.
//
// Por qué el DÍA y no la fecha entera: las cuatro fuentes mezclan
// granularidades. Las altas traen un timestamptz ("2026-08-01T18:22:06+00:00")
// y las reseñas/episodios una columna `date` ("2026-08-01"). Comparando la
// cadena completa, la corta es prefijo de la larga y ordena SIEMPRE por debajo:
// una reseña de las 23:00 caía bajo un alta de las 00:01 del mismo día.
// Normalizando al día, el desempate lo hace `sortDate` (created_at), que
// siempre es un timestamp real.
//
// `id` cierra el orden total: sin él la paginación keyset no sería
// determinista entre eventos con el mismo día y la misma hora.
export type OrderableEntry = { eventDate: string; sortDate: string; id: string };

// `sortDate: null` marca un cursor del formato antiguo (`fecha~id`), emitido
// antes de este cambio y todavía vivo en una pestaña abierta durante el
// despliegue. Para esos se conserva la comparación antigua: es la única forma
// de no perder ni repetir filas en ese salto.
export type FeedCursor = { day: string; sortDate: string | null; id: string };

const SEPARATOR = "~"; // no aparece ni en fechas ISO ni en los ids de evento

function dayOf(eventDate: string): string {
  return eventDate.slice(0, 10);
}

// Comparador descendente, apto para Array.prototype.sort.
export function compareEntries(a: OrderableEntry, b: OrderableEntry): number {
  const [da, db] = [dayOf(a.eventDate), dayOf(b.eventDate)];
  if (da !== db) return da < db ? 1 : -1;
  if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function makeCursor(entry: OrderableEntry): string {
  return `${dayOf(entry.eventDate)}${SEPARATOR}${entry.sortDate}${SEPARATOR}${entry.id}`;
}

export function parseCursor(cursor: string): FeedCursor {
  const parts = cursor.split(SEPARATOR);
  // Los ids de evento no llevan `~`, pero unir el resto es gratis y evita que
  // un id inesperado trunque el cursor en silencio.
  if (parts.length >= 3) {
    return { day: parts[0], sortDate: parts[1], id: parts.slice(2).join(SEPARATOR) };
  }
  if (parts.length === 2) {
    return { day: dayOf(parts[0]), sortDate: null, id: parts[1] };
  }
  return { day: dayOf(cursor), sortDate: null, id: "" };
}

// ¿Va `entry` estrictamente DESPUÉS del cursor en el orden total? Lo ya
// servido —incluido el propio evento del cursor— queda fuera. Espeja a
// `compareEntries`: si dejan de coincidir, la paginación pierde o repite filas.
export function isAfterCursor(entry: OrderableEntry, cursor: FeedCursor): boolean {
  if (cursor.sortDate === null) {
    // Camino legado: (eventDate completo, id), la comparación anterior al cambio.
    const legacyDate = cursor.day;
    if (entry.eventDate !== legacyDate) return entry.eventDate < legacyDate;
    return entry.id < cursor.id;
  }
  const day = dayOf(entry.eventDate);
  if (day !== cursor.day) return day < cursor.day;
  if (entry.sortDate !== cursor.sortDate) return entry.sortDate < cursor.sortDate;
  return entry.id < cursor.id;
}

// Cota superior INCLUSIVA para una columna `date`.
export function dateUpperBound(cursor: FeedCursor): string {
  return cursor.day;
}

// Cota superior INCLUSIVA para una columna `timestamptz`: cualquier hora de ese
// día debe entrar en el fetch; el descarte fino lo hace `isAfterCursor`.
export function timestampUpperBound(cursor: FeedCursor): string {
  return `${cursor.day}T23:59:59.999+00:00`;
}
```

- [ ] **Step 5: Verificar GREEN**

```powershell
node node_modules/vitest/vitest.mjs run src/lib/social/feed-order.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Expected: los 11 tests PASS y TypeScript exit 0.

- [ ] **Step 6: Commit acotado**

```powershell
git add src/lib/social/feed-order.ts src/lib/social/feed-order.test.ts
node .gitnexus/run.cjs detect_changes --scope staged
git commit -m "feat(feed): extrae la clave de orden y el cursor a un modulo puro"
```

---

### Task 2: Cablear el orden real y publicar la antigüedad de las reseñas

**Files:**

- Modify: `src/lib/social/feed.ts:43-50,126-163,241-315,484-645,668-673,748-751`
- Modify: `src/components/social/review-card.tsx:91-93`

**Interfaces:**

- Consumes: todo lo que produce Task 1.
- Produces: `FeedEvent.sortDate: string` (deja de ser opcional) y `FeedEntry` gana `sortDate: string` en sus tres variantes.

- [ ] **Step 1: Analizar el impacto antes de editar**

```powershell
node .gitnexus/run.cjs impact getFeed --direction upstream
node .gitnexus/run.cjs impact ReviewCard --direction upstream
```

Riesgo esperado: MEDIUM — `getFeed` lo comparten Inicio, Actividad de perfil y ambas paginaciones. Si sale HIGH/CRITICAL, parar y avisar.

- [ ] **Step 2: Escribir el test que falla**

Añadir al final de `src/lib/social/feed-order.test.ts`:

```ts
import { reviewRelativeBasis } from "./feed";

describe("base del «hace x» de las fechas sin hora", () => {
  it("una reseña de hoy usa created_at, que es preciso", () => {
    expect(
      reviewRelativeBasis("2026-08-02", "2026-08-02T18:22:06.000+00:00", "2026-08-02"),
    ).toBe("2026-08-02T18:22:06.000+00:00");
  });

  it("una reseña backdateada se queda en el día: no se inventa una hora", () => {
    expect(
      reviewRelativeBasis("2026-07-15", "2026-08-02T18:22:06.000+00:00", "2026-08-02"),
    ).toBe("2026-07-15");
  });
});
```

`reviewRelativeBasis` es el mismo criterio que `sessionRelativeBasis` aplicado a `finished_on` / `watched_on`; se reexporta desde `feed.ts` para que el test no dependa del módulo de sesiones.

- [ ] **Step 3: Ejecutar y observar RED**

```powershell
node node_modules/vitest/vitest.mjs run src/lib/social/feed-order.test.ts -t "base del"
```

Expected: FAIL — `reviewRelativeBasis` no está exportado por `./feed`.

- [ ] **Step 4: Hacer `sortDate` obligatorio en los tipos**

En `src/lib/social/feed.ts`, sustituir el campo `sortDate` de `FeedEvent` (líneas 44-50) por:

```ts
  // Hora real de registro (created_at). SIEMPRE presente: es el segundo
  // componente de la clave de orden del feed (ver feed-order.ts). eventDate
  // puede ser date-only —finished_on, watched_on, sesiones backdateadas— y por
  // sí solo no distingue dos eventos del mismo día.
  sortDate: string;
```

Y añadir `sortDate: string` a las tres variantes de `FeedEntry`:

```ts
export type FeedEntry =
  | { source: "person"; id: string; eventDate: string; sortDate: string; event: FeedEvent }
  | PersonGroupEntry
  | { source: "club"; id: string; eventDate: string; sortDate: string; event: ClubFeedEvent };
```

`PersonGroupEntry` gana el suyo en la Task 3; hasta entonces TypeScript señalará ese hueco, que se cierra en el Step 8.

- [ ] **Step 5: Rellenar `sortDate` y la base del «hace x» en las cuatro fuentes**

En `feed.ts`, exportar el criterio junto a los demás helpers de fecha:

```ts
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";
import { todayISO } from "@/lib/stats/dates";

// `finished_on` y `watched_on` son columnas `date`: sin hora, `timeAgo` las
// interpreta como medianoche UTC y en Madrid arrancan con 2 horas de desfase.
// Mismo criterio que las sesiones: si es de hoy, la hora real de registro es
// precisa y se usa; si está backdateada, no hay hora que mostrar.
export function reviewRelativeBasis(
  onDate: string,
  createdAt: string,
  today: string = todayISO(),
): string {
  return sessionRelativeBasis(onDate, createdAt, today);
}
```

Añadir `created_at` a los dos `select` que no lo piden:

```ts
// feed.ts:288 — reseñas
.select("id, user_id, item_type, item_id, finished_on, started_on, rating, created_at")

// feed.ts:305 — episodios
.select(
  "id, user_id, series_id, season_number, episode_number, rating, review, watched_on, created_at",
)
```

Y en los cuatro bucles que construyen eventos:

```ts
// added (feed.ts:506) — created_at ya es el eventDate
eventDate: r.created_at,
sortDate: r.created_at,

// progressed (feed.ts:539) — ya tenía sortDate, se queda igual
eventDate: sessionRelativeBasis(r.session_date, r.created_at),
sortDate: r.created_at,

// finished/rated/reviewed (feed.ts:591)
eventDate: reviewRelativeBasis(r.finished_on, r.created_at),
sortDate: r.created_at,

// watchedEpisode (feed.ts:628)
eventDate: reviewRelativeBasis(r.watched_on, r.created_at),
sortDate: r.created_at,
```

En el bloque `reviewMeta` de las reseñas (feed.ts:596-602), `readingDays` sigue usando `r.finished_on` y `r.started_on` **en crudo**: mide días de lectura, no antigüedad, y no debe pasar por `reviewRelativeBasis`.

- [ ] **Step 6: Sustituir el orden, el cursor y el filtro por el módulo puro**

Borrar de `feed.ts` el bloque de cursor de las líneas 126-163 (`CURSOR_SEPARATOR`, `parseCursor`, `dateUpperBound`, `timestampUpperBound`, `isAfterCursor`) e importar:

```ts
import {
  compareEntries,
  dateUpperBound,
  isAfterCursor,
  makeCursor,
  parseCursor,
  timestampUpperBound,
} from "./feed-order";
```

Las cotas ahora reciben el cursor entero, no su fecha:

```ts
if (cursor) q = q.lte("created_at", timestampUpperBound(cursor));   // added
if (cursor) q = q.lte("session_date", dateUpperBound(cursor));      // progressed
if (cursor) q = q.lte("finished_on", dateUpperBound(cursor));       // reseñas
if (cursor) q = q.lte("watched_on", dateUpperBound(cursor));        // episodios
```

Propagar `sortDate` al construir las entradas (feed.ts:649-666):

```ts
  const entries: FeedEntry[] = [
    ...events.map(
      (event): FeedEntry => ({
        source: "person",
        id: event.id,
        eventDate: event.eventDate,
        sortDate: event.sortDate,
        event,
      }),
    ),
    ...clubResult.events.map(
      (event): FeedEntry => ({
        source: "club",
        id: event.id,
        eventDate: event.eventDate,
        // El evento de club ya ES su created_at (club-feed.ts:128), así que su
        // hora real de registro y su fecha semántica coinciden.
        sortDate: event.eventDate,
        event,
      }),
    ),
  ];
```

Sustituir el `sort` (feed.ts:670-673) y la emisión del cursor (feed.ts:748-751):

```ts
  entries.sort(compareEntries);
```

```ts
  const nextCursor = allExhausted || !last ? null : makeCursor(last);
```

- [ ] **Step 7: Publicar el «hace x» de las reseñas**

En `src/components/social/review-card.tsx`, sustituir las líneas 91-93 por:

```tsx
      <span suppressHydrationWarning className="self-end font-mono text-[10px] text-muted-foreground">{timeAgo(event.eventDate, tTime)}</span>
```

Es decir: se quita la guarda `{hideActor && ...}`. `hideActor` sigue existiendo y sigue controlando la cabecera del autor (línea 44), que es lo único que la variante «Reseñas recientes» del perfil necesita ocultar.

- [ ] **Step 8: Actualizar el helper del test de agrupación**

`src/lib/social/group-feed-entries.test.ts` construye entradas con dos helpers propios, `ev()` y `person()` (líneas 5-17). `ev()` termina en un `as FeedEvent`, así que absorbe el campo nuevo sin tocarlo; `person()` devuelve un literal `FeedEntry` y **sí** deja de compilar. Añadirle el campo:

```ts
function person(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, sortDate: e.sortDate, event: e };
}
```

Y en `ev()`, dar a `sortDate` un valor por defecto que caiga en `eventDate`, para que los tests existentes que no lo pasan sigan describiendo el mismo caso:

```ts
    itemSubtitle: null, entryStatus: null, rating: null, reviewExcerpt: null,
    episode: null, progress: null, interactionTarget: null,
    sortDate: partial.sortDate ?? partial.eventDate,
    reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [],
    ...partial,
```

- [ ] **Step 9: Cerrar el hueco de tipos de `PersonGroupEntry`**

`groupPersonEntries` construye entradas `person` y `person-group`. Añadir `sortDate` a ambas en `src/lib/social/group-feed-entries.ts`:

```ts
export type PersonGroupEntry = {
  source: "person-group";
  id: string;
  eventDate: string; // la del ítem más reciente
  sortDate: string;  // la del ítem más reciente, para el orden final
  verb: Extract<FeedVerb, "added" | "progressed">;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  items: FeedEvent[];
};
```

Y al construir cada resultado:

```ts
      if (chunk.length === 1) {
        const e = chunk[0];
        result.push({ source: "person", id: e.id, eventDate: e.eventDate, sortDate: e.sortDate, event: e });
        continue;
      }
      const newest = chunk[0]; // ya ordenado desc
      result.push({
        source: "person-group",
        id: `group:${key}:${newest.id}`,
        eventDate: newest.eventDate,
        sortDate: newest.sortDate,
        verb: newest.verb as PersonGroupEntry["verb"],
```

El `sort` final de `groupPersonEntries` (línea 115) pasa a reutilizar el comparador puro, para que agrupación y feed no puedan divergir:

```ts
import { compareEntries } from "./feed-order";

  // Reordenar todo por la MISMA clave que usa el feed (el bucketing rompió el
  // orden original). Reutilizar el comparador evita que las dos definiciones
  // de "orden" se separen con el tiempo.
  result.sort(compareEntries);
```

Y el `sorted` interno del bucket (líneas 65-71) queda:

```ts
    const sorted = [...items].sort(compareEntries);
```

- [ ] **Step 10: Verificar GREEN, tipos y lint**

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/lib/social/feed.ts src/lib/social/feed-order.ts src/lib/social/feed-order.test.ts src/lib/social/group-feed-entries.ts src/lib/social/group-feed-entries.test.ts src/components/social/review-card.tsx
```

Expected: suite completa PASS (109 ficheros como mínimo, más los nuevos), tsc exit 0 y ESLint sin errores. `group-feed-entries.test.ts` debe seguir verde: esta tarea no cambia qué se agrupa, solo de dónde sale el orden.

- [ ] **Step 11: Verificación en navegador**

1. Comprobar que el 3000 está libre o que el único `next dev` es el de este worktree; copiar `.env.local` si falta.
2. Ejecutar el agente `qa-verifier` sobre Inicio: confirmar que las tarjetas de reseña muestran su «hace x», que una reseña registrada hoy después de un alta aparece **por encima** de ella, y que «Cargar más» no repite ni se salta filas. Revisar consola y red.

- [ ] **Step 12: Commit acotado**

```powershell
git add src/lib/social/feed.ts src/lib/social/feed-order.ts src/lib/social/feed-order.test.ts src/lib/social/group-feed-entries.ts src/lib/social/group-feed-entries.test.ts src/components/social/review-card.tsx
node .gitnexus/run.cjs detect_changes --scope staged
git diff --cached --check
git commit -m "fix(feed): ordena por hora real y publica la antiguedad de las resenas"
```

---

### Task 3: Ventana de agrupación de 2 días

**Files:**

- Modify: `src/lib/social/group-feed-entries.ts:17-38,56-86`
- Modify: `src/lib/social/group-feed-entries.test.ts:36-44,82-114`

**Interfaces:**

- Consumes: `compareEntries` y el `sortDate` obligatorio de la Task 2.
- Produces: `GROUP_WINDOW_DAYS = 2` (sustituye a `PROGRESS_WINDOW_DAYS = 7`).

- [ ] **Step 1: Analizar el impacto antes de editar**

```powershell
node .gitnexus/run.cjs impact groupPersonEntries --direction upstream
```

Riesgo esperado: LOW, limitado a `getFeed` y al render del feed.

- [ ] **Step 2: Escribir los tests que fallan**

En `src/lib/social/group-feed-entries.test.ts`, **sustituir** el test `"no agrupa altas de días distintos"` (líneas 36-44) por:

```ts
  it("agrupa altas de días adyacentes (la ventana son 2 días naturales)", () => {
    const out = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-02T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-01T22:00:00+00:00", itemId: "b2" })),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
  });

  it("parte las altas cuando el grupo pasaría de 2 días naturales", () => {
    const out = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-03T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-02T10:00:00+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries_added:c", verb: "added", actorId: "x", eventDate: "2026-08-01T10:00:00+00:00", itemId: "b3" })),
    ]);
    // El feed va de más nuevo a más viejo, así que el par pegado es el de los
    // dos días más nuevos y el más antiguo queda suelto.
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe("person-group");
    if (out[0].source === "person-group") {
      expect(out[0].items.map((i) => i.id)).toEqual([
        "diary_entries_added:a",
        "diary_entries_added:b",
      ]);
    }
    expect(out[1].source).toBe("person");
  });
```

Y **sustituir** los tres casos de borde de 7 días (líneas 82-114) por:

```ts
  const sesion = (id: string, date: string) =>
    person(ev({ id: `progress_sessions:${id}`, verb: "progressed", actorId: "x", eventDate: date, itemId: "obra" }));

  it("agrupa progressed de la misma obra separados exactamente 2 días (borde de la ventana)", () => {
    const out = groupPersonEntries([sesion("p1", "2026-08-03"), sesion("p2", "2026-08-01")]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
  });

  it("NO agrupa progressed de la misma obra separados >2 días", () => {
    const out = groupPersonEntries([sesion("p1", "2026-08-04"), sesion("p2", "2026-08-01")]);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.source === "person")).toBe(true);
  });

  it("una racha diaria larga sigue siendo UN timeline (la ventana es por hueco)", () => {
    const out = groupPersonEntries([
      sesion("p1", "2026-08-05"),
      sesion("p2", "2026-08-04"),
      sesion("p3", "2026-08-03"),
      sesion("p4", "2026-08-02"),
      sesion("p5", "2026-08-01"),
    ]);
    expect(out).toHaveLength(1);
    if (out[0].source === "person-group") expect(out[0].items).toHaveLength(5);
  });
```

`ev()` y `person()` son los helpers que ya existen en la cabecera del fichero (líneas 5-17); usarlos tal cual, sin redefinirlos. `sesion()` es un atajo local de estos tres tests, porque el `itemId` compartido es lo que hace que las sesiones caigan en el mismo bucket.

- [ ] **Step 3: Ejecutar y observar RED**

```powershell
node node_modules/vitest/vitest.mjs run src/lib/social/group-feed-entries.test.ts
```

Expected: FAIL. «agrupa altas de días adyacentes» devuelve 2 entradas porque la clave de bucket todavía incluye el día; los de 2 días de `progressed` fallan porque el umbral sigue en 7.

- [ ] **Step 4: Implementar la ventana**

En `src/lib/social/group-feed-entries.ts`, sustituir la constante (línea 23):

```ts
// Ventana de agrupación, en días naturales. Se aplica distinto según el verbo:
//   added      → SPAN: el grupo abarca como máximo esta cantidad de días.
//   progressed → HUECO: parte cuando entre dos sesiones consecutivas pasan más
//                de esta cantidad de días.
// La asimetría es deliberada: en altas se acota lo que abarca la tarjeta; en
// sesiones se detecta el parón de una lectura, de modo que un libro leído a
// diario durante semanas sigue siendo UNA tarjeta.
export const GROUP_WINDOW_DAYS = 2;
```

Quitar el día de la clave de las altas (líneas 33-38):

```ts
// El corte por días ya no vive en la clave: las altas se trocean después, por
// span, igual que las sesiones se trocean por hueco.
function groupKey(e: FeedEvent): string {
  if (e.verb === "added") return `added:${e.actorId}`;
  return `progressed:${e.actorId}:${e.itemType}:${e.itemId}`;
}
```

Y sustituir el bucle de troceado (líneas 72-86) por:

```ts
    const chunks: FeedEvent[][] = [];
    for (const ev of sorted) {
      const last = chunks[chunks.length - 1];
      if (!last) {
        chunks.push([ev]);
        continue;
      }
      // added: se compara contra el MÁS NUEVO del grupo, para acotar el span.
      // progressed: contra el ANTERIOR inmediato, para detectar el parón.
      const reference = isProgressed ? last[last.length - 1] : last[0];
      const distance = dayNumber(reference.eventDate) - dayNumber(ev.eventDate);
      const limit = isProgressed ? GROUP_WINDOW_DAYS : GROUP_WINDOW_DAYS - 1;
      if (distance > limit) chunks.push([ev]);
      else last.push(ev);
    }
```

El `-1` del span no es un truco: «una ventana de 2 días naturales» significa que el día más nuevo y el más viejo se diferencian como mucho en 1.

- [ ] **Step 5: Verificar GREEN**

```powershell
node node_modules/vitest/vitest.mjs run src/lib/social/group-feed-entries.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Expected: todos los tests del fichero PASS y tsc exit 0.

- [ ] **Step 6: Commit acotado**

```powershell
git add src/lib/social/group-feed-entries.ts src/lib/social/group-feed-entries.test.ts
node .gitnexus/run.cjs detect_changes --scope staged
git commit -m "feat(feed): acota la ventana de agrupacion a 2 dias"
```

---

### Task 4: Colapso de las tarjetas de Colección

**Files:**

- Rename: `src/components/social/progress-collapse.ts` → `src/components/social/feed-collapse.ts`
- Rename: `src/components/social/progress-collapse.test.ts` → `src/components/social/feed-collapse.test.ts`
- Modify: `src/components/social/progress-timeline-card.tsx:12,31`
- Modify: `src/components/social/collection-card.tsx`
- Modify: `messages/es.json`
- Modify: `e2e/feed-tarjetas-por-tipo.spec.ts`

**Interfaces:**

- Produces: `COLLAPSE_VISIBLE = 2` y `splitCollapsedItems<T>(items: T[], expanded: boolean): { visible: T[]; hiddenCount: number; collapsible: boolean }` (mismo contrato que `splitProgressSteps`, solo cambia el nombre).
- Consumes: `itemsMissingFromLibrary`, que **no** se toca: el pie sigue contando todas las obras pendientes del grupo.

- [ ] **Step 1: Analizar el impacto antes de editar**

```powershell
node .gitnexus/run.cjs impact splitProgressSteps --direction upstream
node .gitnexus/run.cjs impact CollectionCard --direction upstream
```

Riesgo esperado: LOW. `splitProgressSteps` solo lo consume `ProgressTimelineCard`.

- [ ] **Step 2: Renombrar el módulo conservando la historia**

```powershell
git mv src/components/social/progress-collapse.ts src/components/social/feed-collapse.ts
git mv src/components/social/progress-collapse.test.ts src/components/social/feed-collapse.test.ts
```

En `feed-collapse.ts`, renombrar los dos exports y actualizar el comentario de cabecera:

```ts
// Cuántas filas se ven cuando una tarjeta agrupada está colapsada. Compartido
// por el timeline de progreso y la tarjeta de Colección.
export const COLLAPSE_VISIBLE = 2;

// Una tarjeta se colapsa solo si esconde MÁS DE UNA fila: con 3 se verían las 2
// primeras y un botón "ver 1 más" que no ahorra nada, así que el umbral es
// > COLLAPSE_VISIBLE + 1 (4+). Expandida devuelve todo pero mantiene
// `collapsible` para poder pintar el "ver menos".
export function splitCollapsedItems<T>(
  items: T[],
  expanded: boolean,
): { visible: T[]; hiddenCount: number; collapsible: boolean } {
  const collapsible = items.length > COLLAPSE_VISIBLE + 1;
  if (!collapsible || expanded) {
    return { visible: items, hiddenCount: 0, collapsible };
  }
  return {
    visible: items.slice(0, COLLAPSE_VISIBLE),
    hiddenCount: items.length - COLLAPSE_VISIBLE,
    collapsible,
  };
}
```

En `feed-collapse.test.ts`, actualizar el import y las llamadas a los nombres nuevos. En `progress-timeline-card.tsx`, línea 12 y línea 31:

```tsx
import { splitCollapsedItems } from "./feed-collapse";

  const { visible, hiddenCount, collapsible } = splitCollapsedItems(entry.items, expanded);
```

- [ ] **Step 3: Escribir el test que falla**

Añadir a `src/components/social/feed-collapse.test.ts`:

```ts
  it("no colapsa con 3 filas: esconder una sola no ahorra nada", () => {
    const out = splitCollapsedItems([1, 2, 3], false);
    expect(out).toEqual({ visible: [1, 2, 3], hiddenCount: 0, collapsible: false });
  });

  it("colapsa a partir de 4 filas mostrando 2", () => {
    const out = splitCollapsedItems([1, 2, 3, 4], false);
    expect(out).toEqual({ visible: [1, 2], hiddenCount: 2, collapsible: true });
  });

  it("expandido devuelve todo pero sigue siendo colapsable", () => {
    const out = splitCollapsedItems([1, 2, 3, 4], true);
    expect(out).toEqual({ visible: [1, 2, 3, 4], hiddenCount: 0, collapsible: true });
  });
```

- [ ] **Step 4: Ejecutar y observar RED**

```powershell
node node_modules/vitest/vitest.mjs run src/components/social/feed-collapse.test.ts
```

Expected: FAIL en el import — `splitCollapsedItems` no existe hasta aplicar el Step 2. Si el Step 2 ya se aplicó, los tres tests nuevos deben pasar directos: son el contrato que el rename preserva. En ese caso el RED real es el del Step 6, en la tarjeta.

- [ ] **Step 5: Añadir el copy**

En `messages/es.json`, dentro del objeto `feed.grouped` (junto a `addedCount` y `saveAllToQueue`):

```json
      "showMore": "ver {count, plural, one {# obra más} other {# obras más}}",
```

El «ver menos» ya existe como `feed.progress.showLess`; se reutiliza tal cual, sin duplicarlo.

- [ ] **Step 6: Colapsar `CollectionCard`**

En `src/components/social/collection-card.tsx`, añadir a los imports:

```tsx
import { useState } from "react";
import { splitCollapsedItems } from "./feed-collapse";
```

Dentro del componente, junto a `missingItems`:

```tsx
  const [expanded, setExpanded] = useState(false);
  const { visible, hiddenCount, collapsible } = splitCollapsedItems(entry.items, expanded);
```

Cambiar el `map` de la lista (línea 47) para que recorra `visible` en vez de `entry.items`:

```tsx
        {visible.map((item) => (
```

Y añadir el botón de expandir justo después de cerrar ese `<div className="flex flex-col">` (línea 77), **antes** del pie «Guardar los N»:

```tsx
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-lg py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-surface-muted"
        >
          {expanded ? t("progress.showLess") : t("grouped.showMore", { count: hiddenCount })}
        </button>
      )}
```

`missingItems`, el recuento del encabezado (`entry.items.length`) y el payload de `quickAddManyToLibrary` **no cambian**: siguen sobre `entry.items`. Ocultar filas es presentación; el pie sigue guardando todo lo pendiente del grupo.

- [ ] **Step 7: Verificar GREEN, tipos y lint**

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/components/social/feed-collapse.ts src/components/social/feed-collapse.test.ts src/components/social/collection-card.tsx src/components/social/progress-timeline-card.tsx
```

Expected: suite completa PASS, tsc exit 0, ESLint sin errores.

- [ ] **Step 8: Extender el E2E**

En `e2e/feed-tarjetas-por-tipo.spec.ts`, el caso de Colección siembra hoy 2 obras (`COL_BOOKS`). Ampliarlo a 4 —dos UUIDs de libro y dos de pase más, añadidos a `ALL_BOOKS` y `ALL_PASSES` para que `cleanFixtures()` los borre antes y en `finally`— y comprobar el colapso:

```ts
await expect(card.getByRole("link", { name: /\[E2E\] Colección/ })).toHaveCount(2);
await expect(card.getByRole("button", { name: /ver 2 obras más/i })).toHaveCount(1);
await card.getByRole("button", { name: /ver 2 obras más/i }).click();
await expect(card.getByRole("link", { name: /\[E2E\] Colección/ })).toHaveCount(4);
```

El pase activo del visitante (`VIEWER_COL_PASS`, sobre `COL_BOOKS[0]`) se conserva: con 4 obras y una ya en la biblioteca, el pie debe seguir diciendo «Guardar los 3», no «los 2» ni «los 1». Añadir esa aserción tras expandir.

- [ ] **Step 9: Ejecutar el E2E**

```powershell
npm run test:e2e -- feed-tarjetas-por-tipo --grep "un seguido con altas"
```

Expected: PASS. Comprobar antes que el 3000 está libre o que el único `next dev` es el de este worktree, y que `.env.local` existe en él — sin ese fichero la suite se auto-salta y sale verde sin probar nada.

- [ ] **Step 10: Commit final**

```powershell
git add src/components/social/feed-collapse.ts src/components/social/feed-collapse.test.ts src/components/social/collection-card.tsx src/components/social/progress-timeline-card.tsx messages/es.json e2e/feed-tarjetas-por-tipo.spec.ts
node .gitnexus/run.cjs detect_changes --scope staged
git diff --cached --check
git commit -m "feat(feed): colapsa las tarjetas de coleccion largas"
```

---

### Task 5: Cierre

- [ ] **Step 1: Sincronización documental**

Ejecutar el agente `backlog-scribe` para auditar la definición de hecho de `AGENTS.md`. Resultado esperado: `data-model.md` no cambia (sin esquema), `backlog.md` no cambia de estado, y la decisión de forma queda documentada por la spec aprobada. Solo editar documentos canónicos si el agente encuentra una afirmación que haya dejado de ser cierta.

- [ ] **Step 2: Abrir las issues de lo que queda fuera**

Los tres defectos detectados durante el diseño y excluidos a propósito de este plan **deben quedar como issue**, con repro y alcance (regla de `AGENTS.md`):

1. El día de agrupación y de orden sale de `eventDate.slice(0, 10)`, que es el día **UTC**: un alta a la 01:00 de Madrid cuenta como del día anterior.
2. `timeAgo` interpreta las fechas sin hora como medianoche UTC. La Task 2 cubre solo los eventos de hoy; los backdateados siguen arrancando con desfase.
3. El «hace x» se calcula en SSR y `suppressHydrationWarning` impide que React lo corrija al hidratar: una pestaña abierta una hora sigue diciendo «hace 2 minutos».

- [ ] **Step 3: Limpieza del entorno**

Cerrar el `next dev` que se haya levantado, confirmar el puerto 3000 libre, comprobar que los fixtures del E2E se borraron y que `git worktree list` no deja huérfanos, conforme a `AGENTS.md`.

---

## Self-Review

- **Cobertura de spec:** ventana de 2 días → Task 3; span para altas y hueco para sesiones → Task 3 Step 4; formación desde el más nuevo → Task 3 Step 2, test «parte las altas»; colapso 2/4 → Task 4 Steps 3-6; rename del módulo → Task 4 Step 2; copy nuevo → Task 4 Step 5; pie y encabezado sobre el total → Task 4 Step 6 y aserción del E2E; «hace x» siempre visible → Task 2 Step 7; clave `(día, created_at, id)` → Task 1 Step 4; cursor e `isAfterCursor` acoplados → Task 1 Steps 2 y 4, test de recorrido completo; `created_at` en los dos `select` → Task 2 Step 5; base del «hace x» de fechas sin hora → Task 2 Steps 2-5; orden de implementación 3→1→2 → Tasks 1-2, 3, 4; issues de lo excluido → Task 5 Step 2.
- **Placeholders:** ninguno. Cada paso que cambia código lleva el código.
- **Consistencia de tipos:** `sortDate` se declara obligatorio en `FeedEvent` y en las tres variantes de `FeedEntry` (Task 2 Step 4) y se rellena en las cinco fuentes —cuatro de persona más club— (Steps 5 y 6); el helper `person()` del test de agrupación lo gana en el Step 8 y `PersonGroupEntry` en el Step 9, que es donde TypeScript los exige. Los tests de la Task 3 usan los helpers reales del fichero, `ev()` y `person()`, no unos inventados. `splitCollapsedItems` / `COLLAPSE_VISIBLE` se usan con esos nombres en las Tasks 4 Steps 2, 3 y 6. `compareEntries` se consume con la misma firma en `feed.ts` y en `group-feed-entries.ts`.
- **Riesgo concentrado:** la Task 2 es la única que puede romper la paginación. Su red es el test de recorrido completo de la Task 1, que es puro y corre en milisegundos, más la verificación en navegador del Step 10.
