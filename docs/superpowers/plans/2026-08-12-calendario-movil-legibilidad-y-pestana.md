# Calendario móvil: legibilidad, agenda en columnas y pestaña — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer legible el calendario de club en móvil (iconos en la celda, hoja al tocar un día, leyenda plegable, agenda agrupada en columnas) y darle pestaña propia.

**Architecture:** Cinco cambios independientes sobre piezas que ya existen. El color y los iconos vienen de `MARK_ACCENT`/`accentKeyFor` (spec 2026-08-11), la etiqueta de `markLabel`, y la hoja sigue el patrón `<dialog>` que el repo ya usa. La única lógica nueva es una función pura de agrupación. Cero cambios de esquema.

**Tech Stack:** Next.js (App Router, RSC + client components), TypeScript, Tailwind v4, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-12-calendario-movil-legibilidad-y-pestana-design.md`

## Global Constraints

- **Cero SQL.** Ninguna tarea toca la base ni escribe migraciones.
- **Node 22 antes de cualquier `npx`/`npm`**, en CADA llamada de Bash: `export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"`. El shell por defecto resuelve Node v20 y Vitest muere con `node:util no exporta styleText`.
- **`node_modules` y `.env.local` YA están** en este worktree. No ejecutar `npm ci`.
- **No usar `git stash`**: la pila es compartida con otros worktrees y sesiones.
- **Los e2e mienten sin `.env.local`**: un solo `skipped` significa que el verde no vale. Y **córrelos por lotes**, nunca `club-` entero: 23 tests seguidos agotan la máquina y tumban el dev server (issue #584).
- **Solo móvil.** Nada de lo que hay aquí puede cambiar el escritorio (`lg:` arriba): ni los chips de la rejilla, ni la leyenda desplegada, ni la agenda de una columna del raíl. Si un cambio se nota en PC, está mal.
- **El icono es la señal no dependiente del color** (WCAG 1.4.1, #147) y vive en `MARK_ACCENT`. No se inventan iconos nuevos ni se colorea texto con el token: `accent.text` es para glifos y muestras.
- **Solo existe `messages/es.json`.**
- Comentarios y copy en español, explicando POR QUÉ.
- Tailwind v4 exige clases enteras y literales, nunca concatenadas.

---

### Task 1: `groupMarksByDay`

**Files:**
- Modify: `src/lib/clubs/activities/calendar-marks.ts`
- Test: `src/lib/clubs/activities/calendar-marks.test.ts`

**Interfaces:**
- Consumes: `CalendarMark` (ya existe en ese fichero)
- Produces:
  - `export type DayGroup = { date: string; marks: CalendarMark[] }`
  - `export function groupMarksByDay(marks: CalendarMark[]): DayGroup[]`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/clubs/activities/calendar-marks.test.ts`. El helper `actividad()` ya vive en ese fichero; estos tests construyen marcas con `buildCalendarMarks` para no duplicar la forma de `CalendarMark`.

```ts
describe("groupMarksByDay", () => {
  it("una lista vacía no produce grupos", () => {
    expect(groupMarksByDay([])).toEqual([]);
  });

  it("dos marcas del mismo día caen en UN grupo", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", title: "Uno", startsOn: "2026-07-04" }),
        actividad({ id: "b", kind: "evento", title: "Dos", startsOn: "2026-07-04" }),
      ],
      [],
      HOY,
      SLUG,
    );
    const grupos = groupMarksByDay(marks);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].date).toBe("2026-07-04");
    expect(grupos[0].marks.map((m) => m.title)).toEqual(["Uno", "Dos"]);
  });

  it("días distintos producen grupos distintos, en el orden de entrada", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", title: "Cuatro", startsOn: "2026-07-04" }),
        actividad({ id: "b", kind: "evento", title: "Nueve", startsOn: "2026-07-09" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(groupMarksByDay(marks).map((g) => g.date)).toEqual(["2026-07-04", "2026-07-09"]);
  });

  it("NO reordena: agrupa consecutivos y respeta el orden que recibe", () => {
    // Depende de que buildCalendarMarks entregue ordenado (ya testeado). Si esta
    // función reordenara, habría dos responsables del orden y podrían divergir.
    // Con una entrada desordenada a propósito, el mismo día partido en dos
    // grupos es el comportamiento CORRECTO, no un bug.
    const marks = buildCalendarMarks(
      [actividad({ id: "a", kind: "evento", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
    );
    const desordenada = [marks[0], { ...marks[0], date: "2026-07-09" }, marks[0]];
    expect(groupMarksByDay(desordenada).map((g) => g.date)).toEqual([
      "2026-07-04",
      "2026-07-09",
      "2026-07-04",
    ]);
  });

  it("no inventa días sin marcas entre dos fechas lejanas", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", startsOn: "2026-07-01" }),
        actividad({ id: "b", kind: "evento", startsOn: "2026-07-28" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(groupMarksByDay(marks)).toHaveLength(2);
  });
});
```

Añadir `groupMarksByDay` al `import` que ese fichero ya hace de `./calendar-marks`.

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx vitest run src/lib/clubs/activities/calendar-marks.test.ts
```

Expected: FAIL — `groupMarksByDay is not a function`.

- [ ] **Step 3: Implementar**

Al final de `src/lib/clubs/activities/calendar-marks.ts`:

```ts
export type DayGroup = { date: string; marks: CalendarMark[] };

/**
 * Agrupa marcas CONSECUTIVAS del mismo día. No ordena: depende de que `marks`
 * llegue ya ordenada por fecha ascendente, que es lo que garantiza (y testea)
 * `buildCalendarMarks`. Reordenar aquí crearía un segundo responsable del orden
 * y los dos podrían divergir -- el mismo motivo por el que `proximasMarcas`
 * tampoco reordena.
 */
export function groupMarksByDay(marks: CalendarMark[]): DayGroup[] {
  const grupos: DayGroup[] = [];
  for (const mark of marks) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.date === mark.date) ultimo.marks.push(mark);
    else grupos.push({ date: mark.date, marks: [mark] });
  }
  return grupos;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npx vitest run src/lib/clubs/activities/calendar-marks.test.ts
npx tsc --noEmit
```

Expected: PASS y sin errores de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/calendar-marks.ts src/lib/clubs/activities/calendar-marks.test.ts
git commit -m "feat(clubes): groupMarksByDay para agrupar la agenda por dia"
```

---

### Task 2: Iconos en la celda del mes (móvil)

**Files:**
- Modify: `src/components/clubs/calendar/month-grid.tsx`

**Interfaces:**
- Consumes: `MARK_ACCENT[accentKeyFor(mark)].Icon` y `.text`, ya importados en el fichero
- Produces: nada que consuma otra tarea

**Qué se sustituye exactamente.** El bloque `lg:hidden` de la celda pinta hoy un `<span>` redondo de 6 px por marca, coloreado con `bar` (un fondo). Pasa a pintar el glifo de la clase, coloreado con `text`.

- [ ] **Step 1: Reemplazar el bloque de puntos**

En `src/components/clubs/calendar/month-grid.tsx`, sustituir el `<div className="flex flex-wrap items-center gap-0.5 lg:hidden">` y su contenido por:

```tsx
              {/* Móvil: el GLIFO de la clase, no un punto de color. Un punto de
                  6 px obligaba a distinguir por tono —imposible para quien no
                  lo afina— y además contradecía a la leyenda, que habla de
                  iconos. Es la MISMA silueta que el chip de escritorio (#147). */}
              {visibles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 lg:hidden">
                  {visibles.map((mark, i) => {
                    const accent = MARK_ACCENT[accentKeyFor(mark)];
                    return (
                      <accent.Icon
                        key={`${mark.activityId}-${mark.markKind}-${i}`}
                        aria-hidden
                        className={`h-2.5 w-2.5 shrink-0 ${accent.text}`}
                      />
                    );
                  })}
                  {/* La campana del día va una sola vez, no por marca: con
                      glifos de 10 px pegados, una campana por marca deja la
                      celda ilegible -- justo lo que se viene a arreglar. Por lo
                      mismo desaparece el anillo que rodeaba el punto seguido:
                      alrededor de un glifo es ruido, y la campana ya lo dice. */}
                  {visibles.some((m) => m.followedByViewer) && (
                    <BellIcon className="h-2 w-2 shrink-0 text-accent" aria-hidden />
                  )}
                  {delDia.length > MAX_CHIPS && (
                    <span className="font-mono text-[8px] leading-none text-muted-foreground">
                      {t("calendarMore", { count: delDia.length - MAX_CHIPS })}
                    </span>
                  )}
                </div>
              )}
```

No se toca el bloque `hidden lg:flex` de debajo: el escritorio se queda exactamente igual.

- [ ] **Step 2: Typecheck, suite y lint**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
```

Expected: los tres limpios. `npm run lint` arrastra 27 problemas preexistentes en ficheros ajenos; lo que importa es no añadir ninguno.

- [ ] **Step 3: Mirarlo a 390 px**

```powershell
$env:PATH = "C:\Users\borja\AppData\Roaming\fnm\node-versions\v22.23.2\installation;$env:PATH"
npm run dev
```

Con el navegador a 390 px de ancho, abrir el calendario de un club y buscar un día con tres marcas y campana. **Comprobar que los tres glifos, la campana y el `+N` caben en la celda sin desbordar ni romper la altura de la fila.**

Si no caben, la salida es bajar `MAX_CHIPS` a 2 (la hoja del día de la Task 4 enseña el resto), **no** encoger el glifo por debajo de `h-2.5 w-2.5`: a menos de 10 px la silueta deja de distinguirse y se pierde justo lo que este cambio compra.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/calendar/month-grid.tsx
git commit -m "feat(clubes): la celda de movil pinta el icono de la clase, no un punto"
```

---

### Task 3: Leyenda plegable en móvil

**Files:**
- Modify: `src/components/clubs/calendar/club-calendar.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `LEYENDA_MARCAS`, `LEYENDA_EVENTOS`, `LEYENDA_LANZAMIENTOS`, `MARK_ACCENT` (ya importados)
- Produces: componente interno `LegendRows`, usado dos veces en el mismo fichero

**Por qué dos ramas y no una.** `<details>` se abre con el atributo `open`, que no tiene variante responsive en Tailwind: no se puede decir «cerrado en móvil, abierto en `lg`». La salida limpia es renderizar el `<details>` solo en móvil y las filas sueltas solo en `lg`, extrayendo las filas a un componente para no duplicarlas.

- [ ] **Step 1: Añadir la copy**

En `messages/es.json`, bloque `activity`, junto a `legendMarks`:

```json
    "legendToggle": "Leyenda",
```

- [ ] **Step 2: Extraer `LegendRows`**

En `src/components/clubs/calendar/club-calendar.tsx`, añadir junto a `LegendLabel` y `LegendItem` (al final del fichero):

```tsx
// Las tres filas, sin envoltorio: las montan DOS sitios -- el <details> de móvil
// y el bloque siempre-abierto de escritorio. Extraerlas evita la copia que si no
// haría falta, porque `open` de <details> no tiene variante responsive.
function LegendRows({
  t,
  seguidoBadge,
}: {
  t: (key: string) => string;
  /** La marca de «seguido», que solo se pinta si hay algo seguido este mes. */
  seguidoBadge: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <LegendLabel>{t("legendMarks")}</LegendLabel>
        {LEYENDA_MARCAS.map((key) => (
          <LegendItem key={key} accentKey={key} t={t} />
        ))}
        {seguidoBadge}
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
    </>
  );
}
```

- [ ] **Step 3: Sustituir el bloque de la leyenda**

Reemplazar el `<div className="flex flex-col gap-1.5 lg:ml-auto lg:items-end">` que hoy contiene las tres filas por:

```tsx
            {/* La marca de seguido también en la LEYENDA, no solo en la rejilla
                (§17): un icono nuevo en las celdas sin nada que lo explique
                obliga a adivinar qué significa. Solo se pinta si hay algo
                seguido este mes -- una leyenda para un símbolo que no aparece es
                ruido. */}
            {(() => {
              const seguidoBadge =
                viewerIsMember && seguidosDelMes.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-accent uppercase">
                    <BellIcon className="h-2.5 w-2.5" aria-hidden />
                    {t("eventFollowedBadge")}
                  </span>
                ) : null;

              return (
                <>
                  {/* Móvil: plegada. Ocupaba ~120 px antes de que empezara la
                      rejilla, que es justo el sitio que la rejilla necesita.
                      <details> nativo: cero JS, disclosure y teclado de serie.
                      NO persiste entre visitas a propósito -- el componente no
                      se remonta al cambiar de mes (el mes viaja por
                      pushState), así que quien la abre la conserva mientras
                      navega de mes, que es el caso real. */}
                  <details className="flex flex-col gap-1.5 lg:hidden">
                    <summary className="w-fit cursor-pointer font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
                      {t("legendToggle")}
                    </summary>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      <LegendRows t={t} seguidoBadge={seguidoBadge} />
                    </div>
                  </details>

                  {/* Escritorio: siempre abierta y sin disclosure, como hasta hoy. */}
                  <div className="hidden lg:ml-auto lg:flex lg:flex-col lg:items-end lg:gap-1.5">
                    <LegendRows t={t} seguidoBadge={seguidoBadge} />
                  </div>
                </>
              );
            })()}
```

- [ ] **Step 4: Typecheck, suite y lint**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
```

Expected: los tres limpios.

- [ ] **Step 5: Comprobar los dos tamaños**

Con `npm run dev`: a 390 px la leyenda aparece plegada tras «Leyenda» y la rejilla sube; al desplegarla salen las tres filas. A ≥1024 px se ve exactamente como antes, abierta y sin disclosure. **Comprobar además que al desplegarla y cambiar de mes con las flechas sigue desplegada** — es el caso que justifica no persistirla.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/calendar/club-calendar.tsx messages/es.json
git commit -m "feat(clubes): la leyenda del calendario se pliega en movil"
```

---

### Task 4: La hoja del día

**Files:**
- Create: `src/components/clubs/calendar/day-sheet.tsx`
- Modify: `src/components/clubs/calendar/month-grid.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `CalendarMark`, `markLabel`, `MARK_ACCENT`/`accentKeyFor`, `formatEventDate`
- Produces: `DaySheet({ date, marks, onClose })` — `date` a `null` significa cerrada

**El patrón a seguir** está en `src/components/clubs/list-challenge/item-connect-sheet.tsx`: `<dialog>` nativo, un `useEffect` que llama a `showModal()`/`close()`, y `onClose` del propio `<dialog>` para el Escape y el clic fuera. No inventar un modal nuevo.

- [ ] **Step 1: Añadir la copy**

En `messages/es.json`, bloque `activity`:

```json
    "daySheetClose": "Cerrar",
```

- [ ] **Step 2: Escribir `day-sheet.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatEventDate } from "@/lib/clubs/activities/format-date";
import { BellIcon, XIcon } from "@/components/ui/icons";
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";

// Al tocar un día del calendario en MÓVIL se abre esta hoja con TODAS sus
// marcas. Dos motivos: la celda solo cabe tres glifos y esconde el resto tras un
// «+N» que no dice cuáles (issue #583), y un glifo de 10 px identifica la clase
// pero no el título.
//
// Solo móvil: en escritorio el chip ya lleva el texto, y montar la hoja allí
// sería una segunda superficie que mantener sincronizada con la primera.
//
// <dialog> nativo, mismo patrón que list-challenge/item-connect-sheet.tsx: trae
// foco atrapado, Escape y backdrop sin escribirlos a mano.
export function DaySheet({
  date,
  marks,
  onClose,
}: {
  /** null = cerrada. El día que se está mirando, en ISO YYYY-MM-DD. */
  date: string | null;
  marks: CalendarMark[];
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (date && !dialog.open) dialog.showModal();
    if (!date && dialog.open) dialog.close();
  }, [date]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={date ? formatEventDate(date) : undefined}
      className="w-full max-w-md rounded-card border border-border bg-surface p-0 text-foreground backdrop:bg-scrim"
    >
      {date && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-lg leading-tight font-semibold">
              {formatEventDate(date)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("daySheetClose")}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <ul className="flex flex-col gap-2">
            {marks.map((mark, i) => {
              const accent = MARK_ACCENT[accentKeyFor(mark)];

              const inner = (
                <>
                  <span
                    className={`mb-1 inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
                  >
                    <accent.Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    {markLabel(mark, t)}
                    {mark.followedByViewer && (
                      <>
                        <BellIcon className="h-2.5 w-2.5 text-accent" aria-hidden />
                        <span className="sr-only">{t("eventFollowedBadge")}</span>
                      </>
                    )}
                  </span>
                  {/* text-foreground, no el token: a este tamaño el token no
                      llega a 4.5:1 sobre el tinte (#147). */}
                  <span className="block font-serif text-[14.5px] leading-tight font-semibold text-foreground">
                    {mark.title}
                  </span>
                </>
              );

              const clases = `block rounded-card border border-border px-3 py-2 ${
                mark.past ? "opacity-50" : ""
              }`;

              // Un HITO no tiene ficha propia: se comprueba `href`, nunca el kind.
              return (
                <li key={`${mark.activityId}-${mark.markKind}-${i}`}>
                  {mark.href ? (
                    <Link href={mark.href} className={`${clases} hover:bg-surface-muted`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={clases}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}
```

- [ ] **Step 3: Abrirla desde la celda**

En `month-grid.tsx`, añadir el estado y el import:

```ts
import { useState } from "react";
import { DaySheet } from "./day-sheet";
```

```tsx
  // El día cuya hoja está abierta. null = cerrada.
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
```

La celda pasa de `<div>` a `<button>` **solo cuando tiene marcas** — un día vacío no debe anunciarse como pulsable. Sustituir la apertura del `<div key={cell.date} …>` por:

```tsx
          const conMarcas = delDia.length > 0;
          const claseCelda = `flex aspect-square min-w-0 flex-col gap-1 border-r border-b border-border p-1.5 text-left last:border-r-0 lg:aspect-auto lg:min-h-[112px] lg:p-2 ${
            cell.outside ? "bg-surface-muted/50" : ""
          }`;
```

`contenido` es **exactamente lo que hoy vive dentro de ese `<div>`, sin cambiar una línea**: desde el `<span>` del número de día (`className="self-start rounded-md …"`) hasta el cierre del `<span className="sr-only lg:hidden">` del resumen del día, pasando por el bloque `lg:hidden` de glifos y el bloque `hidden lg:flex` de chips. Extráelo tal cual a una constante encima del `return`:

```tsx
          const contenido = (
            <>
              {/* …el contenido actual del div, movido sin modificar… */}
            </>
          );

          return conMarcas ? (
            <button
              key={cell.date}
              type="button"
              // La hoja es de MÓVIL: en escritorio el chip ya lleva el texto.
              // El botón se queda (no estorba) pero no abre nada desde `lg`.
              onClick={() => {
                if (window.matchMedia("(min-width: 1024px)").matches) return;
                setDiaAbierto(cell.date);
              }}
              className={claseCelda}
            >
              {contenido}
            </button>
          ) : (
            <div key={cell.date} className={claseCelda}>
              {contenido}
            </div>
          );
```

Y montar la hoja una sola vez, fuera de la rejilla, justo antes del cierre del componente:

```tsx
      <DaySheet
        date={diaAbierto}
        marks={diaAbierto ? (byDate.get(diaAbierto) ?? []) : []}
        onClose={() => setDiaAbierto(null)}
      />
```

- [ ] **Step 4: Typecheck, suite y lint**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
```

Expected: los tres limpios.

- [ ] **Step 5: Comprobarlo a mano**

Con `npm run dev`, a 390 px: tocar un día con marcas abre la hoja con **todas** (incluidas las que el `+N` esconde); Escape y el botón de cerrar la cierran; tocar un evento navega a su ficha; un día vacío no reacciona. A ≥1024 px, pulsar una celda **no** abre nada.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/calendar/day-sheet.tsx src/components/clubs/calendar/month-grid.tsx messages/es.json
git commit -m "feat(clubes): tocar un dia del calendario abre una hoja con sus marcas"
```

---

### Task 5: Agenda agrupada por día, en columnas

**Files:**
- Modify: `src/components/clubs/calendar/agenda-list.tsx`

**Interfaces:**
- Consumes: `groupMarksByDay` y `DayGroup` de Task 1; `formatEventDate` de `format-date`
- Produces: nada que consuma otra tarea

**Lo que cambia y lo que no.** La tarjeta pierde su bloque de fecha (`w-10` con día y mes), que pasa a la cabecera del grupo — es justo lo que la hace caber en media columna. El resto de la tarjeta (chip de clase, título, detalle, `AgendaFollowToggle` como hermano del enlace) se conserva tal cual. El estado vacío tampoco cambia.

**El filtro ya viene aplicado**: `club-calendar.tsx` pasa `marks` ya filtradas por «Todo / Sigues», así que agrupar aquí no puede dejar cabeceras huérfanas.

- [ ] **Step 1: Reescribir el render**

En `src/components/clubs/calendar/agenda-list.tsx`, cambiar los imports:

```ts
import {
  groupMarksByDay,
  type CalendarMark,
} from "@/lib/clubs/activities/calendar-marks";
import { formatEventDate } from "@/lib/clubs/activities/format-date";
```

(`formatDayMonth` deja de usarse aquí: quitarlo del import.)

Sustituir el `return (<ul …>)` completo por:

```tsx
  return (
    <div className="flex flex-col gap-4">
      {groupMarksByDay(marks).map((grupo) => (
        <section key={grupo.date} className="flex flex-col gap-2">
          {/* El día se escribe UNA vez por grupo. Antes cada tarjeta repetía su
              fecha: un mes de veinte eventos eran veinte bloques de fecha, y es
              lo que de verdad alargaba el scroll. */}
          <h3 className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {formatEventDate(grupo.date)}
          </h3>

          {/* Dos columnas en móvil, tres desde tablet. A 390 px cada tarjeta
              tiene ~185 px: el título se trunca antes que el chip de clase, que
              es lo que identifica la marca. */}
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {grupo.marks.map((mark, i) => {
              const accent = MARK_ACCENT[accentKeyFor(mark)];
              const esEvento = mark.markKind === "evento";

              const inner = (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`mb-1.5 inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
                  >
                    <accent.Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    {markLabel(mark, t)}
                    {/* La marca de seguido lleva icono Y texto accesible: no
                        depende del color, así que sobrevive a la escala de
                        grises y a un lector de pantalla (§17). */}
                    {mark.followedByViewer && (
                      <>
                        <BellIcon className="h-2.5 w-2.5 text-accent" aria-hidden />
                        <span className="sr-only">{t("eventFollowedBadge")}</span>
                      </>
                    )}
                  </span>
                  <span className="truncate font-serif text-[14.5px] leading-tight font-semibold text-foreground">
                    {mark.title}
                  </span>
                  {mark.detail && (
                    <span className="mt-1 truncate text-[11.5px] text-muted-foreground">
                      {mark.detail}
                    </span>
                  )}
                </span>
              );

              const clases = `flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 ${
                mark.past ? "opacity-50" : ""
              }`;

              // Un HITO sigue sin enlace: no tiene ficha propia. Se comprueba
              // `href`, nunca el kind.
              return (
                <li
                  key={`${mark.activityId}-${mark.markKind}-${i}`}
                  className="flex items-stretch overflow-hidden rounded-card border border-border bg-surface"
                >
                  {mark.href ? (
                    <Link href={mark.href} className={`${clases} hover:bg-surface-muted`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={clases}>{inner}</div>
                  )}

                  {/* El control de seguir es HERMANO del enlace, nunca dentro:
                      un <button> dentro de un <a> es HTML inválido y rompe el
                      tabulador. Y así pulsarlo no navega a ningún sitio. */}
                  {esEvento && viewerIsMember && !mark.past && (
                    <AgendaFollowToggle
                      activityId={mark.activityId}
                      title={mark.title}
                      following={mark.followedByViewer}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
```

El `<span className="sr-only">{formatEventDate(mark.date)}</span>` que había por tarjeta **se retira**: la fecha ya la anuncia la cabecera del grupo, y repetirla en cada tarjeta la haría oír dos veces.

- [ ] **Step 2: Typecheck, suite y lint**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
```

Expected: los tres limpios.

- [ ] **Step 3: Comprobar los tres anchos**

Con `npm run dev`, en un mes con varios eventos el mismo día: a 390 px dos columnas bajo una cabecera por día; a 768 px tres columnas; a ≥1024 px —donde la agenda vive en el raíl de 320 px— comprobar que **no se rompe**: ahí `grid-cols-2` sigue aplicando y las tarjetas quedan muy estrechas. Si se ve mal, acotar la rejilla con `lg:grid-cols-1` para devolver el raíl a una columna, que es como está hoy.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/calendar/agenda-list.tsx
git commit -m "feat(clubes): la agenda agrupa por dia y va en columnas"
```

---

### Task 6: Pestaña Calendario

**Files:**
- Modify: `src/components/clubs/club-tabs.tsx`
- Modify: `src/app/club/[slug]/page.tsx`
- Modify: `src/app/club/[slug]/calendario/page.tsx`

**Interfaces:**
- Consumes: nada nuevo
- Produces: `ClubTab` gana `"calendario"`; `CLUB_TABS` pasa a `["feed", "actividades", "calendario", "gestion"]`

**LA TRAMPA DE ESTA TAREA.** `src/app/club/[slug]/page.tsx` valida el parámetro con `CLUB_TABS.includes(tabParam as ClubTab)`. Al añadir `"calendario"` a esa lista, `?tab=calendario` pasa a ser **válido** en la página del club — que no tiene bloque que pintar para él y devolvería una página en blanco con el título «Calendario». Hay que redirigir a la ruta real.

- [ ] **Step 1: Dar a cada pestaña su href**

En `src/components/clubs/club-tabs.tsx`:

```ts
export type ClubTab = "feed" | "actividades" | "calendario" | "gestion";

export const CLUB_TABS: ClubTab[] = ["feed", "actividades", "calendario", "gestion"];

// El calendario es una RUTA propia (/club/[slug]/calendario), no un estado de la
// página del club: sus hermanas viven en `?tab=`, él no. Sin esta distinción la
// pestaña llevaría a `?tab=calendario`, que la página del club no sabe pintar.
// El componente tenía asumido que todas las pestañas eran lo primero.
function tabHref(basePath: string, tab: ClubTab): string {
  return tab === "calendario" ? `${basePath}/calendario` : `${basePath}?tab=${tab}`;
}
```

Y en el `<Link>`, sustituir `href={`${basePath}?tab=${tab}`}` por:

```tsx
            href={tabHref(basePath, tab)}
```

- [ ] **Step 2: Redirigir `?tab=calendario` a la ruta real**

En `src/app/club/[slug]/page.tsx`, justo después de resolver `requested` y ANTES de calcular `tab`:

```ts
  // `calendario` está en CLUB_TABS para que salga como pestaña, pero NO es un
  // estado de esta página: es otra ruta. Quien llegue con ?tab=calendario (un
  // enlace viejo, un marcador) va a la ruta de verdad en vez de ver esta página
  // en blanco.
  if (requested === "calendario") redirect(`/club/${club.slug}/calendario`);
```

`redirect` ya está importado en ese fichero.

Y estrechar el tipo de `tab`, que ya no puede ser `"calendario"` a partir de aquí:

```ts
  const tab: Exclude<ClubTab, "calendario"> =
    requested === "gestion" && !canModerate
      ? "feed"
      : ((requested as Exclude<ClubTab, "calendario">) ?? "feed");
```

- [ ] **Step 3: Pintar las pestañas en la página del calendario**

En `src/app/club/[slug]/calendario/page.tsx`, añadir el import:

```ts
import { ClubTabs } from "@/components/clubs/club-tabs";
```

Y sustituir el `mobileHeader` entero —**incluido su comentario, que ha dejado de ser cierto**— por:

```tsx
      mobileHeader={
        // Sin esto, en móvil no había ni nombre/portada del club ni forma de
        // volver salvo el atrás del navegador (el sidebar con esa identidad
        // solo se pinta desde `lg`). ClubHeader trae ambas cosas.
        //
        // Y SÍ se pintan las pestañas: desde la spec 2026-08-12 el calendario es
        // una pestaña más en móvil. Antes no lo era, y el resultado es que en
        // móvil no había forma de llegar aquí salvo el enlace «Ver calendario ›»
        // del resumen del club. En PC esto no se ve: el raíl lo sustituye, y ahí
        // el calendario ya era un par de Feed y Actividades.
        <>
          <ClubHeader club={club} userId={user.id} />
          <ClubTabs
            active="calendario"
            basePath={`/club/${club.slug}`}
            canModerate={canModerate}
            activityCount={canModerate ? pendingProposals : 0}
          />
        </>
      }
```

- [ ] **Step 4: Typecheck, suite y lint**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
```

Expected: los tres limpios.

- [ ] **Step 5: Comprobar las cuatro rutas**

Con `npm run dev`, a 390 px:

1. `/club/<slug>` → cuatro pestañas: Feed · Actividades · Calendario · Gestión (la última solo como moderador).
2. Pulsar Calendario → va a `/club/<slug>/calendario`, **no** a `?tab=calendario`, y la pestaña queda marcada como activa.
3. `/club/<slug>?tab=calendario` a mano → redirige a `/club/<slug>/calendario`.
4. A ≥1024 px las pestañas no se pintan (el raíl las sustituye) y nada ha cambiado.

**Comprobar además que las cuatro etiquetas caben a 390 px.** Si desbordan, reducir el `gap-6` del contenedor, **no** abreviar las etiquetas.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/club-tabs.tsx "src/app/club/[slug]/page.tsx" "src/app/club/[slug]/calendario/page.tsx"
git commit -m "feat(clubes): el calendario es una pestana mas en movil"
```

---

### Task 7: e2e, documentación y cierre

**Files:**
- Modify: `e2e/club-calendario.spec.ts`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

**Interfaces:** ninguna

- [ ] **Step 1: Ampliar el e2e del calendario**

En `e2e/club-calendario.spec.ts`, dentro del test que ya crea un evento y navega entre meses, añadir tras la creación:

```ts
    // La pestaña Calendario existe y lleva a la RUTA, no a ?tab=calendario
    // (spec 2026-08-12). Se comprueba desde la página del club, en viewport de
    // móvil: en escritorio las pestañas no se pintan.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/club/${CLUB_SLUG}`);
    await page.getByRole("link", { name: /^calendario$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/club/${CLUB_SLUG}/calendario$`));

    // Un ?tab=calendario a mano redirige a la ruta de verdad.
    await page.goto(`/club/${CLUB_SLUG}?tab=calendario`);
    await expect(page).toHaveURL(new RegExp(`/club/${CLUB_SLUG}/calendario$`));
```

Y un test nuevo al final del fichero. El fichero ya declara `const MES = "2027-09"` y `const FECHA = "2027-09-15"` (líneas 24-25) y tiene su `login()` en la 31: **reutilízalos, no declares constantes nuevas**. Para crear el evento y borrarlo, copia el patrón del primer test (línea 41): creación por API admin y borrado en `finally` con `fetch` nativo, nunca con el `request` de Playwright —ese fixture muere con el contexto del navegador y la limpieza no llega a correr si el test expira.

```ts
test("calendario: tocar un día en móvil abre la hoja con sus marcas", async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, EMAIL, PASSWORD);

  let eventoId: string | null = null;
  const titulo = `e2e hoja ${Date.now()}`;

  try {
    // …crear el evento en FECHA con el mismo patrón que el primer test…

    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=${MES}`);

    // La celda del día es un <button> SOLO cuando tiene marcas: si esto no
    // encuentra nada, o el evento no se creó o la celda sigue siendo un <div>.
    // El nombre accesible de la celda incluye el número de día y el resumen de
    // sus marcas, así que se ancla por el título del evento, que es único.
    await page.getByRole("button", { name: new RegExp(titulo, "i") }).click();

    const hoja = page.getByRole("dialog");
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText(titulo)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(hoja).not.toBeVisible();
  } finally {
    if (eventoId) {
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
```

Si el ancla por título no funciona porque el resumen `sr-only` de la celda no entra en su nombre accesible, la alternativa es anclar por el día (`name: /^15/`) y afirmar el título dentro de la hoja — pero **compruébalo antes de cambiarlo**, no lo asumas.

- [ ] **Step 2: Ejecutar el e2e del calendario**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
ls .env.local
npm run test:e2e -- club-calendario
```

Expected: todo PASS con **cero `skipped`**. Un solo "skipped" significa que `.env.local` no se lee y el verde es mentira.

**No correr `club-` entero**: 23 tests seguidos agotan la máquina y tumban el dev server (issue #584), produciendo fallos que parecen de código y no lo son.

- [ ] **Step 3: `backlog.md`**

Añadir tras la entrada «Eventos fuera de Actividades, y color por tipo»:

```markdown
- [x] **Calendario de club legible en móvil** (2026-08-12) — la celda del mes pinta el **icono** de la clase en vez de un punto de color (el punto obligaba a distinguir por tono a 6 px, y contradecía a una leyenda que habla de iconos); tocar un día abre una **hoja** con todas sus marcas, incluidas las que el `+N` esconde; la **leyenda se pliega** en móvil (ocupaba ~120 px antes de la rejilla); y la **agenda agrupa por día** en dos columnas (tres desde tablet), en vez de repetir la fecha en cada tarjeta. Además el **calendario pasa a ser una pestaña** en móvil (Feed · Actividades · Calendario · Gestión): antes solo se alcanzaba por el enlace «Ver calendario ›» del resumen. Sin migración. Spec: `docs/superpowers/specs/2026-08-12-calendario-movil-legibilidad-y-pestana-design.md`
```

- [ ] **Step 4: `decisiones.md`**

Añadir **al final** (append-only) las cinco entradas de la §10 de la spec. La quinta es la importante y debe decir explícitamente que **revierte** la decisión de 2026-07-22 («el calendario no es una pestaña más») y por qué: en móvil dejaba el calendario sin ninguna vía de acceso salvo un enlace del resumen del club. No se reescribe la entrada vieja.

- [ ] **Step 5: Abrir la issue de `Miembros`**

`Miembros` tiene el MISMO hueco que este plan le arregla al calendario: está en el raíl de PC pero no en las pestañas de móvil. Abrir issue con `gh issue create` explicando el paralelismo, que este plan lo dejó fuera a propósito, y que la duda es si caben cinco pestañas a 390 px o hace falta scroll horizontal.

- [ ] **Step 6: Verificación final**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
npx tsc --noEmit
npx vitest run
npm run lint
npm run test:e2e -- club-calendario
```

Expected: los cuatro en verde, e2e con cero `skipped`.

- [ ] **Step 7: Commit y push**

```bash
git add e2e/ docs/
git commit -m "docs(clubes): sincronizar backlog y decisiones con el calendario movil"
git push origin HEAD
```

- [ ] **Step 8: Limpiar el entorno**

No dejar `next dev` ni servidores de Playwright en segundo plano.

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

---

## Orden de dependencias

```
Task 1 (groupMarksByDay)
  └─ Task 5 (agenda agrupada)

Task 2 (iconos en la celda)   ← independiente
Task 3 (leyenda plegable)     ← independiente
Task 4 (hoja del día)         ← independiente, pero se aprecia mejor tras Task 2
Task 6 (pestaña)              ← independiente
Task 7 (e2e y docs)           ← el último
```

Cada tarea de la 1 a la 6 compila y pasa la suite por su cuenta: se pueden revisar y commitear una a una.
