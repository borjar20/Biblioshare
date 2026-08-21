# Variedad gráfica y panel adaptativo del muro — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el muro de `/estadisticas` deje de ser 33 tarjetas del mismo ancho de las que 18 no dibujan, sin relajar ninguno de los nueve principios de `docs/design/paneles-estadisticos.md`.

**Architecture:** Tres fases en tres PRs. **A** cambia el ritmo (panel héroe a tres columnas) y añade tres formas nuevas (`lollipop`, `waffle`, `bullet`) más `area`, que ya existe sin consumidor — cero consultas nuevas. **B** hace que `viz` deje de ser un valor fijo de la spec y lo elija `derive()` según cuántos puntos haya, más los dos niveles de vacío. **C** añade `dumbbell` con su consumidor y cinco estadísticas sobre columnas que ya están en producción.

**Tech Stack:** Next.js (App Router, server components), TypeScript, Tailwind v4 con tokens en `src/app/globals.css`, Vitest (`npm test`), Playwright (`npm run test:e2e`), Supabase con RLS.

**Spec:** `docs/superpowers/specs/2026-08-21-muro-estadisticas-variedad-grafica-design.md`
**Mockup:** <https://claude.ai/code/artifact/57990194-d7be-49d9-bb7a-292d940ed8ca>

---

## Global Constraints

Aplican a **todas** las tareas. No se repiten en cada una.

- **Sin librerías de gráficos.** `package.json` no tiene ninguna y no se añade. Cada forma es HTML/CSS con Tailwind, o SVG inline cuando la forma lo pida (el donut ya es SVG; barras, medidor y apiladas son `div` con flex). Se elige como lo eligió el código existente: SVG solo para arcos y curvas.
- **El color nunca es el único canal** (principio 2). Toda serie lleva glifo de forma y nombre. Medido: `--type-movie` y `--type-series` tienen ΔE 1,1 en deuteranopia.
- **Colores por token, nunca hex literal.** `var(--accent)`, `var(--green)`, `var(--type-book)`. La paleta oscura sale gratis; con hex, no.
- **`SELF_DESCRIBING` es un contrato, no una lista.** Añadir un `viz` ahí obliga a que su gráfico **escriba sus cifras** y que **cada marca sea focalizable con teclado** (`tabIndex={0}`, `role="img"`, `aria-label` con el valor exacto). Si no llega a eso, se queda fuera y conserva su tabla. No hay término medio. Ver `stat-panel.tsx:50-70`.
- **Un hueco no es un cero** (principio 4). `null` = no se midió, se lee «Sin datos». `0` = se midió y salió cero. Prohibida la altura mínima cosmética.
- **Nada de `use cache`** en ningún getter de este plan: todos dependen de `auth.uid()` vía RLS. Cachear uno es una fuga de datos **entre cuentas** que no se ve en desarrollo — regla #437 de `AGENTS.md`.
- **Comentarios en castellano**, explicando el *porqué* y no el *qué*, como el resto de `src/lib/stats/` y `src/components/stats/`.
- **Un commit por tarea**, con el prefijo que toque (`feat`, `fix`, `refactor`, `test`, `docs`).
- Verificación: `npm test` y `npx tsc --noEmit` en verde antes de cada commit. `npm run lint` antes de cerrar cada fase.

### Corrección sobre la spec: el selector de faceta no se hace

La spec §4.3 proponía colapsar los tres rankings de nota (`nota-generos`, `nota-autores`, `nota-directores`, `specs.ts:272-274`) en un panel con selector de faceta.

**Choca con una regla explícita del código.** `src/lib/stats/filter.ts:4-6`: *«acota TODOS los paneles de la vista a la vez — **nunca hay un filtro por panel**: dos filtros distintos en la misma pantalla hacen imposible saber qué compara cada cifra con cuál»*. `page.tsx:114` lo repite: *«Una sola fila de filtros para TODO el muro (nunca filtros por panel)»*.

**Qué se hace en su lugar:** los tres paneles se quedan, pero pasan a `lollipop` (Task A3) y **dejan de ir seguidos** (Task A7 los reordena). El problema real era tres *listas de texto idénticas* en fila; como tres gráficos separados por otro panel, desaparece sin inventar un concepto de filtro nuevo.

Si aun así se quiere el colapso, `faceta` tendría que ser un filtro **global** en la fila de filtros, y eso es una excepción deliberada a una regla documentada: va a `decisiones.md` antes de escribirse, no después.

### Corrección sobre la spec: `dumbbell` se mueve a la fase C

La spec lo listaba en §4.2 (fase A). En fase A **no tiene consumidor**: su primer usuario es `relecturas`, que es fase C. Construirlo antes es YAGNI. Se hace en Task C1, justo antes del panel que lo usa.

---

## File Structure

**Fase A**
- `src/lib/stats/panel/types.ts` — `PanelViz` gana tres valores; `PanelSpec` gana `hero?`.
- `src/components/stats/panel/charts.tsx` — tres componentes nuevos + tres `case` en `Chart`.
- `src/components/stats/panel/stat-panel.tsx` — `SELF_DESCRIBING` y `TEXTUAL` cambian.
- `src/lib/stats/panel/specs.ts` — los paneles cambian de `viz`; se marcan los héroes; se reordena Valoraciones.
- `src/app/estadisticas/page.tsx` — `[column-span:all]` para el héroe.
- `src/lib/stats/panel/specs.test.ts` — **nuevo**: invariantes de sección (un héroe, y primero).
- `src/components/stats/panel/charts.test.tsx` — **nuevo**: que las formas nuevas escriben cifra y son focalizables.

**Fase B**
- `src/lib/stats/panel/derive.ts` — `PanelDerived.viz` y la tabla de degradación.
- `src/components/stats/panel/stat-panel.tsx` — los seis sitios pasan a `derived.viz`; niveles 1 y 2.
- `src/lib/stats/panel/types.ts` — `structurallyEmpty?`, `empty.elsewhere?`.
- `src/lib/stats/panel/derive.test.ts` — **nuevo**: la tabla de degradación, caso a caso.

**Fase C**
- `src/lib/stats/get-rereads.ts`, `get-drop-reasons.ts`, `get-notes-per-work.ts` — **nuevos**.
- `src/lib/stats/get-pace.ts` — extendido con páginas/hora.
- `src/lib/stats/panel/specs.ts` — los paneles nuevos.
- `src/app/estadisticas/page.tsx` — los getters nuevos entran en el mismo `Promise.all`.

Los ficheros nuevos de fase C son uno por getter, siguiendo el patrón de `src/lib/stats/`: cada uno exporta la función pura testable y la que consulta, como hace `get-pace.ts` con `computePagesPerDay` / `getPagesPerDay`.

---

# FASE A — ritmo y formas

### Task A1: `hero` — el panel que ocupa las tres columnas

**Files:**
- Modify: `src/lib/stats/panel/types.ts` (bloque `PanelSpec`)
- Modify: `src/lib/stats/panel/specs.ts:613` (`calendario-anual`), `:824` (`backlog`)
- Modify: `src/app/estadisticas/page.tsx:315-320`
- Test: `src/lib/stats/panel/specs.test.ts` (crear)

**Interfaces:**
- Produces: `PanelSpec.hero?: true`. Task C2 lo usará en el panel `relecturas`.

- [ ] **Step 1: Construir la fixture de `StatsInput`**

Esto va **primero** porque lo usan A1, A2, B3 y varias de fase C, y porque es lo único de la fase que lleva trabajo mecánico de verdad.

Crear `src/lib/stats/panel/__fixtures__/stats-input.ts` con una factoría:

```ts
import type { StatsInput } from "../specs";

/**
 * Entrada completa y NO vacía para los tests del muro: cada campo trae el
 * mínimo que hace que su panel tenga algo que decir. Sin esto, media docena de
 * secciones caen en estado vacío y los invariantes de sección no se llegan a
 * evaluar.
 *
 * `Partial` en el argumento para que cada test tumbe solo el campo que le
 * interesa (`statsInput({ formats: … })`) sin repetir los otros veintitrés.
 */
export function statsInput(over: Partial<StatsInput> = {}): StatsInput {
  return { /* los 24 campos, ver abajo */ ...over };
}
```

`StatsInput` (`specs.ts:135`) tiene **24 campos**, y hay que rellenarlos los 24:

`period` · `itemFilter` · `metric` · `titles` · `todayISO` · `activity` · `byYear` ·
`rating` · `topRated` · `type` · `status` · `hours` · `catalog` · `habits` · `records` ·
`streaks` · `tbr` · `health` · `facets` · `formats` · `calendar` · `pagesPerDay`

Para cada uno, abrir el getter que lo produce (`src/lib/stats/get-*.ts`) y copiar la forma de su tipo de retorno, con un dato mínimo pero **no vacío**: una obra, una sesión, un mes, un año. `todayISO` fijo (`"2026-08-21"`) — nunca `new Date()`, que rompe la pureza y hace que el test falle un martes.

**Cómo se sabe que está completa:** `npx tsc --noEmit`. Si falta un campo o una forma no cuadra, no compila. No hace falta más verificación que esa.

- [ ] **Step 2: Escribir el test que falla**

Crear `src/lib/stats/panel/specs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStatsSections } from "./specs";
import { statsInput as input } from "./__fixtures__/stats-input";

describe("invariante del panel héroe", () => {
  it("como mucho un héroe por sección", () => {
    for (const section of buildStatsSections(input())) {
      const heroes = section.panels.filter((p) => p.hero);
      expect(heroes.length, `sección ${section.id}`).toBeLessThanOrEqual(1);
    }
  });

  it("el héroe, si lo hay, es el primer panel de su sección", () => {
    for (const section of buildStatsSections(input())) {
      const i = section.panels.findIndex((p) => p.hero);
      if (i !== -1) expect(i, `sección ${section.id}`).toBe(0);
    }
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/panel/specs.test.ts`
Expected: FAIL — `Property 'hero' does not exist on type 'PanelSpec'`.

