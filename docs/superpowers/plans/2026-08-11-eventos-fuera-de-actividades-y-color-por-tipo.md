# Eventos fuera de Actividades y color por tipo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar los eventos del listado de la pestaña Actividades y que el calendario los pinte de color distinto según su `event_type` y, en los lanzamientos, según el medio de su ítem.

**Architecture:** Cero cambios de esquema — `event_type` y `config.item.itemType` ya existen desde PR #551 y solo hay que leerlos. El color del calendario deja de indexarse por `CalendarMarkKind` y pasa a un `MarkAccentKey` de ocho valores resuelto por `accentKeyFor(mark)`; los cuatro consumidores de `MARK_ACCENT` heredan color, tinte, borde e icono de golpe. La pestaña Actividades deja de agrupar eventos, y `EventCardActions` se borra porque la ficha del evento ya tiene `EventModeration`.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Supabase (solo lectura aquí), Tailwind v4 (tokens en `@theme`), next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-11-eventos-fuera-de-actividades-y-color-por-tipo-design.md`

## Global Constraints

- **Cero SQL.** Ninguna tarea de este plan escribe una migración ni toca la base. `event_type` y `config` ya existen; si alguna tarea parece necesitar un cambio de esquema, es que se ha entendido mal — parar y preguntar.
- **Node 22 obligatorio antes de cualquier `tsc`/`vitest`/`playwright`.** El shell no interactivo resuelve Node v20 y Vitest muere con `node:util no exporta styleText`. En CADA llamada de Bash: `export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"`.
- **Los e2e mienten sin `.env.local` en el worktree.** `playwright.config.ts` lo lee relativo al cwd; sin él cada spec con login hace `test.skip` y la suite sale **verde sin probar nada**. Muchos "skipped" = síntoma.
- **Nunca crear un junction a `node_modules` del repo padre.** `git worktree remove` lo sigue y vacía el del padre (issue #277).
- **Valores literales exactos:** `EventType` = `"encuentro" | "lanzamiento" | "fecha_destacada"` (`event-types.ts:6`). `ItemType` = `"book" | "movie" | "series"`. Las ocho claves de color son `inicio`, `hito`, `cierre`, `encuentro`, `fecha_destacada`, `lanzamiento_book`, `lanzamiento_movie`, `lanzamiento_series`.
- **`MARK_ACCENT` debe seguir siendo un `Record` exhaustivo** sobre su tipo de clave: es lo que hace que una clave nueva rompa la compilación en vez de quedarse sin color y sin icono en silencio.
- **El icono no es decoración**: desde #147 es la señal no dependiente del color que exige WCAG 1.4.1, y vive en el mismo `Record` que el color para que no acaben siendo dos mapas que divergen. Toda clave nueva necesita el suyo.
- **`text` colorea el ICONO y la muestra de leyenda, nunca el título del chip** (umbral 3:1 de objeto gráfico; el token vívido sobre tinte al 10% no llega a 4.5:1 para texto pequeño — medido en #147). El título va en `text-foreground`.
- **Tailwind v4 exige clases enteras y literales**, nunca concatenadas: `bg-type-book`, no `` `bg-${x}` ``.
- **Comentarios y copy en español**, explicando POR QUÉ. Solo existe `messages/es.json`.

---

### Task 0: Preparar el entorno del worktree

Sin esto, todo lo demás da falsos verdes o no arranca. No produce commit.

**Files:** ninguno (solo entorno)

**Interfaces:**
- Consumes: nada
- Produces: shell con Node 22, `node_modules` instalado, `.env.local` presente

- [ ] **Step 1: Exportar Node 22 y comprobarlo**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
node --version
```

Expected: `v22.23.2`. Este `export` **no persiste entre llamadas de Bash**: repetirlo al principio de cada bloque que ejecute algo.

- [ ] **Step 2: Instalar dependencias**

```bash
npm ci
```

Expected: termina sin error (varios minutos). No sustituir por un junction al `node_modules` del padre.

- [ ] **Step 3: Copiar `.env.local` del repo padre**

```bash
cp ../../../.env.local .env.local && ls -l .env.local
```

Expected: existe. Está en `.gitignore`, no se commitea.

- [ ] **Step 4: Comprobar que la base es verde**

```bash
npx vitest run
```

Expected: toda la suite en PASS. Si algo falla ya aquí, anotarlo antes de empezar — si no, no se sabrá qué rompió este plan.

---

### Task 1: La marca del calendario lleva `eventType` y `medium`

**Files:**
- Modify: `src/lib/clubs/activities/calendar-marks.ts`
- Modify: `src/lib/clubs/activities/calendar.ts`
- Test: `src/lib/clubs/activities/calendar-marks.test.ts`

**Interfaces:**
- Consumes: `EventType` y `parseEventConfig` de `./event-types`; `ItemType` de `@/lib/catalog/types`
- Produces: `CalendarMark` gana `eventType: EventType | null` y `medium: ItemType | null`. `CalendarActivityRow` gana `eventType: EventType | null` y `config: Json | null`. Ambos campos de la marca son `null` en toda marca que no sea un evento.

**Clave:** el medio NO se parsea a mano. Sale de `parseEventConfig(eventType, config)`, que ya existe, ya es tolerante y ya está testeado (`event-types.test.ts`). Escribir un segundo parser sería tener dos verdades sobre la misma `config`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir dentro del `describe("buildCalendarMarks", ...)` de `src/lib/clubs/activities/calendar-marks.test.ts`. **Antes**, ampliar el helper `actividad()` que ya vive en ese fichero con los dos campos nuevos (`eventType: null, config: null`) para que los casos existentes sigan compilando.

```ts
  it("un lanzamiento con ítem propaga tipo y medio", () => {
    const marks = buildCalendarMarks(
      [
        actividad({
          kind: "evento",
          title: "Dune 3",
          startsOn: "2026-07-04",
          eventType: "lanzamiento",
          config: { item: { itemType: "movie", itemId: "m1" }, allDay: true },
        }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("lanzamiento");
    expect(marks[0].medium).toBe("movie");
  });

  it("un lanzamiento SIN ítem deja el medio a null — config.item es nullable", () => {
    const marks = buildCalendarMarks(
      [
        actividad({
          kind: "evento",
          startsOn: "2026-07-04",
          eventType: "lanzamiento",
          config: { allDay: true },
        }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("lanzamiento");
    expect(marks[0].medium).toBeNull();
  });

  it("un encuentro no tiene medio", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04", eventType: "encuentro", config: {} })],
      [],
      HOY,
      SLUG,
    );
    expect(marks[0].eventType).toBe("encuentro");
    expect(marks[0].medium).toBeNull();
  });

  it("una actividad NO-evento deja los dos campos a null", () => {
    const marks = buildCalendarMarks(
      [actividad({ startsOn: "2026-07-20", endsOn: "2026-07-31" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.eventType)).toEqual([null, null]);
    expect(marks.map((m) => m.medium)).toEqual([null, null]);
  });

  it("un HITO de una actividad evento tampoco lleva tipo ni medio", () => {
    // La marca es del checkpoint, no del evento: heredar su tipo la pintaría
    // del color del lanzamiento en vez del de hito.
    const marks = buildCalendarMarks(
      [],
      [
        {
          id: "h1",
          label: "Capítulo 5",
          dueOn: "2026-07-30",
          activityId: "a1",
          activityTitle: "Un evento raro",
          activityKind: "evento",
          activityStatus: "active",
        } satisfies CalendarCheckpointRow,
      ],
      HOY,
      SLUG,
    );
    expect(marks[0].markKind).toBe("hito");
    expect(marks[0].eventType).toBeNull();
    expect(marks[0].medium).toBeNull();
  });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx vitest run src/lib/clubs/activities/calendar-marks.test.ts
```

Expected: FAIL — `Object literal may only specify known properties` sobre `eventType`, y `expected undefined to be 'lanzamiento'`.

- [ ] **Step 3: Ampliar los tipos y `buildCalendarMarks`**

En `src/lib/clubs/activities/calendar-marks.ts`, añadir imports:

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";
import { parseEventConfig, type EventType, type LanzamientoConfig } from "./event-types";
```

Añadir a `CalendarMark`, tras `followedByViewer`:

```ts
  /**
   * Los dos SOLO están puestos en una marca de evento (markKind === "evento").
   * En hito/inicio/cierre son null, incluido el hito de una actividad evento:
   * esa marca es del checkpoint, y heredar el tipo del evento la pintaría del
   * color equivocado.
   */
  eventType: EventType | null;
  /** El medio de un lanzamiento, de `config.item.itemType`. null si no es lanzamiento o no tiene ítem. */
  medium: ItemType | null;
```

Añadir a `CalendarActivityRow`:

```ts
  eventType: EventType | null;
  config: Json | null;
```

En el bucle de actividades, rama de evento, sustituir el `marks.push` por:

```ts
    if (activity.kind === "evento") {
      if (activity.startsOn) {
        // El medio sale del parser que ya existe, no de un segundo parser aquí:
        // `config` es opaca a la BD y `parseEventConfig` es su única puerta
        // tipada. Dos parsers sobre la misma jsonb son dos verdades.
        const eventType = activity.eventType;
        const config = eventType ? parseEventConfig(eventType, activity.config) : null;
        const medium =
          eventType === "lanzamiento"
            ? ((config as LanzamientoConfig).item?.itemType ?? null)
            : null;

        marks.push({
          date: activity.startsOn,
          markKind: "evento",
          title: activity.title,
          detail: null,
          activityId: activity.id,
          activityKind: activity.kind,
          href: `/club/${clubSlug}/evento/${activity.id}`,
          past: activity.startsOn < today,
          followedByViewer: followedEventIds.has(activity.id),
          eventType,
          medium,
        });
      }
      // Su ends_on se ignora SIEMPRE: el kind no lo usa.
      continue;
    }
```

En los otros tres `marks.push` (inicio, cierre, hito), añadir a cada uno:

```ts
      eventType: null,
      medium: null,
```

- [ ] **Step 4: Ampliar la consulta**

En `src/lib/clubs/activities/calendar.ts:55`, el `select` de `club_activities`:

```ts
      .select("id, kind, title, status, starts_on, ends_on, event_type, config", {
        count: "exact",
      })
```

Y el mapeo a `CalendarActivityRow` (`calendar.ts:96-105`):

```ts
  const activityRows: CalendarActivityRow[] = (actividades.data ?? []).map(
    (row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      // Igual que hace core.ts: event_type solo significa algo en un evento.
      eventType: row.kind === "evento" ? (row.event_type as EventType) : null,
      config: row.config,
    }),
  );
```

Añadiendo el import de `EventType` en `calendar.ts`.

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx vitest run src/lib/clubs/activities/calendar-marks.test.ts
npx tsc --noEmit
```

Expected: PASS y sin errores de tipo. (Los consumidores de `MARK_ACCENT` no cambian todavía: solo se han **añadido** campos.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/clubs/activities/calendar-marks.ts src/lib/clubs/activities/calendar.ts src/lib/clubs/activities/calendar-marks.test.ts
git commit -m "feat(clubes): la marca de calendario lleva el tipo del evento y el medio del lanzamiento"
```

---

### Task 2: `mark-accent.ts` — ocho claves de color, con su icono

**Files:**
- Modify: `src/components/clubs/calendar/mark-accent.ts`
- Modify: `src/app/globals.css`
- Test: `src/components/clubs/calendar/mark-accent.test.ts` (crear)

**Interfaces:**
- Consumes: `CalendarMark` de Task 1
- Produces:
  - `type MarkAccentKey` con las ocho claves
  - `const MARK_ACCENT: Record<MarkAccentKey, MarkAccent>` (`MarkAccent` no cambia de forma: sigue con `text`, `bgSoft`, `bar`, `border`, `Icon`)
  - `function accentKeyFor(mark: Pick<CalendarMark, "markKind" | "eventType" | "medium">): MarkAccentKey`
  - `const LEYENDA_MARCAS`, `LEYENDA_EVENTOS`, `LEYENDA_LANZAMIENTOS`: `MarkAccentKey[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/clubs/calendar/mark-accent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MARK_ACCENT,
  accentKeyFor,
  LEYENDA_MARCAS,
  LEYENDA_EVENTOS,
  LEYENDA_LANZAMIENTOS,
  type MarkAccentKey,
} from "./mark-accent";

function marca(over: Partial<Parameters<typeof accentKeyFor>[0]> = {}) {
  return {
    markKind: "evento" as const,
    eventType: "encuentro" as const,
    medium: null,
    ...over,
  };
}

describe("accentKeyFor", () => {
  it("markKind manda: un hito de una actividad evento sigue siendo hito", () => {
    expect(accentKeyFor(marca({ markKind: "hito", eventType: null }))).toBe("hito");
  });

  it("inicio y cierre pasan tal cual", () => {
    expect(accentKeyFor(marca({ markKind: "inicio", eventType: null }))).toBe("inicio");
    expect(accentKeyFor(marca({ markKind: "cierre", eventType: null }))).toBe("cierre");
  });

  it("encuentro y fecha_destacada tienen su clave", () => {
    expect(accentKeyFor(marca({ eventType: "encuentro" }))).toBe("encuentro");
    expect(accentKeyFor(marca({ eventType: "fecha_destacada" }))).toBe("fecha_destacada");
  });

  it("cada medio de lanzamiento tiene su clave", () => {
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "book" }))).toBe(
      "lanzamiento_book",
    );
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "movie" }))).toBe(
      "lanzamiento_movie",
    );
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "series" }))).toBe(
      "lanzamiento_series",
    );
  });

  it("un lanzamiento SIN ítem cae a fecha_destacada, no revienta", () => {
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: null }))).toBe(
      "fecha_destacada",
    );
  });

  it("una marca de evento sin eventType cae a fecha_destacada", () => {
    // No debería pasar (core.ts siempre lo puebla para kind evento), pero la
    // función es total: no puede devolver undefined y dejar la celda sin color.
    expect(accentKeyFor(marca({ eventType: null }))).toBe("fecha_destacada");
  });
});

describe("la leyenda cubre TODO MARK_ACCENT", () => {
  // El test que de verdad importa: si alguien añade una clave al Record y no la
  // coloca en ninguna fila, la leyenda dejaría de explicar un color que la
  // rejilla sí pinta -- la divergencia contra la que avisa el comentario del
  // fichero.
  it("las tres filas particionan las claves, sin huecos ni repetidos", () => {
    const todas = Object.keys(MARK_ACCENT).sort();
    const enLeyenda = [...LEYENDA_MARCAS, ...LEYENDA_EVENTOS, ...LEYENDA_LANZAMIENTOS].sort();
    expect(enLeyenda).toEqual(todas);
    expect(new Set(enLeyenda).size).toBe(enLeyenda.length);
  });

  it("la fila de marcas va en el orden de desempate de la rejilla", () => {
    const esperado: MarkAccentKey[] = ["inicio", "hito", "cierre"];
    expect(LEYENDA_MARCAS).toEqual(esperado);
  });

  it("la fila de lanzamientos va libro, película, serie", () => {
    const esperado: MarkAccentKey[] = [
      "lanzamiento_book",
      "lanzamiento_movie",
      "lanzamiento_series",
    ];
    expect(LEYENDA_LANZAMIENTOS).toEqual(esperado);
  });
});

describe("los colores de evento son distinguibles entre sí", () => {
  it("las cinco clases de evento tienen cinco barras distintas", () => {
    const barras = [
      "encuentro",
      "fecha_destacada",
      "lanzamiento_book",
      "lanzamiento_movie",
      "lanzamiento_series",
    ].map((k) => MARK_ACCENT[k as MarkAccentKey].bar);
    expect(new Set(barras).size).toBe(5);
  });

  it("cada clave tiene su propio icono, no todos el mismo", () => {
    const iconos = new Set(Object.values(MARK_ACCENT).map((a) => a.Icon));
    expect(iconos.size).toBe(Object.keys(MARK_ACCENT).length);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx vitest run src/components/clubs/calendar/mark-accent.test.ts
```

Expected: FAIL — `accentKeyFor is not a function`.

- [ ] **Step 3: Añadir el token `--event-highlight` a `globals.css`**

Cuatro sitios, con los valores exactos. En el bloque claro, junto a `--type-series: #7a5676;` (línea 80):

```css
  /* Azul de "fecha destacada" en el calendario del club. Token propio y no un
     reciclado: los otros siete de la leyenda ya están comprometidos (green =
     inicio, accent = hito, gold = cierre, spine = encuentro, type-* = los tres
     medios de lanzamiento), y dos clases con el mismo tono anulan el sentido de
     colorear por tipo. Azul porque es el hueco que queda tras terracota, teal,
     púrpura, verde, oro, naranja y beige. */
  --event-highlight: #4a6f9e;
```

En el bloque `.dark`, junto a `--type-series: #b592bd;` (línea 121):

```css
  --event-highlight: #7fa8d8;
```

En el `@media (prefers-color-scheme: dark)`, junto a `--type-series: #b592bd;` (línea 161):

```css
    --event-highlight: #7fa8d8;
```

En `@theme`, junto a `--color-type-series` (línea 204):

```css
  --color-event-highlight: var(--event-highlight);
```

- [ ] **Step 4: Reescribir `mark-accent.ts`**

Sustituir el fichero entero. `MarkAccent` (la forma) no cambia — solo la clave del `Record` y lo que hay dentro:

```ts
import type { ComponentType, SVGProps } from "react";
import type { ItemType } from "@/lib/catalog/types";
import type { EventType } from "@/lib/clubs/activities/event-types";
import {
  ORDEN_MARCA,
  type CalendarMark,
  type CalendarMarkKind,
} from "@/lib/clubs/activities/calendar-marks";
import {
  BookIcon,
  CheckIcon,
  FilmIcon,
  PlusIcon,
  SeriesIcon,
  StarIcon,
  TargetIcon,
  UsersIcon,
} from "@/components/ui/icons";

// El color del calendario ya NO se indexa por clase de marca: desde que un
// evento tiene `event_type` (PR #551), dos marcas `evento` del mismo día pueden
// ser cosas distintas -- una quedada y el estreno de una peli. La clave de color
// es su propio eje, con ocho valores.
//
// `Icon` es la señal NO dependiente del color (WCAG 1.4.1, issue #147): una
// silueta por clase, distinta en escala de grises, que el chip de escritorio y
// la leyenda comparten para que un deuteránope pueda casar "el chip con esta
// forma == esta entrada de la leyenda" sin fiarse del tono. Vive AQUÍ, junto al
// color, para no acabar con dos mapas por clase que diverjan.
//
// Tailwind v4 necesita las clases enteras y literales, nunca concatenadas.
// `text` colorea el ICONO y la muestra de la leyenda (objeto gráfico, umbral
// 3:1), NUNCA el título del chip: el token vívido sobre el tinte al 10% no llega
// a 4.5:1 para texto pequeño (gold da 2.63 en claro, medido en #147). El título
// va en `text-foreground` (>10:1) y el color de la clase viaja por icono, tinte
// (`bgSoft`) y borde (`border`).
export type MarkAccent = {
  text: string;
  bgSoft: string;
  bar: string;
  border: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export type MarkAccentKey =
  | "inicio"
  | "hito"
  | "cierre"
  | "encuentro"
  | "fecha_destacada"
  | "lanzamiento_book"
  | "lanzamiento_movie"
  | "lanzamiento_series";

// El orden de declaración de las tres últimas ES el de la fila "LANZAMIENTOS"
// de la leyenda (se deriva de Object.keys más abajo).
export const MARK_ACCENT: Record<MarkAccentKey, MarkAccent> = {
  inicio: {
    text: "text-green",
    bgSoft: "bg-green/10",
    bar: "bg-green",
    border: "border-green",
    Icon: PlusIcon,
  },
  hito: {
    text: "text-accent",
    bgSoft: "bg-accent/10",
    bar: "bg-accent",
    border: "border-accent",
    Icon: TargetIcon,
  },
  cierre: {
    text: "text-gold",
    bgSoft: "bg-gold/10",
    bar: "bg-gold",
    border: "border-gold",
    Icon: CheckIcon,
  },
  encuentro: {
    text: "text-spine",
    bgSoft: "bg-spine/10",
    bar: "bg-spine",
    border: "border-spine",
    Icon: UsersIcon,
  },
  fecha_destacada: {
    text: "text-event-highlight",
    bgSoft: "bg-event-highlight/10",
    bar: "bg-event-highlight",
    border: "border-event-highlight",
    Icon: StarIcon,
  },
  // OJO: el evento genérico usaba `type-series`, y NO puede seguir haciéndolo:
  // ese token pasa a significar "lanzamiento de serie", así que un encuentro y
  // el estreno de una serie serían el mismo púrpura.
  lanzamiento_book: {
    text: "text-type-book",
    bgSoft: "bg-type-book/10",
    bar: "bg-type-book",
    border: "border-type-book",
    Icon: BookIcon,
  },
  lanzamiento_movie: {
    text: "text-type-movie",
    bgSoft: "bg-type-movie/10",
    bar: "bg-type-movie",
    border: "border-type-movie",
    Icon: FilmIcon,
  },
  lanzamiento_series: {
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    bar: "bg-type-series",
    border: "border-type-series",
    Icon: SeriesIcon,
  },
};

// Record en vez de plantilla `lanzamiento_${medium}`: así el compilador
// comprueba que los tres medios tienen clave, en vez de fiarlo a un cast.
const LANZAMIENTO_POR_MEDIO: Record<ItemType, MarkAccentKey> = {
  book: "lanzamiento_book",
  movie: "lanzamiento_movie",
  series: "lanzamiento_series",
};

const EVENTO_POR_TIPO: Record<EventType, MarkAccentKey> = {
  encuentro: "encuentro",
  fecha_destacada: "fecha_destacada",
  // Solo se usa cuando el lanzamiento no tiene medio del que sacar color:
  // `config.item` es nullable y parseEventConfig lo deja a null ante cualquier
  // forma que no case. Un sexto color para "lanzamiento sin medio" sería una
  // entrada de leyenda que no significa nada para quien mira; el chip sí lo
  // dirá en texto ("Lanzamiento" a secas).
  lanzamiento: "fecha_destacada",
};

/**
 * `markKind` manda SIEMPRE, y solo desciende al tipo cuando la marca es un
 * evento. Un checkpoint de una actividad evento llega con markKind "hito" y
 * tiene que seguir pintándose de hito.
 *
 * Total por construcción: nunca devuelve undefined, ni siquiera para una marca
 * de evento sin `eventType` -- eso dejaría la celda sin color y sin icono.
 */
export function accentKeyFor(
  mark: Pick<CalendarMark, "markKind" | "eventType" | "medium">,
): MarkAccentKey {
  if (mark.markKind !== "evento") return mark.markKind;
  if (!mark.eventType) return "fecha_destacada";
  if (mark.eventType === "lanzamiento" && mark.medium) {
    return LANZAMIENTO_POR_MEDIO[mark.medium];
  }
  return EVENTO_POR_TIPO[mark.eventType];
}

// Las tres filas de la leyenda se DERIVAN de las claves del Record, nunca se
// escriben a mano: una clave nueva aparece sola en su fila. Dos constantes
// gemelas acabarían divergiendo y la leyenda contradiría a la rejilla sin que
// nada avisara (es el mismo motivo por el que ORDEN_MARCA se importa en vez de
// copiarse).
const TODAS = Object.keys(MARK_ACCENT) as MarkAccentKey[];

const CLASES_DE_MARCA = new Set<string>(["inicio", "hito", "cierre"]);

/** Fila 1: las clases estructurales, en el mismo orden que desempata la rejilla. */
export const LEYENDA_MARCAS: MarkAccentKey[] = TODAS.filter((k) =>
  CLASES_DE_MARCA.has(k),
).sort((a, b) => ORDEN_MARCA[a as CalendarMarkKind] - ORDEN_MARCA[b as CalendarMarkKind]);

/** Fila 2: los eventos que no son lanzamientos. */
export const LEYENDA_EVENTOS: MarkAccentKey[] = TODAS.filter(
  (k) => !CLASES_DE_MARCA.has(k) && !k.startsWith("lanzamiento_"),
);

/** Fila 3: los medios de lanzamiento, en el orden de declaración del Record. */
export const LEYENDA_LANZAMIENTOS: MarkAccentKey[] = TODAS.filter((k) =>
  k.startsWith("lanzamiento_"),
);
```

`ORDEN_MARCA` sigue teniendo la clave `evento`, que ya no aparece en `LEYENDA_MARCAS`. Eso es correcto y no se toca: `ORDEN_MARCA` desempata **marcas del mismo día** en `buildCalendarMarks`, que sigue trabajando con `CalendarMarkKind`. Son dos ejes distintos y este fichero solo lo usa para ordenar la primera fila.

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
npx vitest run src/components/clubs/calendar/mark-accent.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Typecheck — se espera que FALLE en los consumidores**

```bash
npx tsc --noEmit
```

Expected: FAIL en `month-grid.tsx`, `agenda-list.tsx`, `club-calendar.tsx` y `club-summary.tsx` — `MARK_ACCENT[mark.markKind]` ya no indexa. Task 3 los arregla. **No parchear aquí.**

- [ ] **Step 7: Commit (junto con Task 3)**

Esta tarea no compila sola. Su commit va al final de Task 3.

---

### Task 3: Las cuatro superficies y la etiqueta de texto

**Files:**
- Create: `src/components/clubs/calendar/mark-label.ts`
- Test: `src/components/clubs/calendar/mark-label.test.ts`
- Modify: `src/components/clubs/calendar/month-grid.tsx`
- Modify: `src/components/clubs/calendar/agenda-list.tsx`
- Modify: `src/components/clubs/calendar/club-calendar.tsx`
- Modify: `src/components/clubs/club-summary.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `accentKeyFor`, `MARK_ACCENT`, `LEYENDA_MARCAS`, `LEYENDA_EVENTOS`, `LEYENDA_LANZAMIENTOS` de Task 2; `CalendarMark` de Task 1
- Produces: `function markLabel(mark: CalendarMark, t: (key: string) => string): string`

**Los seis sitios que dicen `markKind_${...}` hoy** (`grep -rn 'markKind_' src/`): `agenda-list.tsx:52`, `club-calendar.tsx:155`, `month-grid.tsx:120`, `month-grid.tsx:137`, `month-grid.tsx:165`, `club-summary.tsx:133`. Los cinco primeros que hablan de una MARCA pasan a `markLabel`; el de la leyenda (`club-calendar.tsx:155`) pasa a `markAccent_${key}`, que es otro eje.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/clubs/calendar/mark-label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { markLabel } from "./mark-label";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";

// Traductor de mentira que devuelve la clave: así el test comprueba QUÉ claves
// se piden, sin depender de la copy real (que puede cambiar sin ser un bug).
const t = (key: string) => key;

function marca(over: Partial<CalendarMark> = {}): CalendarMark {
  return {
    date: "2026-08-01",
    markKind: "evento",
    title: "t",
    detail: null,
    activityId: "a",
    activityKind: "evento",
    href: null,
    past: false,
    followedByViewer: false,
    eventType: "encuentro",
    medium: null,
    ...over,
  };
}

describe("markLabel", () => {
  it("hito, inicio y cierre usan su clave de siempre", () => {
    expect(markLabel(marca({ markKind: "hito" }), t)).toBe("markKind_hito");
    expect(markLabel(marca({ markKind: "inicio" }), t)).toBe("markKind_inicio");
    expect(markLabel(marca({ markKind: "cierre" }), t)).toBe("markKind_cierre");
  });

  it("un lanzamiento dice de qué medio es", () => {
    expect(markLabel(marca({ eventType: "lanzamiento", medium: "movie" }), t)).toBe(
      "eventType_lanzamiento · eventMedium_movie",
    );
  });

  it("un lanzamiento sin ítem dice solo 'Lanzamiento' — el texto sigue siendo cierto", () => {
    expect(markLabel(marca({ eventType: "lanzamiento", medium: null }), t)).toBe(
      "eventType_lanzamiento",
    );
  });

  it("encuentro y fecha destacada se nombran por su tipo", () => {
    expect(markLabel(marca({ eventType: "encuentro" }), t)).toBe("eventType_encuentro");
    expect(markLabel(marca({ eventType: "fecha_destacada" }), t)).toBe(
      "eventType_fecha_destacada",
    );
  });

  it("una marca de evento sin tipo cae a la etiqueta genérica", () => {
    expect(markLabel(marca({ eventType: null }), t)).toBe("markKind_evento");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx vitest run src/components/clubs/calendar/mark-label.test.ts
```

Expected: FAIL — `Failed to resolve import "./mark-label"`.

- [ ] **Step 3: Escribir `mark-label.ts`**

```ts
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";

// El proyecto no declara `IntlMessages`, así que la `t` de next-intl acepta
// string y esta firma encaja sin castear.
type Translate = (key: string) => string;

/**
 * Qué dice el chip de una marca. El color NUNCA es la única señal: sin este
 * texto, el estreno de una peli y el de una serie solo se distinguirían por el
 * tono y por la silueta del icono (WCAG 1.4.1).
 *
 * Un lanzamiento sin ítem dice "Lanzamiento" a secas: su color es el genérico,
 * pero el texto sigue siendo cierto.
 */
export function markLabel(mark: CalendarMark, t: Translate): string {
  if (mark.markKind !== "evento") return t(`markKind_${mark.markKind}`);
  if (!mark.eventType) return t("markKind_evento");
  if (mark.eventType === "lanzamiento" && mark.medium) {
    return `${t("eventType_lanzamiento")} · ${t(`eventMedium_${mark.medium}`)}`;
  }
  return t(`eventType_${mark.eventType}`);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npx vitest run src/components/clubs/calendar/mark-label.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Añadir la copy**

En `messages/es.json`, bloque `activity`, junto a las claves `markKind_*` (línea ~1014). **`markKind_evento` se queda**: la usa `markLabel` como caída genérica.

```json
    "eventType_encuentro": "Encuentro",
    "eventType_lanzamiento": "Lanzamiento",
    "eventType_fecha_destacada": "Fecha destacada",
    "eventMedium_book": "Libro",
    "eventMedium_movie": "Película",
    "eventMedium_series": "Serie",
    "legendMarks": "Marcas",
    "legendEvents": "Eventos",
    "legendPremieres": "Lanzamientos",
    "markAccent_inicio": "Empieza",
    "markAccent_hito": "Hito",
    "markAccent_cierre": "Cierre",
    "markAccent_encuentro": "Encuentro",
    "markAccent_fecha_destacada": "Fecha destacada",
    "markAccent_lanzamiento_book": "Libro",
    "markAccent_lanzamiento_movie": "Película",
    "markAccent_lanzamiento_series": "Serie",
```

Puede que `eventType_*` ya existan en otro bloque para la ficha del evento. **Comprobar antes con `grep -n 'eventType_' messages/es.json`**: si ya están dentro de `activity`, reutilizarlas y no duplicarlas.

- [ ] **Step 6: `month-grid.tsx` — tres sitios**

Imports:

```ts
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";
```

Línea 96 (los puntos de móvil):

```tsx
                      className={`h-1.5 w-1.5 rounded-full ${MARK_ACCENT[accentKeyFor(mark)].bar} ${
```

Línea 116 y el `title` de la 120:

```tsx
                  const accent = MARK_ACCENT[accentKeyFor(mark)];
```

```tsx
                      title={`${markLabel(mark, t)} · ${mark.title}`}
```

Línea 137 y 165 (los dos `sr-only`):

```tsx
                      <span className="sr-only">{markLabel(mark, t)}: </span>
```

```tsx
                        `${markLabel(m, t)}: ${m.title}${
```

- [ ] **Step 7: `agenda-list.tsx` — dos sitios**

```ts
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";
```

Línea 35 y 52:

```tsx
        const accent = MARK_ACCENT[accentKeyFor(mark)];
```

```tsx
                {markLabel(mark, t)}
```

- [ ] **Step 8: `club-summary.tsx` — un sitio**

```ts
import { MARK_ACCENT, accentKeyFor } from "./calendar/mark-accent";
import { markLabel } from "./calendar/mark-label";
```

Líneas 118 y 133:

```tsx
              const accent = MARK_ACCENT[accentKeyFor(mark)];
```

```tsx
                      {mark.detail ?? markLabel(mark, t)}
```

- [ ] **Step 9: Leyenda de tres filas en `club-calendar.tsx`**

Sustituir el import y borrar la constante `CLASES_LEYENDA` con su comentario (queda obsoleto):

```ts
import {
  MARK_ACCENT,
  LEYENDA_MARCAS,
  LEYENDA_EVENTOS,
  LEYENDA_LANZAMIENTOS,
  type MarkAccentKey,
} from "./mark-accent";
```

Y quitar de los imports de `calendar-marks` los que dejan de usarse aquí (`ORDEN_MARCA`, `CalendarMarkKind`), que ahora viven dentro de `mark-accent.ts`.

Sustituir el `<div className="flex flex-wrap gap-3 lg:ml-auto">` que envuelve `CLASES_LEYENDA.map(...)` por tres filas, **conservando dentro el bloque de "seguido"** que hoy va detrás del map (`viewerIsMember && seguidosDelMes.length > 0 && ...`), que pasa a la primera fila:

```tsx
            {/* Tres filas, no una tira de ocho: "qué clase de marca es", "qué
                clase de evento es" y "de qué medio es el lanzamiento" son tres
                preguntas, y mezcladas en una línea envuelven en móvil. Las tres
                se DERIVAN de las claves de MARK_ACCENT, así que una clave nueva
                aparece sola en su sitio. */}
            <div className="flex flex-col gap-1.5 lg:ml-auto lg:items-end">
              <div className="flex flex-wrap items-center gap-3">
                <LegendLabel>{t("legendMarks")}</LegendLabel>
                {LEYENDA_MARCAS.map((key) => (
                  <LegendItem key={key} accentKey={key} t={t} />
                ))}
                {/* La marca de seguido también en la LEYENDA, no solo en la
                    rejilla (§17): un icono nuevo en las celdas sin nada que lo
                    explique obliga a adivinar qué significa. Solo se pinta si
                    hay algo seguido este mes -- una leyenda para un símbolo que
                    no aparece es ruido. */}
                {viewerIsMember && seguidosDelMes.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-accent uppercase">
                    <BellIcon className="h-2.5 w-2.5" aria-hidden />
                    {t("eventFollowedBadge")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <LegendLabel>{t("legendEvents")}</LegendLabel>
                {LEYENDA_EVENTOS.map((key) => (
                  <LegendItem key={key} accentKey={key} t={t} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <LegendLabel>{t("legendPremieres")}</LegendLabel>
                {LEYENDA_LANZAMIENTOS.map((key) => (
                  <LegendItem key={key} accentKey={key} t={t} />
                ))}
              </div>
            </div>
```

Y añadir los dos componentes al final del fichero:

```tsx
function LegendLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] tracking-wide text-foreground-faint uppercase">
      {children}
    </span>
  );
}

function LegendItem({
  accentKey,
  t,
}: {
  accentKey: MarkAccentKey;
  t: (key: string) => string;
}) {
  const accent = MARK_ACCENT[accentKey];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
      {/* Glifo (forma + color), no un punto de color: es la MISMA silueta que el
          chip de la rejilla, así el que no distingue los tonos empareja
          leyenda↔chip por la forma (#147). */}
      <accent.Icon className={`h-2.5 w-2.5 ${accent.text}`} aria-hidden />
      {t(`markAccent_${accentKey}`)}
    </span>
  );
}
```

- [ ] **Step 10: Typecheck y suite completa**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
```

Expected: los tres limpios.

- [ ] **Step 11: Mirar los colores de verdad, en claro y en oscuro**

Este paso no es opcional: `spine` se eligió para el lienzo oscuro del grafo de sagas y `--event-highlight` nace en esta tarea. Ambos se ven en la leyenda sobre `--surface`.

```powershell
$env:PATH = "C:\Users\borja\AppData\Roaming\fnm\node-versions\v22.23.2\installation;$env:PATH"
npm run dev
```

Abrir `/club/test-public-club/calendario`. Comprobar en tema claro Y oscuro que las cinco clases de evento se distinguen entre sí y del fondo. El umbral que aplica es 3:1 (objeto gráfico): el token colorea icono, tinte y borde, nunca el título.

Si un tono no llega, ajustar el hex del token — **no** reciclar otro ya comprometido.

- [ ] **Step 12: Commit (Tasks 2 y 3 juntas)**

```bash
git add src/components/clubs/calendar/ src/components/clubs/club-summary.tsx src/app/globals.css messages/es.json
git commit -m "feat(clubes): el calendario pinta cada evento segun su tipo y su medio"
```

---

### Task 4: Sacar los eventos de la pestaña Actividades

**Files:**
- Modify: `src/lib/clubs/activities/group-activities.ts`
- Modify: `src/lib/clubs/activities/group-activities.test.ts`
- Modify: `src/components/clubs/activity-list.tsx`
- Delete: `src/components/clubs/event-card-actions.tsx`
- Modify: `messages/es.json` (borrar `groupEvents`)

**Interfaces:**
- Consumes: nada nuevo
- Produces: `groupActivities(activities: ClubActivity[]): ActivityGroups` — **sin** el parámetro `today` y **sin** la propiedad `events`. `ActivityGroups` queda `{ active, proposed, finished }`.

- [ ] **Step 1: Reescribir el test**

Reemplazar el bloque `describe("groupActivities", ...)` de `src/lib/clubs/activities/group-activities.test.ts`. El `describe("isPastEvent", ...)` y su import **se quedan tal cual**.

```ts
describe("groupActivities — los eventos viven en el calendario y en su ficha, no aquí", () => {
  it("un evento activo no está en ninguno de los tres grupos", () => {
    const groups = groupActivities([
      act({ id: "e", kind: "evento", status: "active", startsOn: "2026-08-01" }),
      act({ id: "a", kind: "buddy_read", status: "active" }),
    ]);
    expect(groups.active.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proposed).toHaveLength(0);
    expect(groups.finished).toHaveLength(0);
  });

  it("un evento ARCHIVADO tampoco cae en finalizadas — es el que se olvida", () => {
    const groups = groupActivities([
      act({ id: "e", kind: "evento", status: "archived", startsOn: "2026-08-01" }),
      act({ id: "f", kind: "tierlist", status: "finished" }),
    ]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f"]);
  });

  it("un evento 'finished' tampoco: el filtro es por kind, no por estado", () => {
    const groups = groupActivities([
      act({ id: "e", kind: "evento", status: "finished", startsOn: "2026-08-01" }),
    ]);
    expect(groups.finished).toHaveLength(0);
  });

  it("propuestas y finalizadas no-evento se agrupan como antes", () => {
    const groups = groupActivities([
      act({ id: "p", status: "proposed" }),
      act({ id: "f", status: "finished" }),
      act({ id: "ar", status: "archived" }),
    ]);
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f", "ar"]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx vitest run src/lib/clubs/activities/group-activities.test.ts
```

Expected: FAIL — el evento archivado sigue apareciendo en `groups.finished`, y `groupActivities` recibe un argumento de menos.

- [ ] **Step 3: Reescribir `group-activities.ts`**

Sustituir desde `export type ActivityGroups` hasta el final, dejando `isPastEvent` donde está:

```ts
export type ActivityGroups = {
  active: ClubActivity[];
  proposed: ClubActivity[];
  /** Finalizadas y archivadas. Sin eventos: los archivados también salen. */
  finished: ClubActivity[];
};
```

(el comentario y el cuerpo de `isPastEvent` no se tocan, pero su comentario gana una línea final:)

```ts
// Ya NO la usa groupActivities (los eventos salieron de la pestaña), pero sí
// activity-card.tsx, que atenúa cualquier actividad activa cuya fecha de inicio
// ya pasó -- no solo eventos.
```

```ts
// Los eventos NO se agrupan aquí: viven en el calendario y en su ficha propia
// (spec 2026-08-11). Se filtran por `kind`, no por estado, y en los tres grupos
// -- el que se olvida es `finished`, donde caía el evento ARCHIVADO y seguiría
// a la vista.
//
// Por eso esta función ya no necesita `today`: lo usaba solo para ordenar los
// eventos (futuros antes que pasados), y ese grupo ya no existe.
export function groupActivities(activities: ClubActivity[]): ActivityGroups {
  const sinEventos = activities.filter((a) => a.kind !== "evento");

  return {
    active: sinEventos.filter((a) => a.status === "active"),
    proposed: sinEventos.filter((a) => a.status === "proposed"),
    finished: sinEventos.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
```

- [ ] **Step 4: Actualizar `activity-list.tsx`**

Borrar el import de `EventCardActions` (línea 10) y el `<Group>` de eventos entero (líneas ~50-59). La desestructuración pasa a:

```tsx
  const { active, proposed, finished } = groupActivities(activities);
```

**La prop `today` de `ActivityList` NO se toca.** Deja de pasarse a `groupActivities`, pero se sigue usando en las líneas 56, 68, 77 y 87 para las tarjetas, así que ni la prop ni el `today={todayISO()}` de `src/app/club/[slug]/page.tsx:150` se quitan. Quitarla sería romper el atenuado de las actividades pasadas.

- [ ] **Step 5: Borrar `EventCardActions`**

```bash
git rm src/components/clubs/event-card-actions.tsx
```

Ya no se monta en ningún sitio: la ficha del evento tiene `EventModeration` (editar, cancelar, posponer, reprogramar), que hace más. Dejarlo huérfano sería código muerto que el siguiente lector cree vivo.

El comentario de `event-moderation.tsx:14-15` dice «la tarjeta del muro sigue con sus dos controles de siempre (EventCardActions), que no se toca» — **ha dejado de ser cierto**. Actualizarlo:

```ts
// Editar, cancelar, posponer y reprogramar. Vive en la ficha porque ahí es donde
// el evento tiene sitio para explicarse, y desde la spec 2026-08-11 es el ÚNICO
// sitio: los eventos salieron del listado de Actividades y EventCardActions se
// borró con él.
```

Y `event-form.tsx:116` menciona `EventCardActions` al explicar por qué sus ids son por instancia. Ese motivo sigue en pie por otras razones (la ficha monta el formulario), así que solo hay que corregir la referencia muerta, no borrar el comentario.

- [ ] **Step 6: Borrar la copy huérfana**

En `messages/es.json`, borrar la línea `"groupEvents": "Fechas señaladas",`.

- [ ] **Step 7: Comprobar que no queda ninguna referencia**

```bash
grep -rn "groupEvents\|EventCardActions\|groups.events" src/ messages/
```

Expected: sin resultados. (`e2e/` sí tendrá referencias a "Fechas señaladas": las arregla Task 5.)

- [ ] **Step 8: Ejecutar y verificar que pasa**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: todo limpio.

- [ ] **Step 9: Commit**

```bash
git add -A src/lib/clubs/activities/group-activities.ts src/lib/clubs/activities/group-activities.test.ts src/components/clubs/ messages/es.json
git commit -m "feat(clubes): los eventos salen del listado de actividades"
```

---

### Task 5: e2e

**Files:**
- Modify: los specs de `e2e/` que anclen en "Fechas señaladas" o en la tarjeta de evento de la pestaña Actividades

**Interfaces:**
- Consumes: todo lo anterior
- Produces: nada que consuma otra tarea

- [ ] **Step 1: Localizar lo que se rompe**

```bash
grep -rn "Fechas señaladas\|editar evento\|tab=actividades" e2e/
```

Cada acierto es un ancla que hay que reapuntar. Anotar la lista completa **antes** de tocar nada: el objetivo es que ninguno quede a medias.

- [ ] **Step 2: Reapuntar cada ancla**

Regla de conversión, por sitio:

- **Ver que el evento existe** → mirarlo en la agenda del calendario, anclando por su encabezado, **no** con `getByRole("complementary")`: `ClubShell` pinta su propio `<aside>` de sidebar y el rol casa dos veces, lo que aborta el modo estricto de Playwright.

  ```ts
  const agenda = page
    .locator("aside")
    .filter({ has: page.getByRole("heading", { name: "Agenda" }) });
  ```

- **Editar / archivar desde la tarjeta** → hacerlo en la ficha del evento (`/club/{slug}/evento/{id}`), donde vive `EventModeration`.

- **Añadir el assert que este cambio hace posible**: el evento **no** aparece en la pestaña Actividades. Esperar PRIMERO algo positivo, para que la ausencia no sea trivialmente cierta por no haber cargado nada:

  ```ts
  await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
  await expect(
    page.getByRole("button", { name: /proponer actividad/i }).first(),
  ).toBeVisible();
  await expect(page.getByText(titulo)).toHaveCount(0);
  ```

- **Añadir el assert del color/etiqueta**: el chip de un lanzamiento de película dice `Lanzamiento · Película`. Comprobar el TEXTO, no la clase de Tailwind: la clase es un detalle de implementación y el texto es lo que hace accesible la distinción.

- [ ] **Step 3: Ejecutar los e2e de club**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
ls .env.local
npm run test:e2e -- club-
```

Expected: todo PASS con **cero `skipped`**. Un solo "skipped" significa que falta `.env.local` y el verde es mentira.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(clubes): los e2e de evento anclan en el calendario y la ficha, no en la pestana"
```

---

### Task 6: Documentación y cierre

**Files:**
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

**Interfaces:** ninguna

Un cambio no está "hecho" hasta que el doc canónico correspondiente vuelve a ser cierto. **`data-model.md` NO se toca**: este plan no cambia el esquema.

- [ ] **Step 1: `backlog.md`**

Localizar la entrada de eventos de club:

```bash
grep -n -i "fechas señaladas\|eventos de club" docs/requirements/backlog.md
```

Esa entrada termina en «grupo "Fechas señaladas" en la lista de actividades» y **ha dejado de ser cierta**. Corregir esa cola, y añadir una entrada nueva ya marcada:

```markdown
- [x] **Eventos fuera de Actividades, y color por tipo** — los eventos salen del listado de actividades (viven en el calendario y en su ficha) y el calendario los colorea por `event_type`, y en los lanzamientos por el medio de su ítem. Sin migración: el dato ya existía desde los tipos de evento. Spec: `docs/superpowers/specs/2026-08-11-eventos-fuera-de-actividades-y-color-por-tipo-design.md`
```

- [ ] **Step 2: `decisiones.md`**

Añadir **al final** (append-only, sin reescribir las anteriores) las cinco entradas de la §8 de la spec:

1. El color se indexa por `MarkAccentKey` (8 valores), no por `CalendarMarkKind`.
2. El medio sale de `config.item.itemType`, sin campo nuevo.
3. `fecha_destacada` estrena `--event-highlight`; `encuentro` toma `spine`.
4. Un lanzamiento sin ítem cae a `fecha_destacada`.
5. `EventCardActions` se borra, no se reubica: la ficha ya tiene `EventModeration`.

- [ ] **Step 3: Chequeo de deriva**

```bash
cat docs/DRIFT-CHECK.md
```

Seguir el chequeo que describa.

- [ ] **Step 4: Abrir issues de lo que quede suelto**

Todo lo pendiente, dudoso o descubierto de refilón va como issue en el repo — no en el cuerpo de la PR ni en un `TODO`. Escrita para quien la lea en seis meses sin contexto: qué falla y qué se esperaba, cómo reproducirlo, qué acota el problema.

Candidatos previsibles:
- `MAX_CHIPS = 3` en la rejilla: un día con cuatro eventos esconde colores sin decir cuáles. No lo empeora este cambio, pero sí lo hace más visible — antes los escondidos eran del mismo color que los visibles.
- Si algún tono no llegó al 3:1 y hubo que ajustar el hex, la elección queda sin validar por nadie con ojo de diseño.

- [ ] **Step 5: Verificación final**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
npm run test:e2e -- club-
```

Expected: los cuatro en verde, e2e con cero `skipped`.

- [ ] **Step 6: Commit y push**

```bash
git add docs/
git commit -m "docs(clubes): sincronizar backlog y decisiones con eventos por tipo en el calendario"
git push -u origin HEAD
```

- [ ] **Step 7: Limpiar el entorno**

No dejar `next dev`, watchers de Vitest ni servidores de Playwright en segundo plano.

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

---

## Orden de dependencias

```
Task 0 (entorno)
  └─ Task 1 (la marca lleva eventType y medium)
       └─ Task 2 (mark-accent + token) ──┐
                                          ├─ commit conjunto
            Task 3 (las 4 superficies) ──┘
                 └─ Task 5 (e2e)

Task 4 (retirada de Actividades)  ← independiente de 1-3
Task 6 (docs y cierre)            ← el último
```

Tasks 2 y 3 dejan el árbol sin compilar entre medias, a propósito: partirlas más obligaría a escribir código puente que se borra acto seguido.