- [ ] **Step 4: Añadir el campo a `PanelSpec`**

En `src/lib/stats/panel/types.ts`, dentro de `PanelSpec`, tras `viz`:

```ts
  /**
   * El panel que preside su sección: ocupa las TRES columnas del masonry.
   *
   * UNO por sección como mucho, y el primero de la lista. Dos héroes seguidos
   * parten la sección en bandas y el masonry deja de tener sentido — que es
   * justo el motivo por el que la rejilla se descartó (ver page.tsx).
   *
   * Se marca por NECESITAR EL ANCHO, no por importancia: 53 semanas de
   * calendario en un tercio de tarjeta son ilegibles; una cifra grande no gana
   * nada por ocupar tres veces más.
   */
  hero?: true;
```

- [ ] **Step 5: Marcar los dos héroes de fase A**

En `specs.ts`, añadir `hero: true` a la spec de `calendario-anual` (junto a `viz: "heatmap"`, línea ~622) y a la de `backlog` (junto a `viz: "line"`, línea ~834). Comprobar que en `allSections` ambos son el **primer** panel de su sección; si no, moverlos al principio del array de su sección.

- [ ] **Step 6: Ejecutar el test**

Run: `npx vitest run src/lib/stats/panel/specs.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Pintarlo a tres columnas**

En `src/app/estadisticas/page.tsx`, sustituir el `map` de paneles (línea ~316):

```tsx
              {section.panels.map((spec) => (
                // h3: los paneles cuelgan del título de su sección, que es h2.
                // El héroe rompe la multicolumna con `column-span: all` — la
                // multicolumna sí sabe hacer esto, y es lo que evita volver a
                // `grid`, descartada arriba por igualar el alto de cada fila.
                <div key={spec.id} className={spec.hero ? "[column-span:all]" : undefined}>
                  <StatPanel spec={spec} headingLevel={3} />
                </div>
              ))}
```

⚠️ El `key` se mueve al `div` envolvente. `[&>*]:mb-4` y `[&>*]:break-inside-avoid` del contenedor siguen aplicando al `div`, que es ahora el hijo directo.

- [ ] **Step 8: Verificar en el navegador**

Run: `npm run dev` (**puerto 3000**; si está ocupado por una sesión anterior, matarlo antes — `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`, luego `Stop-Process -Id <pid>`. Nunca levantar un segundo).
Abrir `/estadisticas` y comprobar en tres anchos: **una** columna (móvil), **dos** (`lg`) y **tres** (`xl`). Expected: el calendario ocupa el ancho completo de su sección en los tres; las tarjetas siguientes fluyen debajo sin hueco muerto.

- [ ] **Step 9: Commit**

```bash
git add src/lib/stats/panel/types.ts src/lib/stats/panel/specs.ts src/lib/stats/panel/specs.test.ts src/lib/stats/panel/__fixtures__/stats-input.ts src/app/estadisticas/page.tsx
git commit -m "feat(estadisticas): panel heroe a tres columnas en el muro"
```

---

### Task A2: `area` en «Horas por mes»

El componente ya existe (`charts.tsx:844`, `LineChart ... area`) y no lo usa ningún panel. Es rama muerta desde que se escribió.

**Files:**
- Modify: `src/lib/stats/panel/specs.ts:1695`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/stats/panel/specs.test.ts`, añadir:

```ts
it("horas por mes es un area, no barras: es serie temporal continua", () => {
  const panels = buildStatsSections(input()).flatMap((s) => s.panels);
  const horas = panels.find((p) => p.id === "horas-por-mes");
  expect(horas?.viz).toBe("area");
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/panel/specs.test.ts -t "horas por mes"`
Expected: FAIL — `expected 'bars' to be 'area'`.

- [ ] **Step 3: Cambiar la línea**

En `specs.ts:1695`, dentro de la spec de `horas-por-mes`:

```ts
    viz: "area",
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run src/lib/stats/panel/specs.test.ts -t "horas por mes"`
Expected: PASS.

- [ ] **Step 5: Comprobar que `area` sigue en `SELF_DESCRIBING`**

`area` ya está en la lista (`stat-panel.tsx:70`). No se toca. Verificar en el navegador que el panel **no** pinta tabla de valores y que **sí** escribe las cifras dentro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats/panel/specs.ts src/lib/stats/panel/specs.test.ts
git commit -m "feat(estadisticas): horas por mes pasa a area, que ya estaba implementada sin consumidor"
```

---

### Task A3: `lollipop` — los siete rankings dejan de ser texto

**Files:**
- Modify: `src/lib/stats/panel/types.ts` (`PanelViz`)
- Modify: `src/components/stats/panel/charts.tsx` (componente + `case`)
- Modify: `src/components/stats/panel/stat-panel.tsx` (`TEXTUAL`, `SELF_DESCRIBING`, los dos `spec.viz === "ranking"`)
- Modify: `src/lib/stats/panel/specs.ts` — los siete: `ratedGroupPanel` (`:991`), `directores` (`:1080`), `editoriales` (`:1105`), `mejor-valoradas` (`:1605`), `autores` (`:1795`)
- Test: `src/components/stats/panel/charts.test.tsx` (crear)

**Interfaces:**
- Consumes: `PanelDatum` tal cual (`key`/`label`/`value`/`detail`) — ningún getter cambia.
- Produces: `LollipopChart({ spec, derived, interactive })`, misma firma que `BarsChart`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/stats/panel/charts.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { derive } from "@/lib/stats/panel/derive";
import { UNITS, type PanelSpec } from "@/lib/stats/panel/types";
import { LollipopChart } from "./charts";

function spec(over: Partial<PanelSpec> = {}): PanelSpec {
  return {
    id: "t",
    title: "Prueba",
    context: { period: "2026" },
    viz: "lollipop",
    unit: UNITS.stars,
    data: [
      { key: "a", label: "Le Guin", value: 4.7, detail: "6 obras" },
      { key: "b", label: "Calvino", value: 4.5, detail: "3 obras" },
      { key: "c", label: "Asimov", value: null },
    ],
    ...over,
  };
}

describe("lollipop", () => {
  it("escribe el valor exacto de cada punto: es lo que sustituye a la tabla", () => {
    const s = spec();
    render(<LollipopChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByText("4,7")).toBeTruthy();
    expect(screen.getByText("4,5")).toBeTruthy();
  });

  it("cada marca medida es focalizable y dice su dato completo", () => {
    const s = spec();
    render(<LollipopChart spec={s} derived={derive(s)} interactive />);
    const mark = screen.getByLabelText("Le Guin: 4,7 ★");
    expect(mark.getAttribute("tabindex")).toBe("0");
  });

  it("un hueco no se dibuja como cero ni es focalizable", () => {
    const s = spec();
    render(<LollipopChart spec={s} derived={derive(s)} interactive />);
    // El `null` se lee «Sin datos», no «0», y no entra en el recorrido de foco.
    expect(screen.queryByLabelText(/Asimov: 0/)).toBeNull();
    expect(screen.getByText("Sin datos")).toBeTruthy();
  });
});
```

⚠️ **Es la primera vez que el repo renderiza un componente en un test**; hasta ahora todo el testing de paneles era de lógica pura (`summary.test.ts`). Dos cosas que hay que montar en este paso, y solo en este:

1. `npm i -D @testing-library/react @testing-library/dom jsdom`
2. **La primera línea del fichero de test es la pragma**, no un cambio en la config:

```tsx
// @vitest-environment jsdom
```

`vitest.config.ts:10` declara `environment: "node"` para **todo** el proyecto. Cambiarlo a `jsdom` globalmente metería un DOM en los ~40 ficheros de test de lógica pura que no lo necesitan: más lentos, y con `window` disponible donde hoy no lo está, que es justo lo que hace que un `import` de servidor pase el test y reviente en producción. La pragma afecta solo a este fichero.

La misma línea va en los otros dos ficheros de test de componente de este plan: `stat-panel.test.tsx` (B2) y el resto de `charts.test.tsx`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx`
Expected: FAIL — `LollipopChart is not exported from './charts'`.

- [ ] **Step 3: Añadir el valor al tipo**

En `types.ts`, dentro de `PanelViz`, tras `"heatmap"`:

```ts
  | "lollipop"
```

- [ ] **Step 4: Escribir el componente**

En `charts.tsx`, antes de `Legend`:

```tsx
/**
 * Ranking dibujado: etiqueta · tallo · punto · valor exacto.
 *
 * Sustituye a `ranking`, que era una lista de texto. Se eligió el lollipop y no
 * la barra maciza por dos motivos: siete paneles de ranking más cinco de barras
 * dejaban el muro lleno de bloques, y los nombres de autor y editorial son
 * largos — el tallo fino deja sitio a la etiqueta que la barra se come.
 *
 * La escala arranca en el MÍNIMO, no en cero, cuando la unidad es una nota:
 * entre 3,4 y 4,7 sobre un eje 0–5 todos los puntos caen juntos en el extremo
 * derecho y el ranking deja de verse. Con `works` sí arranca en cero, porque
 * ahí el cero significa algo.
 */
export function LollipopChart({ spec, derived, interactive }: ChartProps) {
  const zeroBased = spec.unit !== UNITS.stars;
  const floor = zeroBased ? 0 : Math.min(...derived.known.map((d) => d.value)) * 0.94;
  const span = Math.max(derived.scale - floor, 0.001);

  return (
    <ul className="flex flex-col gap-1.5">
      {spec.data.map((d) => {
        const probe = interactive && d.value !== null;
        const pct = d.value === null ? 0 : ((d.value - floor) / span) * 100;
        return (
          <li
            key={d.key}
            className="group relative grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            tabIndex={probe ? 0 : undefined}
            role={probe ? "img" : undefined}
            aria-label={probe ? `${d.label}: ${formatValue(d.value, spec.unit)}` : undefined}
          >
            <span className="truncate text-[11.5px] text-foreground-soft" title={d.label}>
              {d.label}
            </span>
            {d.value === null ? (
              <span className="text-[10px] text-foreground-faint">Sin datos</span>
            ) : (
              <span aria-hidden className="relative flex h-3 items-center">
                <span
                  className="block h-0.5 rounded-full bg-surface-3"
                  style={{ width: `max(6px, ${pct}%)` }}
                />
                <span
                  className="-ml-1.5 block size-2.5 shrink-0 rounded-full"
                  style={{ background: colorFor(spec, d) }}
                />
              </span>
            )}
            <span
              aria-hidden
              className={`font-mono text-[10.5px] tabular-nums ${
                d.value === null ? "text-transparent" : "text-foreground"
              }`}
            >
              {d.value === null ? "" : formatValue(d.value, spec.unit)}
            </span>
            {probe && d.detail && (
              <span aria-hidden className={TIP}>
                <span className="label-section block">{d.label}</span>
                <span className="text-muted-foreground">{d.detail}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

⚠️ `colorFor` está declarado más abajo en el fichero (`:826`). Es una `function declaration`, luego el hoisting la hace visible — igual que la usa `DonutChart`, que también está antes.

- [ ] **Step 5: Registrarlo en el dispatcher**

En `Chart` (`charts.tsx:836`), tras el `case "heatmap"`:

```tsx
    case "lollipop":
      return <LollipopChart spec={spec} derived={derived} interactive={interactive} />;
```

- [ ] **Step 6: Ejecutar el test**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Moverlo de `TEXTUAL` a `SELF_DESCRIBING`**

En `stat-panel.tsx`, `lollipop` **no** entra en `TEXTUAL` (`:47`) y **sí** en `SELF_DESCRIBING` (`:64`):

```ts
const SELF_DESCRIBING: PanelSpec["viz"][] = [
  "bars",
  "stacked",
  "donut",
  "heatmap",
  "line",
  "area",
  "lollipop",
];
```

`ranking` se queda en `TEXTUAL` — no desaparece del tipo, solo deja de usarlo ningún panel; `table` sigue necesitando compañía en esa lista.

- [ ] **Step 8: Conservar la lista completa de la capa**

Los dos `spec.viz === "ranking"` (`:221` cara, `:261` capa) pasan a `spec.viz === "lollipop"`. **La cara ya no necesita `RankingList`** — el gráfico dice el dato. La capa **sí la conserva**: es la que lleva los enlaces (`PanelDatum.href`), que el gráfico no puede llevar porque el disparador del modal cubre la cara entera.

```tsx
        {/* CARA: nada. El lollipop ya escribe el dato. */}
```
```tsx
          {/* CAPA: la lista completa, con sus enlaces. */}
          {spec.viz === "lollipop" && <RankingList spec={spec} />}
```

- [ ] **Step 9: Migrar los siete paneles**

Cambiar `viz: "ranking"` por `viz: "lollipop"` en: `ratedGroupPanel` (`:991`), `directores` (`:1080`), `editoriales` (`:1105`), `mejor-valoradas` (`:1605`), `autores` (`:1795`). Son cinco sitios del fichero y siete paneles en ejecución, porque `ratedGroupPanel` se llama tres veces.

- [ ] **Step 10: Verificar todo en verde**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Después, en el navegador: los siete paneles dibujan, la cifra se ve en cada fila, `Tab` recorre las marcas y ninguno muestra tabla duplicada.

- [ ] **Step 11: Commit**

```bash
git add src/lib/stats/panel/types.ts src/components/stats/panel/charts.tsx src/components/stats/panel/charts.test.tsx src/components/stats/panel/stat-panel.tsx src/lib/stats/panel/specs.ts
git commit -m "feat(estadisticas): los siete rankings pasan de lista de texto a lollipop"
```

---

### Task A4: `waffle` — el donut deja de pedir que midas un ángulo

El principio 3 prohíbe que un dato exija medir un área o un ángulo. El donut es el único gráfico que hoy pelea con esa regla, y hay tres.

**Files:**
- Modify: `src/lib/stats/panel/types.ts`, `charts.tsx`, `stat-panel.tsx`
- Modify: `src/lib/stats/panel/specs.ts:1637` (`por-tipo`), `:1665` (`estados`), `:1974` (`pila`)
- Test: `src/components/stats/panel/charts.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
describe("waffle", () => {
  it("reparte cien celdas y dice qué vale una celda", () => {
    const s = spec({
      viz: "waffle",
      unit: UNITS.works,
      data: [
        { key: "book", label: "Libros", value: 61 },
        { key: "movie", label: "Películas", value: 24 },
      ],
      series: [
        { key: "book", label: "Libros", color: "var(--type-book)" },
        { key: "movie", label: "Películas", color: "var(--type-movie)" },
      ],
    });
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(100);
    // 85 obras en total: una celda no es una obra, así que hay que decirlo.
    expect(screen.getByText(/cada celda/i).textContent).toMatch(/1 %/);
  });

  it("con menos de cien puntos, una celda es una obra y lo dice", () => {
    const s = spec({
      viz: "waffle",
      unit: UNITS.works,
      data: [{ key: "book", label: "Libros", value: 7 }],
      series: [{ key: "book", label: "Libros", color: "var(--type-book)" }],
    });
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(7);
    expect(screen.getByText(/cada celda/i).textContent).toMatch(/1 obra/);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx -t waffle`
Expected: FAIL — `WaffleChart is not exported`.

- [ ] **Step 3: Escribir el componente**

En `types.ts` añadir `| "waffle"` a `PanelViz`. En `charts.tsx`:

```tsx
/** Cuántas celdas pinta el waffle cuando el total no cabe en una por obra. */
const WAFFLE_CELLS = 100;

/**
 * Reparto en rejilla de celdas. Sustituye al anillo por una razón del propio
 * doc, no de gusto: el principio 3 prohíbe que un dato exija medir un área o un
 * ángulo, y un sector de donut es exactamente eso. Las celdas se CUENTAN.
 *
 * Dos modos, y la diferencia se dice en voz alta bajo la rejilla:
 *   ≤100 puntos → una celda = una obra. Lo que se ve es el dato, sin redondeo.
 *   >100        → una celda = 1 %. Hay redondeo, y por eso se anuncia.
 *
 * El reparto por resto mayor evita el fallo clásico: redondear cada cuota por
 * separado da 99 o 101 celdas y la rejilla queda coja.
 */
export function WaffleChart({ spec, derived }: ChartProps) {
  const total = derived.total;
  const perWork = total > 0 && total <= WAFFLE_CELLS;
  const cellCount = perWork ? total : WAFFLE_CELLS;

  const exact = derived.known.map((d) => ({
    datum: d,
    want: total > 0 ? (d.value / total) * cellCount : 0,
  }));
  const base = exact.map((e) => ({ ...e, n: Math.floor(e.want) }));
  let left = cellCount - base.reduce((sum, b) => sum + b.n, 0);
  // Resto mayor: las cuotas con más decimal perdido se llevan las celdas sueltas.
  for (const b of [...base].sort((x, y) => (y.want % 1) - (x.want % 1))) {
    if (left <= 0) break;
    b.n += 1;
    left -= 1;
  }

  const cells = base.flatMap((b) =>
    Array.from({ length: b.n }, (_, i) => ({
      key: `${b.datum.key}-${i}`,
      color: colorFor(spec, b.datum),
    })),
  );

  return (
    <div className="flex flex-col gap-2 py-1">
      <div aria-hidden className="grid grid-cols-10 gap-[3px]">
        {cells.map((c) => (
          <span
            key={c.key}
            data-cell
            className="aspect-square rounded-[3px]"
            style={{ background: c.color }}
          />
        ))}
      </div>
      <p className="font-mono text-[9px] text-foreground-faint">
        {perWork
          ? `cada celda = 1 ${spec.unit.one}`
          : `cada celda = 1 % · ${formatNumber(total)} ${spec.unit.many} en total`}
      </p>
    </div>
  );
}
```

⚠️ La rejilla va `aria-hidden`: cien celdas sueltas en el árbol accesible son cien nodos que no dicen nada. **El dato exacto lo da la leyenda** (`Legend`, `stat-panel.tsx:220`), que ya pinta serie, glifo y cifra, y ya viaja a la cara. Por eso `waffle` **entra en `SELF_DESCRIBING`**: la cifra está escrita y es alcanzable sin ratón, en la leyenda.

- [ ] **Step 4: Registrar el `case` y la lista**

```tsx
    case "waffle":
      return <WaffleChart spec={spec} derived={derived} />;
```

Y añadir `"waffle"` a `SELF_DESCRIBING` en `stat-panel.tsx`.

- [ ] **Step 5: Ejecutar el test**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx -t waffle`
Expected: PASS, 2 tests.

- [ ] **Step 6: Migrar los tres paneles**

`viz: "donut"` → `viz: "waffle"` en `por-tipo` (`:1637`), `estados` (`:1665`) y `pila` (`:1974`).

⚠️ Comprobar que los tres traen `series` con color y glifo. Sin `series`, `colorFor` cae en `FALLBACK_COLORS` por índice y la leyenda pierde el nombre — que es donde vive el dato exacto del waffle.

- [ ] **Step 7: Decidir si `donut` se queda en el tipo**

Se queda: es el `case` que sirve de referencia para el arco, y quitarlo es una migración de tipo sin ganancia. Se anota en `decisiones.md` en la Task A8.

- [ ] **Step 8: Verificar y commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/lib/stats/panel/types.ts src/components/stats/panel/charts.tsx src/components/stats/panel/charts.test.tsx src/components/stats/panel/stat-panel.tsx src/lib/stats/panel/specs.ts
git commit -m "feat(estadisticas): waffle en lugar de anillo, que exigia medir un angulo (principio 3)"
```

---

### Task A5: `bullet` — «Récords» compara contra la marca

**Files:**
- Modify: `types.ts`, `charts.tsx`, `stat-panel.tsx`
- Modify: `src/lib/stats/get-records.ts`, `src/lib/stats/panel/specs.ts:1920`
- Test: `src/lib/stats/get-records.test.ts` (crear), `charts.test.tsx`

**Interfaces:**
- Produces: `PanelDatum.target?: number` — el valor de referencia de cada punto.

- [ ] **Step 1: Escribir el test que falla**

En `charts.test.tsx`:

```tsx
describe("bullet", () => {
  it("pinta la marca de referencia y escribe los dos numeros", () => {
    const s = spec({
      viz: "bullet",
      unit: UNITS.works,
      data: [{ key: "mes", label: "Obras en un mes", value: 11, target: 9 }],
    });
    render(<BulletChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByLabelText("Obras en un mes: 11 obras, tu marca 9 obras")).toBeTruthy();
    expect(screen.getByText("11 / 9")).toBeTruthy();
  });

  it("sin marca de referencia no inventa una", () => {
    const s = spec({ viz: "bullet", unit: UNITS.works, data: [{ key: "a", label: "A", value: 4 }] });
    const { container } = render(<BulletChart spec={s} derived={derive(s)} />);
    expect(container.querySelector("[data-target]")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx -t bullet`
Expected: FAIL — `BulletChart is not exported` y `'target' does not exist on type 'PanelDatum'`.

- [ ] **Step 3: Añadir `target` a `PanelDatum`**

En `types.ts`, dentro de `PanelDatum`:

```ts
  /**
   * Valor de referencia contra el que se compara este punto: la mejor marca,
   * el objetivo, la media. Solo lo consume `bullet`.
   *
   * `undefined` = no hay contra qué comparar, y entonces NO se dibuja marca.
   * Inventar una (la media, el máximo) haría que el panel dijera que has
   * batido algo que nadie fijó.
   */
  target?: number;
```

- [ ] **Step 4: Escribir el componente**

```tsx
/**
 * Valor contra referencia: barra de progreso con la marca de la mejor cifra.
 *
 * La escala es común a todos los puntos del panel y sale de `derived.scale`
 * ampliada al mayor `target`: si cada fila se escalara sola, dos barras del
 * mismo largo dirían cifras distintas y la comparación entre filas —que es
 * para lo que existe este gráfico— sería falsa.
 */
export function BulletChart({ spec, derived, interactive }: ChartProps) {
  const ceiling = Math.max(
    derived.scale,
    ...spec.data.map((d) => d.target ?? 0),
  );
  return (
    <ul className="flex flex-col gap-2.5">
      {spec.data.map((d) => {
        const probe = interactive && d.value !== null;
        const beaten = d.target !== undefined && d.value !== null && d.value >= d.target;
        return (
          <li
            key={d.key}
            className="flex flex-col gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            tabIndex={probe ? 0 : undefined}
            role={probe ? "img" : undefined}
            aria-label={
              probe
                ? d.target === undefined
                  ? `${d.label}: ${formatValue(d.value, spec.unit)}`
                  : `${d.label}: ${formatValue(d.value, spec.unit)}, tu marca ${formatValue(d.target, spec.unit)}`
                : undefined
            }
          >
            <span aria-hidden className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-foreground-soft">{d.label}</span>
              <span className="font-mono text-[10.5px] tabular-nums text-foreground">
                {d.value === null ? NO_DATA : formatNumber(d.value)}
                {d.target !== undefined && ` / ${formatNumber(d.target)}`}
              </span>
            </span>
            <span aria-hidden className="relative h-3 w-full rounded-full bg-surface-muted">
              {d.value !== null && (
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${share(d.value, ceiling)}%`,
                    background: beaten ? "var(--green)" : "var(--gold-graphic)",
                  }}
                />
              )}
              {d.target !== undefined && (
                <span
                  data-target
                  className="absolute -inset-y-1 w-[2.5px] rounded-full bg-foreground"
                  style={{ left: `${share(d.target, ceiling)}%` }}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

⚠️ Importar `NO_DATA` y `share` si no lo están ya en `charts.tsx` (`share` viene de `derive.ts:105`, `NO_DATA` de `format.ts`).

- [ ] **Step 5: Registrar y listar**

`case "bullet"` en `Chart`, `"bullet"` en `SELF_DESCRIBING`, `| "bullet"` en `PanelViz`.

- [ ] **Step 6: Dar marcas a `getRecords`**

`Records` (`get-records.ts:8`) devuelve hoy la cifra del periodo sin nada contra qué compararla. Añadir el histórico:

```ts
export type Records = {
  mostActiveMonth: { month: string; count: number } | null;
  fastestBook: { title: string; days: number } | null;
  rereads: number;
  /**
   * La mejor marca de SIEMPRE de cada récord, para comparar contra la del
   * periodo. `null` cuando no hay histórico anterior con el que comparar —y
   * entonces el panel no dibuja marca, en vez de compararte contigo mismo de
   * hoy y decir siempre que has empatado.
   */
  best: { mostActiveMonth: number | null; fastestBook: number | null };
};
```

La consulta de `best` es la misma de `getRecords` **sin** el filtro de periodo. Escribir `computeRecords(rows)` puro y testarlo en `src/lib/stats/get-records.test.ts`, siguiendo el patrón de `computeHabits` / `computePagesPerDay`.

- [ ] **Step 7: Migrar el panel**

En `specs.ts:1920`, `viz: "kpi"` → `viz: "bullet"`, y montar `data` con un `PanelDatum` por récord, cada uno con su `target` desde `records.best`. Los KPIs que no son comparables (`rereads`) se quedan en `kpis`, no bajan a `data`.

- [ ] **Step 8: Verificar y commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/lib/stats/panel/types.ts src/components/stats/panel/charts.tsx src/components/stats/panel/charts.test.tsx src/components/stats/panel/stat-panel.tsx src/lib/stats/get-records.ts src/lib/stats/get-records.test.ts src/lib/stats/panel/specs.ts
git commit -m "feat(estadisticas): records compara contra tu mejor marca con un bullet"
```

---

### Task A6: e2e del muro rediseñado

**Files:**
- Create: `e2e/estadisticas-muro-formas.spec.ts`

- [ ] **Step 1: Escribir el spec**

```ts
import { test, expect } from "@playwright/test";

// El muro va detrás de un <Suspense> con 18 consultas: se espera al panel, no
// a `networkidle`, que con streaming no llega nunca.
test.describe("muro de estadísticas", () => {
  test("el héroe ocupa el ancho completo de su sección", async ({ page }) => {
    await page.goto("/estadisticas");
    const seccion = page.locator("#actividad");
    const heroe = seccion.getByRole("heading", { name: "Calendario anual" });
    await expect(heroe).toBeVisible();

    const anchoSeccion = await seccion.evaluate((el) => el.clientWidth);
    const anchoHeroe = await heroe
      .locator("xpath=ancestor::section[1]")
      .evaluate((el) => el.clientWidth);
    // Tolerancia por el padding de la columna, no por vaguedad.
    expect(anchoHeroe).toBeGreaterThan(anchoSeccion * 0.9);
  });

  test("un ranking dibuja y se recorre con teclado", async ({ page }) => {
    await page.goto("/estadisticas");
    const marca = page.getByRole("img", { name: /^Autores más leídos/ }).first();
    await expect(marca).toBeVisible();
    await marca.focus();
    await expect(marca).toBeFocused();
  });
});
```

- [ ] **Step 2: Ejecutar**

Run: `npm run test:e2e -- estadisticas-muro-formas` (**reutiliza el dev server que ya haya**; no levantar otro).
Expected: PASS, 2 tests.

⚠️ Los e2e van contra **build de producción**, no solo `next dev`: un `use cache` mal puesto pasa `next build` y falla en `next start` (`next-request-in-use-cache`). Ver `AGENTS.md`.

- [ ] **Step 3: Commit**

```bash
git add e2e/estadisticas-muro-formas.spec.ts
git commit -m "test(estadisticas): e2e del heroe a tres columnas y del ranking focalizable"
```

---

### Task A7: reordenar «Valoraciones» y cerrar la fase

**Files:**
- Modify: `src/lib/stats/panel/specs.ts:266-286` (sección `valoraciones`)
- Modify: `docs/design/paneles-estadisticos.md`, `docs/requirements/decisiones.md`

- [ ] **Step 1: Romper la fila de tres**

En `allSections`, sección `valoraciones`, intercalar `valoraciones` (el histograma, `viz: "bars"`) y `mejor-valoradas` entre los tres `ratedGroupPanel`, de modo que no queden tres lollipops consecutivos. Orden propuesto:

```ts
        ratedGroupPanel("nota-generos", …),
        ratingPanel(…),          // histograma de notas, `bars`
        ratedGroupPanel("nota-autores", …),
        topRatedPanel(…),        // mejor valoradas, `lollipop`
        ratedGroupPanel("nota-directores", …),
```

⚠️ El masonry reparte por columnas, no por filas: el orden del array es el orden de **lectura**, no el de posición en pantalla. Comprobar el resultado en el navegador a tres columnas antes de dar la tarea por buena.

- [ ] **Step 2: Actualizar el doc canónico**

En `docs/design/paneles-estadisticos.md`: actualizar la fecha de verificación a la de hoy, y añadir `lollipop`, `waffle` y `bullet` al inventario de `viz` con la nota de que los tres están en `SELF_DESCRIBING` y qué les obliga eso.

- [ ] **Step 3: Anotar las decisiones**

Añadir **al final** de `docs/requirements/decisiones.md` (append-only, no reescribir las anteriores) dos entradas fechadas 2026-08-21:

1. **Waffle en lugar de anillo.** El principio 3 prohíbe medir ángulos y áreas; el donut era el único gráfico que peleaba con la propia regla. `donut` se queda en `PanelViz` sin consumidor, a propósito: es la referencia del arco.
2. **El selector de faceta NO se hizo.** Choca con «nunca hay un filtro por panel» (`filter.ts:4-6`). Los tres rankings de nota se quedan; lo que se arregló fue la forma (lollipop) y el orden.

- [ ] **Step 4: Abrir las issues de lo descartado**

Una issue `tipo:acta`, para que nadie lo reimplemente leyendo el mockup:

```sh
gh issue create --label "area:ui,tipo:acta,P3" \
  --title "Formas gráficas descartadas para el muro de estadísticas (2026-08-21)" \
  --body "Treemap y burbujas: codifican por área y las piezas pequeñas no caben su cifra — incumplen el principio 3 de docs/design/paneles-estadisticos.md. Scatter en nota-segun-extension: con pocos puntos se ve vacío, con muchos deja de ser consultable uno a uno. Radar de días de la semana: los siete días no son dato circular y el radar se lee mal (la franja horaria sí lo sería, 24 sectores). Candlestick, Sankey, pirámide y cascada: no tenemos ese dato. Origen: spec docs/superpowers/specs/2026-08-21-muro-estadisticas-variedad-grafica-design.md §4.4. NO es trabajo pendiente: es memoria."
```

Y una `tipo:deuda` por el colapso que no se hizo:

```sh
gh issue create --label "area:ui,tipo:deuda,P3" \
  --title "Los tres rankings de nota siguen siendo tres paneles" \
  --body "ratedGroupPanel (specs.ts:272-274) produce tres paneles casi idénticos: géneros, autores y directores mejor valorados. Colapsarlos en uno con selector de faceta choca con «nunca hay un filtro por panel» (src/lib/stats/filter.ts:4-6, repetido en page.tsx:114). Se mitigó pasándolos a lollipop y separándolos en el orden de la sección, pero siguen ocupando tres huecos. Para hacerlo de verdad, 'faceta' tendría que ser un filtro GLOBAL en la fila de filtros — excepción deliberada a una regla documentada, que va a decisiones.md ANTES de escribirse."
```

- [ ] **Step 5: Verificar la fase entera y commit**

Run: `npm test && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/stats/panel/specs.ts docs/design/paneles-estadisticos.md docs/requirements/decisiones.md
git commit -m "docs(estadisticas): cierra la fase A — doc canonico, decisiones y actas al dia"
```

---

# FASE B — panel adaptativo

### Task B1: `derived.viz` y la tabla de degradación

**Files:**
- Modify: `src/lib/stats/panel/derive.ts:33-52`
- Test: `src/lib/stats/panel/derive.test.ts` (crear)

**Interfaces:**
- Produces: `PanelDerived.viz: PanelViz` — el **efectivo**. Task B2 lo consume en los seis sitios de `StatPanel`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/stats/panel/derive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { derive } from "./derive";
import { UNITS, type PanelSpec, type PanelViz } from "./types";

function spec(viz: PanelViz, values: (number | null)[]): PanelSpec {
  return {
    id: "t",
    title: "Prueba",
    context: { period: "2026" },
    viz,
    unit: UNITS.works,
    data: values.map((value, i) => ({ key: `k${i}`, label: `L${i}`, value })),
  };
}

describe("degradación del viz según cuántos puntos hay", () => {
  it("una línea con menos de cuatro puntos se lee mejor como cifra", () => {
    expect(derive(spec("line", [3, 5])).viz).toBe("kpi");
    expect(derive(spec("area", [3, 5, 7])).viz).toBe("kpi");
    expect(derive(spec("line", [3, 5, 7, 9])).viz).toBe("line");
  });

  it("un reparto con menos de tres partes no es un reparto", () => {
    expect(derive(spec("waffle", [10, 4])).viz).toBe("kpi");
    expect(derive(spec("waffle", [10, 4, 2])).viz).toBe("waffle");
  });

  it("una comparación necesita al menos dos puntos", () => {
    expect(derive(spec("lollipop", [5])).viz).toBe("kpi");
    expect(derive(spec("bars", [5])).viz).toBe("kpi");
    expect(derive(spec("lollipop", [5, 3])).viz).toBe("lollipop");
  });

  it("los HUECOS no cuentan: tres nulos y un dato siguen siendo un dato", () => {
    expect(derive(spec("line", [4, null, null, null])).viz).toBe("kpi");
  });

  it("los CEROS medidos sí cuentan: son dato, no ausencia", () => {
    expect(derive(spec("line", [0, 0, 0, 0])).viz).toBe("line");
  });

  it("kpi, ranking y table nunca degradan: ya son su forma mínima", () => {
    expect(derive(spec("kpi", [])).viz).toBe("kpi");
    expect(derive(spec("table", [1])).viz).toBe("table");
  });

  it("gauge no degrada: mide contra un objetivo, no contra otros puntos", () => {
    expect(derive(spec("gauge", [7])).viz).toBe("gauge");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/panel/derive.test.ts`
Expected: FAIL — `Property 'viz' does not exist on type 'PanelDerived'`.

- [ ] **Step 3: Implementar**

En `derive.ts`, sobre `derive()`:

```ts
/**
 * Mínimo de puntos MEDIDOS que necesita cada forma para no mentir.
 *
 * Una línea con dos puntos es una recta entre dos números, con ejes, rejilla y
 * leyenda, ocupando lo que un año entero. Un reparto con dos partes es «casi
 * todo esto y un poco de aquello», que es una frase, no un gráfico.
 *
 * Los umbrales están SOLO en 0, 1, 2 y 3, y nunca por estética. Si la forma
 * cambiara por gusto, el panel se vería distinto cada visita y se perdería la
 * comparación entre visitas, que es para lo que existe un muro de estadísticas.
 */
const MIN_POINTS: Partial<Record<PanelViz, number>> = {
  line: 4,
  area: 4,
  donut: 3,
  waffle: 3,
  bars: 2,
  stacked: 2,
  lollipop: 2,
  bullet: 2,
  dumbbell: 2,
  heatmap: 2,
};

/**
 * La forma que el panel va a pintar DE VERDAD, que no siempre es la que declara
 * la spec. Cuando no hay puntos para el gráfico pero sí hay dato, se degrada a
 * `kpi`: el panel conserva su cifra y su variación en vez de quedarse hueco.
 *
 * `kpi`, `ranking`, `table` y `gauge` no degradan nunca: los tres primeros ya
 * son texto, y el medidor compara contra un objetivo, no contra otros puntos.
 */
function effectiveViz(spec: PanelSpec, knownCount: number): PanelViz {
  const min = MIN_POINTS[spec.viz];
  if (min === undefined) return spec.viz;
  return knownCount < min ? "kpi" : spec.viz;
}
```

Y dentro de `derive()`, antes del `return`, calcular `const viz = effectiveViz(spec, known.length);` y añadirlo al objeto devuelto. En `PanelDerived`:

```ts
  /**
   * La forma que se pinta, que puede no ser `spec.viz` (ver `effectiveViz`).
   * **Todo `StatPanel` lee ESTO, nunca `spec.viz`** — ver el test de B2.
   */
  viz: PanelViz;
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run src/lib/stats/panel/derive.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/panel/derive.ts src/lib/stats/panel/types.ts src/lib/stats/panel/derive.test.ts
git commit -m "feat(estadisticas): derive() elige la forma efectiva segun cuantos puntos hay"
```

---

### Task B2: enrutar los seis sitios — el invariante que hunde la fase

`StatPanel` lee `spec.viz` en **seis** sitios (verificado el 2026-08-21). Uno que se quede atrás da un panel que dice tener tabla y no la tiene, o al revés — **y no lo caza el typecheck**, porque ambos campos son `PanelViz`.

| línea | uso |
|---|---|
| `stat-panel.tsx:160` | `TEXTUAL.includes(spec.viz)` |
| `stat-panel.tsx:175` | `SELF_DESCRIBING.includes(spec.viz)` |
| `stat-panel.tsx:195` | `PLAIN_VIZ.includes(spec.viz)` |
| `stat-panel.tsx:221` | `spec.viz === "lollipop"` (tras A3) |
| `stat-panel.tsx:261` | `spec.viz === "lollipop"` (tras A3) |
| `stat-panel.tsx:269` | `spec.viz === "table"` |

**Files:**
- Modify: `src/components/stats/panel/stat-panel.tsx`
- Modify: `src/components/stats/panel/charts.tsx` (`Chart` despacha por `derived.viz`)
- Test: `src/components/stats/panel/stat-panel.test.tsx` (crear)

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { UNITS, type PanelSpec } from "@/lib/stats/panel/types";
import { StatPanel } from "./stat-panel";

describe("nadie lee spec.viz", () => {
  it("stat-panel enruta TODO por derived.viz", () => {
    const src = readFileSync("src/components/stats/panel/stat-panel.tsx", "utf8");
    // Guardia de texto a propósito: el typecheck NO caza esto, porque
    // `spec.viz` y `derived.viz` son el mismo tipo. Es el único invariante del
    // sistema que solo se puede afirmar leyendo el fichero.
    expect(src).not.toMatch(/spec\.viz/);
  });
});

describe("panel degradado", () => {
  const dosPuntos: PanelSpec = {
    id: "pila",
    title: "Evolución de la pila",
    context: { period: "Todo" },
    viz: "line",
    unit: UNITS.works,
    data: [
      { key: "jul", label: "Julio", value: 26 },
      { key: "ago", label: "Agosto", value: 31 },
    ],
  };

  it("con dos puntos no dibuja la línea, pero conserva la cifra", () => {
    render(<StatPanel spec={dosPuntos} />);
    expect(screen.getByText("Evolución de la pila")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Julio/ })).toBeNull();
  });

  it("un panel degradado lo dice, para que nadie crea que el gráfico se perdió", () => {
    render(<StatPanel spec={dosPuntos} />);
    expect(screen.getByText(/todavía no hay curva/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/components/stats/panel/stat-panel.test.tsx`
Expected: FAIL — el primero porque `spec.viz` aparece seis veces; los otros dos porque no hay aviso de degradación.

- [ ] **Step 3: Sustituir los seis**

Cambiar los seis por `derived.viz`. `derived` ya existe en el ámbito de `StatPanel` (`const derived = derive(spec)`); comprobar que se calcula **antes** de la línea 160.

`table` no degrada nunca, pero también se enruta: **una sola regla, no dos con una excepción** que el siguiente que lo lea no vea.

- [ ] **Step 4: `Chart` despacha por la forma efectiva**

En `charts.tsx:836`, el `switch` pasa de `spec.viz` a `derived.viz`. Sin esto, `StatPanel` decide que el panel es `kpi` y `Chart` sigue intentando pintar la línea de dos puntos.

- [ ] **Step 5: Escribir el aviso de degradación**

En `stat-panel.tsx`, junto al `highlight`:

```tsx
  // Un panel degradado lo DICE. Sin esta frase, quien vio ayer una curva y hoy
  // ve una cifra piensa que se ha perdido el gráfico, no que aún no hay datos
  // para dibujarlo.
  const degraded = derived.viz !== spec.viz ? degradeNote(spec.viz) : null;
```

Y en `summary.ts`, la frase por forma de origen:

```ts
/** Por qué este panel no está pintando la forma que declara su spec. */
export function degradeNote(intended: PanelViz): string | null {
  switch (intended) {
    case "line":
    case "area":
      return "Con menos de cuatro medidas todavía no hay curva. Cuando las haya, este panel vuelve solo a ser una línea.";
    case "donut":
    case "waffle":
      return "Con menos de tres partes, el reparto se cuenta antes de lo que se dibuja.";
    default:
      return "Todavía hay pocos datos para dibujarlo; la cifra sí es exacta.";
  }
}
```

- [ ] **Step 6: Ejecutar el test**

Run: `npx vitest run src/components/stats/panel/stat-panel.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Verificar y commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/components/stats/panel/stat-panel.tsx src/components/stats/panel/charts.tsx src/components/stats/panel/stat-panel.test.tsx src/lib/stats/panel/summary.ts
git commit -m "refactor(estadisticas): los seis sitios de StatPanel leen derived.viz, no spec.viz"
```

---

### Task B3: nivel 1 — vacío estructural, plegado y contado

**Files:**
- Modify: `src/lib/stats/panel/types.ts`, `specs.ts`, `stat-panel.tsx`, `src/app/estadisticas/page.tsx`
- Test: `src/lib/stats/panel/specs.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
it("sin ninguna serie, los paneles de series se declaran estructuralmente vacíos", () => {
  const sinSeries = { ...input(), formats: { ...input().formats, series: null } };
  const panels = buildStatsSections(sinSeries).flatMap((s) => s.panels);
  const series = panels.find((p) => p.id === "series-formato");
  expect(series?.structurallyEmpty).toMatch(/ninguna serie/i);
});

it("cuenta los plegados por sección, para no esconder en silencio", () => {
  const sinSeries = { ...input(), formats: { ...input().formats, series: null } };
  expect(collapsedPanelCount(sinSeries)).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/panel/specs.test.ts -t estructuralmente`
Expected: FAIL — `structurallyEmpty` no existe, `collapsedPanelCount` no está exportada.

- [ ] **Step 3: Añadir el campo**

En `types.ts`, dentro de `PanelSpec`:

```ts
  /**
   * Por qué este panel NO PUEDE tener datos, con independencia del periodo.
   * `undefined` = sí puede tenerlos, y su vacío es cosa del filtro (nivel 2).
   *
   * La frase se enseña plegada y ENTRA EN EL RECUENTO de la sección. Es el
   * mismo criterio que `hiddenPanelCount` aplica al periodo: esconder sí,
   * callar no — un muro que oculta en silencio miente sobre lo que existe.
   */
  structurallyEmpty?: string;
```

- [ ] **Step 4: Declararlo donde toca**

En `specs.ts`, en los paneles de formato: si `formats.series` es `null` o sus episodios son cero **en todo el histórico**, `structurallyEmpty: "No tienes ninguna serie registrada"`. Igual para `libros-formato` y `peliculas-formato`.

⚠️ El criterio es «en todo el histórico», **no** «en el periodo». Si es cero solo en el periodo, es nivel 2 y no nivel 1.

- [ ] **Step 5: `collapsedPanelCount`**

Junto a `hiddenPanelCount` (`specs.ts:210`), y con la misma forma:

```ts
/** Cuántos paneles se pliegan por no poder tener datos nunca. */
export function collapsedPanelCount(input: StatsInput): number {
  return allSections(input, periodLabel(input.period), undefined)
    .reduce((n, s) => n + s.panels.filter((p) => p.structurallyEmpty).length, 0);
}
```

- [ ] **Step 6: Pintarlo plegado**

En `StatPanel`, antes de todo lo demás, si `spec.structurallyEmpty` devolver la línea, no la tarjeta:

```tsx
  if (spec.structurallyEmpty) {
    return (
      <section
        aria-labelledby={titleId}
        className="rounded-card border border-dashed border-border bg-surface px-3.5 py-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <Heading id={titleId} className="text-[12px] font-medium text-muted-foreground">
            {spec.title}
          </Heading>
          <span className="text-[11px] text-foreground-faint">{spec.structurallyEmpty}</span>
        </div>
      </section>
    );
  }
```

Y en `page.tsx`, junto a la frase de `hiddenPanelCount`, añadir el recuento de plegados.

- [ ] **Step 7: Verificar y commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/lib/stats/panel/types.ts src/lib/stats/panel/specs.ts src/lib/stats/panel/specs.test.ts src/components/stats/panel/stat-panel.tsx src/app/estadisticas/page.tsx
git commit -m "feat(estadisticas): el vacio estructural se pliega a una linea y se cuenta"
```

---

### Task B4: nivel 2 — vacío por filtro, con la salida puesta

**Files:**
- Modify: `src/lib/stats/panel/types.ts` (`empty`), `specs.ts`, `stat-panel.tsx:140-151`
- Test: `src/components/stats/panel/stat-panel.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
it("el vacío por filtro dice la cifra que sí existe fuera y ofrece la salida", () => {
  render(
    <StatPanel
      spec={{
        id: "horas-por-mes",
        title: "Horas por mes",
        context: { period: "Esta semana" },
        viz: "area",
        unit: UNITS.minutes,
        data: [],
        empty: {
          title: "Sin sesiones esta semana",
          elsewhere: { text: "En 2026 llevas 148 h", href: "/estadisticas", label: "Ver todo el año" },
        },
      }}
    />,
  );
  expect(screen.getByText("En 2026 llevas 148 h")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Ver todo el año/ })).toBeTruthy();
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/components/stats/panel/stat-panel.test.tsx -t "vacío por filtro"`
Expected: FAIL — `'elsewhere' does not exist on type`.

- [ ] **Step 3: Ampliar `empty`**

```ts
  empty?: {
    title: string;
    message?: string;
    /**
     * La cifra que SÍ existe fuera del filtro actual, con su salida.
     *
     * Sin ella no se ofrece salida: un enlace a un sitio donde tampoco hay nada
     * es peor que no ofrecer ninguno. Es lo que separa «no hay datos» de «no
     * hay datos AQUÍ, y el aquí lo acabas de elegir tú».
     */
    elsewhere?: { text: string; href: string; label: string };
  };
```

- [ ] **Step 4: Pintar la tarjeta compacta**

Sustituir el bloque vacío de `stat-panel.tsx:140-151`: con `elsewhere`, una fila de altura de línea (título · cifra de fuera · enlace); sin `elsewhere`, la tarjeta actual pero con el relleno reducido. **Hoy ocupa lo mismo que un panel lleno, y ahí está el aire.**

- [ ] **Step 5: Rellenar `elsewhere` donde se sepa**

Solo en los paneles que ya tienen a mano el dato del histórico: `horas-por-mes`, `actividad`, `semana`. **En los que no, se deja sin `elsewhere`** — inventar la cifra pidiendo otra consulta convertiría el vacío en el caso más caro de la página, que es exactamente lo contrario de lo que busca esta fase.

- [ ] **Step 6: Verificar, cerrar la fase y commit**

Run: `npm test && npx tsc --noEmit && npm run lint`

Actualizar `docs/design/paneles-estadisticos.md` con los tres niveles y la fecha de verificación.

```bash
git add src/lib/stats/panel/types.ts src/lib/stats/panel/specs.ts src/components/stats/panel/stat-panel.tsx src/components/stats/panel/stat-panel.test.tsx docs/design/paneles-estadisticos.md
git commit -m "feat(estadisticas): el vacio por filtro se compacta y ofrece la salida"
```

---

# FASE C — estadísticas nuevas

**Antes de empezar:** medir el tiempo del `Promise.all` de `StatsWall` (`page.tsx:180`) con la biblioteca más grande que haya en dev. Ese número es la línea base y va en la PR. El muro entero llega cuando termina **la más lenta** de las consultas, así que ningún getter nuevo puede tardar más que el más lento de los actuales. Si uno se pasa: o se indexa, o se queda fuera con su issue.

### Task C1: `dumbbell`

**Files:** `types.ts`, `charts.tsx`, `stat-panel.tsx`, `charts.test.tsx`

**Interfaces:**
- Produces: `PanelDatum.from?: number` — el valor de partida. `value` es el de llegada.

- [ ] **Step 1: Escribir el test que falla**

```tsx
describe("dumbbell", () => {
  it("dice de dónde a dónde, y en qué dirección", () => {
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "dune", label: "Dune", from: 3.5, value: 5 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByLabelText("Dune: de 3,5 ★ a 5 ★, sube 1,5 ★")).toBeTruthy();
  });

  it("bajar y subir no se distinguen solo por el color", () => {
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "a", label: "A", from: 4.5, value: 3.5 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    // La palabra «baja» está en el nombre accesible: el color es redundante.
    expect(screen.getByLabelText(/baja 1 ★/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx -t dumbbell`
Expected: FAIL — `DumbbellChart is not exported`.

- [ ] **Step 3: Implementar**

`| "dumbbell"` en `PanelViz`, `from?: number` en `PanelDatum` con su comentario, `"dumbbell"` en `SELF_DESCRIBING`, `case` en `Chart`. El componente sigue la estructura de `BulletChart`: `<ul>`, una fila por punto, escala común de `derived`, `tabIndex={0}` y `aria-label` con **las tres cifras** (origen, destino, diferencia) y **la palabra** «sube» o «baja». El punto de origen va hueco (borde, sin relleno) y el de destino macizo: forma, no solo color.

- [ ] **Step 4: Ejecutar y commit**

Run: `npx vitest run src/components/stats/panel/charts.test.tsx -t dumbbell`

```bash
git add src/lib/stats/panel/types.ts src/components/stats/panel/charts.tsx src/components/stats/panel/charts.test.tsx src/components/stats/panel/stat-panel.tsx
git commit -m "feat(estadisticas): dumbbell para variaciones de dos puntos"
```

---

### Task C2: «Cómo cambia tu nota al releer»

El esquema está diseñado para esto y nadie lo mira: *«El pase es dueño de la nota y la reseña — cada relectura puede tener su propia valoración»*. Hoy `getRecords` solo devuelve `rereads: number`, un contador.

**Files:**
- Create: `src/lib/stats/get-rereads.ts`, `src/lib/stats/get-rereads.test.ts`
- Modify: `src/lib/stats/panel/specs.ts`, `src/app/estadisticas/page.tsx`

**Interfaces:**
- Produces: `computeRereads(rows: RereadRow[]): Rereads` y `getRereads(supabase, userId, itemFilter): Promise<Rereads>`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import { computeRereads, type RereadRow } from "./get-rereads";

function row(over: Partial<RereadRow>): RereadRow {
  return { item_type: "book", item_id: "1", rating: 4, finished_on: "2026-01-01", ...over };
}

describe("cambio de nota al releer", () => {
  it("empareja el primer pase con el último de la misma obra", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: 3.5, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 5, finished_on: "2026-01-01" }),
    ]);
    expect(r.works).toHaveLength(1);
    expect(r.works[0]).toMatchObject({ first: 3.5, latest: 5 });
    expect(r.averageChange).toBe(1.5);
  });

  it("una obra con un solo pase NO es una relectura", () => {
    expect(computeRereads([row({ item_id: "1" })]).works).toHaveLength(0);
  });

  it("una relectura sin nota en alguno de los dos pases no entra en la media", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: null, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 5, finished_on: "2026-01-01" }),
    ]);
    expect(r.works).toHaveLength(0);
    // Pero se cuenta: el denominador honesto lo necesita.
    expect(r.unratedRereads).toBe(1);
  });

  it("con tres pases compara el primero con el último, no con el del medio", () => {
    const r = computeRereads([
      row({ item_id: "1", rating: 2, finished_on: "2018-01-01" }),
      row({ item_id: "1", rating: 5, finished_on: "2020-01-01" }),
      row({ item_id: "1", rating: 4, finished_on: "2026-01-01" }),
    ]);
    expect(r.works[0]).toMatchObject({ first: 2, latest: 4 });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/get-rereads.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el cálculo puro**

`computeRereads` agrupa por `item_type` + `item_id` (la referencia es **polimórfica y no hay FK**, así que la clave es el par, nunca `item_id` solo), ordena por `finished_on`, y empareja primero con último. Solo entran las obras con **dos pases o más** y con nota en ambos extremos; las demás suman a `unratedRereads`.

⚠️ `rereadCount` **no es el ordinal del pase**: cuenta los pases CERRADOS, el actual es +1. Trampa ya documentada en `data-model.md` §3; la primera lectura siempre sale bien, así que el fallo pasa desapercibido hasta que alguien relee.

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run src/lib/stats/get-rereads.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: La consulta**

`getRereads(supabase, userId, itemFilter)` selecciona `item_type, item_id, rating, finished_on` de `passes` donde `user_id = userId`, `status = 'completed'`, `finished_on not null`. **Sin `use cache`**: depende de `auth.uid()`.

⚠️ Descartar los pases cuya obra ya no está en catálogo. La cuenta que importa es la de pases **con obra en catálogo** — issue #272; el trigger `forbid_delete_with_passes` lo cierra desde 2026-08-04, pero las filas anteriores pueden seguir colgando.

- [ ] **Step 6: El panel**

En `specs.ts`, `rereadsPanel(...)`: `viz: "dumbbell"`, **`hero: true`**, sección `valoraciones`, **el primero** de su sección (invariante de Task A1). `data` = una entrada por obra con `from: first`, `value: latest`. `context.filters: ["Solo obras releídas y valoradas dos veces"]`. `empty.title`: «Todavía no has releído nada».

- [ ] **Step 7: Enchufarlo**

Añadir `getRereads(...)` al `Promise.all` de `StatsWall` y al `panelInput`.

- [ ] **Step 8: Medir**

Run: cronometrar el `Promise.all` antes y después. Expected: la diferencia no mueve el total (la consulta va por el índice de `passes` por `user_id`). Si lo mueve, indexar o sacar la tarea.

- [ ] **Step 9: Verificar y commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/lib/stats/get-rereads.ts src/lib/stats/get-rereads.test.ts src/lib/stats/panel/specs.ts src/app/estadisticas/page.tsx
git commit -m "feat(estadisticas): como cambia tu nota al releer, con dumbbell"
```

---

### Task C3: «Por qué abandonas» — y la restricción que no es de producto

**Files:**
- Create: `src/lib/stats/get-drop-reasons.ts`, `.test.ts`
- Modify: `specs.ts`, `page.tsx`

⚠️ **Restricción de seguridad.** `passes.dropped_reason` es **siempre privado**, con independencia de `is_public`. `passes` **no concede `SELECT`** sobre esa columna a nadie: la única vía de lectura es la vista `public.pass_reviews`, `SECURITY DEFINER` y enmascarada por `d.user_id = auth.uid()`. Ver `data-model.md` §3.

Tres consecuencias que esta tarea **debe** respetar:
1. El getter lee de `pass_reviews`, **nunca** de `passes`. Un `select("dropped_reason")` sobre `passes` falla con «permission denied», y es correcto que falle.
2. El panel vive **solo** en `/estadisticas` (privada, del dueño). **No** puede aparecer en `src/app/u/[username]/_tabs/stats-tab.tsx`.
3. **Sin `use cache`**, jamás.

- [ ] **Step 1: Escribir el test que falla**

```ts
describe("motivos de abandono", () => {
  it("cuenta por motivo y deja fuera los que no lo tienen", () => {
    const r = computeDropReasons([
      { dropped_reason: "no_enganchado" },
      { dropped_reason: "no_enganchado" },
      { dropped_reason: "aburrido" },
      { dropped_reason: null },
    ]);
    expect(r.byReason.no_enganchado).toBe(2);
    // El denominador honesto: sin backfill, los abandonos previos al
    // 2026-08-14 tienen motivo NULL. Callarlo haría que 2 de 4 pareciera 2 de 2.
    expect(r.withReason).toBe(3);
    expect(r.total).toBe(4);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/get-drop-reasons.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

`computeDropReasons` puro, y `getDropReasons` que consulta `pass_reviews` filtrando `status = 'dropped'`. Los cinco valores del enum se traducen a etiqueta legible en `specs.ts`, no en el getter — la traducción es presentación.

- [ ] **Step 4: El panel**

`viz: "lollipop"`, sección `biblioteca`. `context.filters: ["Solo abandonos con motivo registrado"]`. `note`: que los abandonos anteriores al 2026-08-14 no tienen motivo, sin backfill.

- [ ] **Step 5: Test de que no se cuela en el perfil público**

```ts
it("motivos-abandono NO aparece en la pestaña pública del perfil", () => {
  const src = readFileSync("src/app/u/[username]/_tabs/stats-tab.tsx", "utf8");
  expect(src).not.toMatch(/motivos-abandono|getDropReasons/);
});
```

- [ ] **Step 6: Verificar y commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/lib/stats/get-drop-reasons.ts src/lib/stats/get-drop-reasons.test.ts src/lib/stats/panel/specs.ts src/app/estadisticas/page.tsx
git commit -m "feat(estadisticas): por que abandonas, leido por pass_reviews y solo en el muro privado"
```

---

### Task C4: «Dónde abandonas» y el punto de no retorno

**Files:** `src/lib/stats/get-drop-reasons.ts` (extendido), `specs.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
describe("punto de abandono", () => {
  it("calcula el % de avance y el punto de no retorno", () => {
    const r = computeDropPoint([
      { position: { page: 20 }, totalPages: 200 },   // 10 %
      { position: { page: 52 }, totalPages: 200 },   // 26 %
      { position: { page: 88 }, totalPages: 200 },   // 44 %
    ]);
    expect(r.averagePercent).toBe(27);
    // Nunca ha abandonado por encima del 44 %: ese es el punto de no retorno.
    expect(r.pointOfNoReturn).toBe(44);
  });

  it("un libro sin páginas en ficha no entra en el cálculo, pero se cuenta", () => {
    const r = computeDropPoint([{ position: { page: 20 }, totalPages: null }]);
    expect(r.measured).toBe(0);
    expect(r.unmeasurable).toBe(1);
  });

  it("una position con forma ajena se descarta sin romper", () => {
    // `position` es jsonb y NO se valida en BD (trade-off aceptado, §3 del
    // modelo de datos): puede llegar `{season, episode}` en una fila de libro.
    const r = computeDropPoint([{ position: { season: 2, episode: 5 }, totalPages: 200 }]);
    expect(r.measured).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/stats/get-drop-reasons.test.ts -t "punto de abandono"`
Expected: FAIL — `computeDropPoint` no existe.

- [ ] **Step 3: Implementar**

Valida forma (`typeof position?.page === "number"`), descarta lo que no case, y separa `measured` de `unmeasurable`. El punto de no retorno es el **máximo** de los porcentajes medidos, y solo se afirma con al menos cinco abandonos medibles — con dos, «nunca has abandonado por encima del 26 %» es ruido, no un hallazgo.

- [ ] **Step 4: El panel y commit**

`viz: "bullet"` con `target` en el punto de no retorno. Misma restricción de privacidad que C3 si se combina con el motivo.

```bash
git add src/lib/stats/get-drop-reasons.ts src/lib/stats/get-drop-reasons.test.ts src/lib/stats/panel/specs.ts
git commit -m "feat(estadisticas): donde abandonas y tu punto de no retorno"
```

---

### Task C5: «Las obras que más te hacen escribir»

**Files:** `src/lib/stats/get-notes-per-work.ts`, `.test.ts`, `specs.ts`, `page.tsx`

- [ ] **Step 1: Escribir el test que falla**

```ts
describe("notas por obra", () => {
  it("normaliza por cada cien páginas, no por obra", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "1", kind: "quote", totalPages: 200 },
      { item_type: "book", item_id: "1", kind: "note", totalPages: 200 },
    ]);
    expect(r.works[0].per100).toBe(1);
  });

  it("separa citas de notas: son dos gestos distintos", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "1", kind: "quote", totalPages: 100 },
      { item_type: "book", item_id: "1", kind: "quote", totalPages: 100 },
      { item_type: "book", item_id: "1", kind: "note", totalPages: 100 },
    ]);
    expect(r.quotes).toBe(2);
    expect(r.notes).toBe(1);
  });

  it("una obra sin páginas en ficha no puede normalizarse y se dice", () => {
    const r = computeNotesPerWork([
      { item_type: "book", item_id: "1", kind: "note", totalPages: null },
    ]);
    expect(r.works).toHaveLength(0);
    expect(r.unmeasurable).toBe(1);
  });
});
```

- [ ] **Step 2: Ejecutar, implementar, ejecutar**

Run: `npx vitest run src/lib/stats/get-notes-per-work.test.ts`
`getNotesPerWork` lee `notes` del dueño (`user_id`), agrupa por `item_type` + `item_id`, cruza con `books.total_pages`. `is_public` **no** entra: es una estadística del usuario sobre sí mismo.

- [ ] **Step 3: El panel y commit**

`viz: "lollipop"`, unidad propia («notas / 100 págs.»), sección `habitos`.

```bash
git add src/lib/stats/get-notes-per-work.ts src/lib/stats/get-notes-per-work.test.ts src/lib/stats/panel/specs.ts src/app/estadisticas/page.tsx
git commit -m "feat(estadisticas): las obras que mas te hacen escribir, por cada cien paginas"
```

---

### Task C6: «Velocidad real» — páginas por hora

`computePagesPerDay` (`get-pace.ts:16`) divide por **días distintos**, así que mezcla una sesión de tres horas con una de diez minutos.

**Files:** `src/lib/stats/get-pace.ts`, `src/lib/stats/habits-pace.test.ts`, `specs.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
describe("páginas por hora", () => {
  it("divide por tiempo leído, no por días", () => {
    // 60 páginas en 90 minutos = 40 págs/hora. Por días serían 60.
    expect(
      computePagesPerHour([
        { pass_id: "p", session_date: "2026-01-01", position: { page: 30 }, duration_minutes: 45 },
        { pass_id: "p", session_date: "2026-01-01", position: { page: 60 }, duration_minutes: 45 },
      ]),
    ).toBe(40);
  });

  it("las sesiones sin duración no entran en la media", () => {
    expect(
      computePagesPerHour([
        { pass_id: "p", session_date: "2026-01-01", position: { page: 30 }, duration_minutes: null },
      ]),
    ).toBeNull();
  });

  it("cada relectura arranca su cursor en cero", () => {
    // Mismo libro, dos pases: el avance del segundo no se mide contra el primero.
    const v = computePagesPerHour([
      { pass_id: "a", session_date: "2026-01-01", position: { page: 300 }, duration_minutes: 60 },
      { pass_id: "b", session_date: "2026-02-01", position: { page: 60 }, duration_minutes: 60 },
    ]);
    expect(v).toBe(180);
  });
});
```

- [ ] **Step 2: Ejecutar, implementar, ejecutar**

Run: `npx vitest run src/lib/stats/habits-pace.test.ts -t "páginas por hora"`
Reutiliza el agrupado por `pass_id` de `computePagesPerDay` — **DRY**: extraer el «avances positivos por pase» a un helper que usen las dos, no copiarlo.

⚠️ Solo sesiones **con** `duration_minutes`. Las que no lo traen no entran en la media, igual que hace `computeHabits` con `averageMinutes`, y el panel dice cuántas quedaron fuera.

- [ ] **Step 3: El panel y commit**

`viz: "bullet"`, un punto por género con `target` en la media propia.

```bash
git add src/lib/stats/get-pace.ts src/lib/stats/habits-pace.test.ts src/lib/stats/panel/specs.ts
git commit -m "feat(estadisticas): velocidad real en paginas por hora, no por dia"
```

---

### Task C7: cerrar la fase — medir, documentar, abrir issues

- [ ] **Step 1: Medir el muro**

Cronometrar el `Promise.all` con las 25 consultas y comparar con la línea base tomada al empezar la fase. **El número va en el cuerpo de la PR**, en una tabla antes/después. Si alguna consulta nueva es la más lenta del conjunto, o se indexa o sale con su issue.

- [ ] **Step 2: e2e contra build de producción**

Run: `npm run build && npm run start` y después `npm run test:e2e`.
Expected: PASS. **Es obligatorio hacerlo contra build**: un `use cache` mal puesto pasa `next build` y falla en `next start` (`next-request-in-use-cache`).

- [ ] **Step 3: Documentación**

`docs/requirements/data-model.md` **no** cambia (esta fase no toca esquema), pero se relee la §3 y se actualiza su fecha de verificación si se encuentra deriva. Casilla en `docs/requirements/backlog.md`. Entrada al final de `decisiones.md`: por qué las estadísticas de abandono viven solo en el muro privado.

- [ ] **Step 4: Abrir las issues de lo que queda fuera**

```sh
gh issue create --label "area:sagas,tipo:feature,P3" \
  --title "Progreso por saga: cuánto llevas de cada una" \
  --body "saga_follows, saga_route_entries y saga_optional_skips no alimentan ninguna estadística. Es el diferenciador del producto y no aparece en ningún sitio. Va en la PÁGINA DE LA SAGA, no en el muro de /estadisticas: el muro ya es largo y este dato se consulta mirando esa saga, no revisando el año. Muestra: sagas siguiendo, % completado por saga, y qué proporción de opcionales te saltas (profiles.show_optional_readings ya modela la preferencia). Origen: spec 2026-08-21 §6.6."

gh issue create --label "area:catalogo,tipo:feature,P3" \
  --title "Cuatro estadísticas baratas que quedaron fuera del muro" \
  --body "Cada una es una consulta y salen de columnas ya en producción. (1) Espera en la pila: planned_on → started_on; OJO, planned_on es forward-only y es NULL en todo lo importado (#361) — el denominador tiene que decirlo o el número miente. (2) Qué proporción de lo terminado llegas a valorar: rating es nullable; audita al resto del muro, porque si valoras el 30 % tus rankings de nota hablan de un tercio de la biblioteca. (3) Idiomas de lectura: book_editions.language; publishers ya tiene ranking, idioma no. (4) Dónde abandonas una serie, por temporada: episode_watches + series_episodes; seasonsCompleted existe, el punto de fuga no. Origen: spec 2026-08-21 §6.7. No entraron para no engordar el muro, que era el problema de partida."
```

- [ ] **Step 5: Commit final**

```bash
git add docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "docs(estadisticas): cierra la fase C — backlog, decisiones e issues de lo pendiente"
```

---

## Self-Review

**Cobertura de la spec.** §4.1 → A1. §4.2 → A2 (`area`), A3 (`lollipop`), A4 (`waffle`), A5 (`bullet`), C1 (`dumbbell`, movido con su consumidor). §4.3 → **no se hace**, y se justifica arriba con la regla que lo impide, más issue `tipo:deuda`. §4.4 → A7 Step 4, issue `tipo:acta`. §5 niveles 1/2/3 → B3, B4, B1+B2. §6.1 → C3. §6.2 → C4. §6.3 → C2. §6.4 → C5. §6.5 → C6. §6.6 → issue (fuera de alcance a propósito). §6.7 → issue. §7 rendimiento → nota de apertura de fase C y C7 Step 1. §8 accesibilidad → Global Constraints y los tests de foco de A3/A5/C1. §9 → A7 Steps 2-4, B4 Step 6, C7 Steps 3-4.

**Sin huecos conocidos.** Dos desvíos respecto a la spec, ambos argumentados y con issue: el selector de faceta y el traslado de `dumbbell`.

**Consistencia de nombres.** `derived.viz` (no `effectiveViz`, que es la función privada). `PanelDatum.target` lo consume solo `bullet`; `PanelDatum.from` solo `dumbbell`. `computeX` es el cálculo puro y `getX` la consulta, en los cinco getters, siguiendo `computeHabits`/`getHabits` y `computePagesPerDay`/`getPagesPerDay`.

**Riesgo principal.** El invariante de B2: seis sitios, y no lo caza el typecheck. Por eso el test que lo afirma es una guardia de **texto** sobre el fichero, no de comportamiento — es el único invariante del sistema que no se puede afirmar de otra forma.
