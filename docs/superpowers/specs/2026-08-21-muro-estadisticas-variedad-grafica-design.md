# Diseño: variedad gráfica y panel adaptativo en el muro de `/estadisticas`

- **Fecha**: 2026-08-21
- **Estado**: propuesta, con plan escrito en
  `docs/superpowers/plans/2026-08-21-muro-estadisticas-variedad-grafica.md`.
  **Dos puntos de esta spec quedaron corregidos al escribir el plan — ver §12.**
- **Área**: `area:ui` (fases A y B) · `area:catalogo` (fase C)
- **Origen**: la pantalla se lee repetitiva y sin fluidez, y con biblioteca pequeña se ve
  hueca. Revisión comparativa contra el catálogo de visualizadores de
  `https://amicro.vercel.app/mono-charts` (2026-08-21).
- **Mockup**: <https://claude.ai/code/artifact/57990194-d7be-49d9-bb7a-292d940ed8ca>
  (cuatro tableros: muro rediseñado · repertorio gráfico · estadísticas nuevas · panel
  dinámico). Construido con los tokens reales de `globals.css`.

---

## 1. Problema

Tres problemas distintos que la queja original («repeticiones», «poca fluidez») mezcla, y
que se arreglan por separado.

### 1.1 El muro no dibuja

`PanelViz` (`src/lib/stats/panel/types.ts:143`) declara diez valores. `Chart`
(`src/components/stats/panel/charts.tsx:835`) dibuja siete. `ranking`, `kpi` y `table` son
texto puro.

Reparto real, contando **llamadas** y no sitios del fichero — `ratedGroupPanel` se invoca
tres veces (`specs.ts:272-274`):

| viz | paneles | dibuja |
|---|---|---|
| `kpi` | 11 | no |
| `ranking` | 7 | no |
| `bars` | 5 | sí |
| `donut` | 3 | sí |
| `stacked` | 2–4 (2 condicionales) | sí |
| `line` | 1 | sí |
| `heatmap` | 1 | sí |
| `gauge` | 1 | sí |

**18 de ~33 paneles no pintan un solo píxel.** La repetición no está en los gráficos: está
en que más de la mitad del muro es tipografía.

Caso agudo: la sección «Valoraciones» encadena **tres rankings seguidos** —
`nota-generos`, `nota-autores`, `nota-directores` — tres listas de texto idénticas en fila.

Además, `area` está en el dispatcher (`charts.tsx:844`) y **no lo usa ningún panel**. Rama
muerta desde que se escribió.

### 1.2 El ritmo del muro es plano

El muro es masonry multicolumna por sección (`columns-1 lg:columns-2 xl:columns-3`,
`src/app/estadisticas/page.tsx:315`). Varía el alto de las tarjetas; **el ancho no**. Son
33 rectángulos del mismo ancho en tres columnas.

Cambiar el tipo de gráfico cambia el *interior* de la tarjeta, no el *ritmo* de la página.
Meter ocho formas nuevas sin tocar el ritmo deja 33 rectángulos iguales con un zoo dentro.

La rejilla (`grid`) se descartó a propósito y está documentado en `page.tsx:305-315`
(igualaba el alto de cada fila y dejaba huecos muertos). Multicolumna sí sabe hacer que un
elemento ocupe todas las columnas: `column-span: all`.

### 1.3 Un panel sin datos ocupa lo mismo que uno lleno

`fitsPeriod` (`specs.ts:184`) ya esconde los paneles que no encajan con el periodo elegido,
y `hiddenPanelCount` (`specs.ts:210`) hace que la página **diga cuántos esconde** — «lo dice
la página, no se calla». Ese criterio se respeta y se extiende, no se sustituye.

Lo que falta es densidad: un panel vacío se pinta como tarjeta a tamaño completo con una
frase dentro (`stat-panel.tsx:140-151`). Quien acaba de registrarse ve una pared de
tarjetas grandes vacías.

---

## 2. Principios que acotan la solución

`docs/design/paneles-estadisticos.md` es canónico y **no se relaja**. Dos de sus principios
deciden qué formas entran y cuáles no:

- **Principio 3** — «No hay dato que exija medir una altura, un área o un ángulo». Esto
  descarta treemap y burbujas, y es el argumento *a favor* del waffle: una rejilla de cien
  celdas se **cuenta**, no se mide.
- **Principio 1** — cada panel lleva sus valores exactos en tabla **o escritos dentro del
  gráfico**, con las marcas focalizables. `SELF_DESCRIBING` (`stat-panel.tsx:64`) es la
  lista de los que se ganaron perder la tabla. **Añadir un `viz` a esa lista obliga a que
  su gráfico escriba sus cifras y sea focalizable; quitarlo obliga a devolverle la tabla.**

Consecuencia directa: **el donut es el único gráfico que hoy pelea con el principio 3**, y
hay tres.

---

## 3. Alcance: tres fases, tres PRs

Cada fase deja software funcionando y revisable por separado. No se mezclan: la fase A no
toca ninguna consulta, la C añade siete.

| Fase | Qué | Consultas nuevas | Esquema |
|---|---|---|---|
| **A** | Ritmo del muro y formas nuevas | 0 | no |
| **B** | Panel adaptativo (tres niveles) | 0 | no |
| **C** | Estadísticas nuevas | 7 | no |

---

## 4. Fase A — ritmo y formas

### 4.1 Panel héroe por sección (`column-span: all`)

`PanelSpec` gana un campo opcional:

```ts
/**
 * El panel que preside su sección: ocupa las tres columnas del masonry.
 * UNO por sección como mucho, y el primero de la lista.
 */
hero?: true;
```

En `page.tsx` el panel marcado `hero` lleva `[column-span:all]` (utilidad arbitraria de
Tailwind; no hay clase propia). En multicolumna el elemento ocupa el ancho completo y el
resto sigue fluyendo debajo.

Héroes propuestos, uno por sección, elegidos por **necesitar el ancho**, no por importancia:

| Sección | Héroe | Por qué |
|---|---|---|
| Actividad | `calendario-anual` | 53 semanas comprimidas en un tercio de ancho |
| Valoraciones | `relecturas` (fase C) | etiquetas de título largas |
| Biblioteca | `backlog` | serie temporal de 12 meses |
| Resumen · Hábitos · Gustos · Por categoría | ninguno | ninguna tarjeta pide ancho |

**Invariante:** como mucho un `hero` por sección, y va primero. Dos héroes seguidos parten
la sección en tres bandas y el masonry pierde el sentido. Se verifica en test unitario
sobre `buildStatsSections`.

### 4.2 Cuatro `viz` nuevos y uno resucitado

`PanelViz` pasa a:

```ts
export type PanelViz =
  | "bars" | "stacked" | "line" | "area" | "donut" | "gauge" | "heatmap"
  | "lollipop"   // NUEVO
  | "waffle"     // NUEVO
  | "dumbbell"   // NUEVO
  | "bullet"     // NUEVO
  | "ranking" | "kpi" | "table";
```

Todo dibujado a mano en SVG, igual que lo de hoy: **el proyecto no tiene ninguna librería de
gráficos en `package.json` y no se añade ninguna.** Cada forma es un componente en
`charts.tsx` y un `case` en el dispatcher.

**`lollipop`** — sustituye a `ranking` en los siete paneles de ranking. Consume el mismo
`PanelDatum` (`key`/`label`/`value`/`detail`) sin tocar ni un getter. Etiqueta a la
izquierda, tallo, punto, valor exacto a la derecha.
⚠️ `ranking` está hoy en `TEXTUAL` (`stat-panel.tsx:47`). Al pasar a `lollipop` **sale de
`TEXTUAL` y entra en `SELF_DESCRIBING`**, lo que obliga a que escriba su valor y sea
focalizable — ver §2. La lista completa con enlaces sigue viviendo en la capa
(`RankingList`), que es donde ya estaba.

**`waffle`** — sustituye a `donut` en `por-tipo`, `estados` y `pila`. Cien celdas, rellenadas
en orden por serie. Cumple el principio 3 sin tabla auxiliar porque el dato se cuenta.
Escala: con menos de 100 puntos totales, una celda = una obra y se dice en el rótulo; con
más, una celda = 1 % y también se dice.

**`dumbbell`** — dos puntos unidos por un segmento: valor anterior → valor actual. Su primer
consumidor es `relecturas` (fase C), pero su valor real es que `PanelKpi.delta` ya existe en
casi todos los paneles y hoy se pinta como texto («+12 obras más que en 2025»,
`stat-panel.tsx:349-361`). Es el elemento más repetido de la pantalla y es tipografía.

**`bullet`** — barra + marca de referencia. Consumidor: `records`, que hoy es `kpi` con
cifras sueltas y es semánticamente «valor contra tu mejor marca».

**`area`** — ya implementado (`charts.tsx:844`, `LineChart ... area`), sin consumidor.
`horas-por-mes` (`specs.ts:1695`) pasa de `"bars"` a `"area"`. **Cambio de una línea.**

### 4.3 Colapsar los tres rankings de nota en uno

`ratedGroupPanel` produce hoy tres paneles (`specs.ts:272-274`). Pasa a **un panel con
selector de faceta** (género · autor · director), como el resto de filtros del muro: por
`searchParams`, sin JavaScript de cliente.

Libera dos huecos de la sección y mata la fila de tres listas idénticas. Es lo que paga el
coste de los paneles que la fase C añade.

### 4.4 Lo que NO entra, y por qué

Se registra para que nadie lo reimplemente leyendo el mockup de amicro:

- **Treemap** y **burbujas** — codifican por área; las piezas pequeñas no caben su cifra.
  Incumplen el principio 3. No hay versión buena.
- **Scatter** (para `nota-segun-extension`) — con los pocos puntos de un usuario normal se
  ve vacío; con muchos deja de ser consultable uno a uno.
- **Radar de días de la semana** — los siete días no son un dato circular y el radar se lee
  mal. Solo tendría sentido para la franja horaria (24 sectores), y aun así con dudas.
- **Candlestick, Sankey, pirámide, cascada** — no tenemos ese dato.

Va como issue `tipo:acta`, no como pendiente.

---

## 5. Fase B — panel adaptativo

**Tres niveles, no dos.** Ocultar a secas rompe el criterio que el propio código ya defiende
en `hiddenPanelCount`: un muro que esconde en silencio miente sobre lo que existe.

### Nivel 1 — vacío estructural

El dato **no puede** existir: no hay ni una serie registrada, luego los paneles de episodios
nunca se llenarán.

El panel se pliega a una línea (`<details>` nativo, cerrado) y **se cuenta**, con el mismo
patrón que el periodo: «3 paneles plegados: no tienes ninguna serie registrada».

`PanelSpec` gana:

```ts
/**
 * Por qué este panel no puede tener datos, con independencia del periodo.
 * `undefined` = puede tenerlos. La frase entra en el recuento de la sección.
 */
structurallyEmpty?: string;
```

### Nivel 2 — vacío por filtro

Hay datos, pero no bajo el filtro elegido. **No es un vacío: es consecuencia de lo que quien
mira acaba de elegir.**

Tarjeta compacta de una línea: título + la cifra que *sí* existe fuera del filtro + salida
(«Ver todo el año ›»). Hoy ocupa lo mismo que un panel lleno, y ahí está el aire.

Requiere que `empty` deje de ser solo `{ title, message }` y pueda llevar una cifra de
contexto y una acción:

```ts
empty?: {
  title: string;
  message?: string;
  /** Cifra que sí existe fuera del filtro actual. Sin ella, no se ofrece salida. */
  elsewhere?: { text: string; href: string; label: string };
};
```

### Nivel 3 — pocos datos: se degrada el gráfico, no el panel

**Este es el que cambia el sistema.** Una `line` con dos puntos es fea; esos mismos dos
puntos como cifra + variación son correctos.

`viz` deja de ser un valor fijo de la spec: **lo elige `derive()`** (`src/lib/stats/panel/derive.ts:52`),
que ya recibe la spec entera y ya calcula `known`, `isEmpty` y `allZero`. `PanelDerived`
gana `viz: PanelViz` — el **efectivo**.

Tabla de degradación, cerrada:

| `viz` de la spec | `known.length` | `viz` efectivo |
|---|---|---|
| `line` · `area` | < 4 | `kpi` |
| `donut` · `waffle` | < 3 | `kpi` |
| `lollipop` · `bars` · `stacked` · `bullet` · `dumbbell` | < 2 | `kpi` |
| cualquiera | 0 | estado vacío (nivel 1 o 2) |

⚠️ **Invariante de implementación, y es donde esto se rompe.** `StatPanel` consulta hoy
`spec.viz` en **seis** sitios (verificado el 2026-08-21):

| línea | uso | qué decide |
|---|---|---|
| `stat-panel.tsx:160` | `TEXTUAL.includes(spec.viz)` | si dibuja o es texto |
| `stat-panel.tsx:175` | `SELF_DESCRIBING.includes(spec.viz)` | si pierde la tabla |
| `stat-panel.tsx:195` | `PLAIN_VIZ.includes(spec.viz)` | si el gráfico va `aria-hidden` |
| `stat-panel.tsx:221` | `spec.viz === "ranking"` | lista recortada en la cara |
| `stat-panel.tsx:261` | `spec.viz === "ranking"` | lista completa en la capa |
| `stat-panel.tsx:269` | `spec.viz === "table"` | tabla de valores exactos |

**Los seis pasan a `derived.viz`.** `table` no degrada nunca, pero también se enruta: una
sola regla, no dos con una excepción que el siguiente que lo lea no vea.

Uno que se quede leyendo `spec.viz` da un panel que dice tener tabla y no la tiene, o al
revés — **y no lo caza el typecheck**, porque ambos campos son `PanelViz`.

**Límite fijado a propósito:** los umbrales van solo en 0, 1, 2 y 3 puntos. **Nunca por
estética.** Si la forma cambiase por gusto, el panel se vería distinto cada visita y se
perdería la comparación mental, que es justo lo que un muro de estadísticas existe para dar.
Y un panel degradado **lo dice** en su rótulo, para que nadie crea que el gráfico desapareció.

---

## 6. Fase C — estadísticas nuevas

Ninguna necesita esquema nuevo: todas salen de columnas que ya están en producción y que hoy
no alimentan ningún panel.

### 6.1 Por qué abandonas · `motivos-abandono`

`passes.dropped_reason` (enum `no_enganchado|aburrido|no_es_momento|no_esperado|otro`,
migración `20260858_pass_dropped_reason.sql`, dev y prod desde 2026-08-14). `viz: "lollipop"`.

⚠️ **Restricción de seguridad, no de producto.** La columna es **siempre privada**, con
independencia de `is_public`. `passes` **no concede `SELECT`** sobre ella a nadie: la única
vía de lectura es la vista `public.pass_reviews`, `SECURITY DEFINER` y enmascarada por
`d.user_id = auth.uid()`. Ver §3 de `docs/requirements/data-model.md`.

Consecuencias que el plan debe respetar:
- El getter lee de `pass_reviews`, **nunca** de `passes`.
- El panel vive **solo** en `/estadisticas` (privada, del dueño). **No** puede aparecer en
  la pestaña pública del perfil (`src/app/u/[username]/_tabs/stats-tab.tsx`).
- Sin `use cache` bajo ninguna circunstancia: el dato depende de `auth.uid()` (regla #437 de
  `AGENTS.md`).
- Los pases `dropped` anteriores al 2026-08-14 tienen motivo `NULL` (sin backfill). El
  denominador honesto es «de los 18 abandonos, 11 tienen motivo».

### 6.2 Dónde abandonas · `punto-abandono`

`passes.position` (jsonb, `{"page": 42}`) contra `books.total_pages`. Da el % de avance al
abandonar, y el **punto de no retorno**: el porcentaje por encima del cual nunca se ha
abandonado. Misma restricción de privacidad que 6.1 si se combina con el motivo.

⚠️ `position` **no se valida en BD** (trade-off aceptado, §3 del modelo de datos). El getter
valida forma y descarta lo que no case, y los libros sin `total_pages` van al denominador de
«no medibles», no al cálculo.

### 6.3 Cómo cambia tu nota al releer · `relecturas`

El esquema está diseñado para esto y nadie lo mira: *«El pase es dueño de la nota y la
reseña — cada relectura puede tener su propia valoración»*. Hoy `getRecords` solo devuelve
`rereads: number` (`get-records.ts:14`), un contador.

`viz: "dumbbell"`, `hero: true` en su sección.

⚠️ `rereadCount` **no es el ordinal del pase**: cuenta los pases CERRADOS, el actual es +1.
Trampa ya documentada; la primera lectura siempre sale bien, así que el fallo pasa
desapercibido hasta que alguien relee.

### 6.4 Las obras que más te hacen escribir · `notas-por-obra`

`notes` (`kind` `note|quote`, `item_type`/`item_id`, `parent_note_id` para cita→nota hija)
contra `books.total_pages`. Notas por cada 100 páginas. `viz: "lollipop"`.

Vertical entera sin una sola estadística hoy. Solo notas del dueño — `is_public` no entra en
el cálculo, que es del usuario sobre sí mismo.

### 6.5 Velocidad real · `paginas-por-hora`

`computePagesPerDay` (`get-pace.ts:16`) divide por **días distintos**, así que mezcla una sesión
de tres horas con una de diez minutos. `progress_sessions` ya trae `duration_minutes` y
`position`: páginas/hora sale de datos que la consulta de hábitos **ya está trayendo**.

Extiende `get-pace.ts` en vez de crear un getter nuevo. `viz: "bullet"` (por género, contra
la media propia).

⚠️ Solo sesiones **con** `duration_minutes`. Las que no lo traen no entran en la media, igual
que hace hoy `computeHabits` con `averageMinutes`, y el panel dice cuántas quedaron fuera.

### 6.6 Cuánto llevas de cada saga

`saga_follows`, `saga_route_entries`, `saga_optional_skips`. Es el diferenciador del producto
y no aparece en ninguna estadística.

**Va en la página de la saga, no en el muro.** El muro ya es demasiado largo y este dato se
consulta cuando estás mirando esa saga, no cuando revisas tu año. Fuera del alcance de esta
spec: se abre como issue `tipo:feature` propia.

### 6.7 Baratas, de una consulta

Entran si sobra sitio tras el colapso de §4.3; si no, issue por cada una:

- **Espera en la pila**: `planned_on` → `started_on`. `medianWaitMonths` solo mira lo
  pendiente. ⚠️ `planned_on` es **forward-only** y es `NULL` en todo lo importado (#361) —
  el denominador tiene que decirlo o el número miente.
- **Qué proporción de lo terminado llegas a valorar** (`rating` es nullable). Audita al resto
  del muro: si valoras el 30 %, tus rankings de nota hablan de un tercio de la biblioteca.
- **Idiomas de lectura**: `book_editions.language`. `publishers` ya tiene ranking; idioma no.
- **Dónde abandonas una serie**, por temporada: `episode_watches` + `series_episodes`.

---

## 7. Rendimiento

El muro son hoy 18 consultas tras **un solo** `<Suspense>` (#440, `page.tsx:149`), un
boundary a propósito y no por descuido: varias consultas alimentan varias secciones.

La fase C añade siete. El muro entero llega cuando termina **la más lenta**, así que:

- Cada getter nuevo entra en el mismo `Promise.all` de `StatsWall`.
- Ninguno de los nuevos puede tardar más que el más lento de los actuales. Se mide antes de
  fusionar y el número va en la PR; si uno se pasa, o se indexa o se queda fuera con su issue.
- **Nada de `use cache`** en los getters de fase C: todos dependen de `auth.uid()` vía RLS.
  Cachear uno es una fuga de datos entre cuentas que **no se ve en desarrollo** — regla #437.

---

## 8. Accesibilidad y tema

- Toda serie nueva lleva **glifo de forma y nombre**, no solo color (principio 2). Medido:
  `--type-movie` y `--type-series` tienen ΔE 1,1 en deuteranopia.
- Las cuatro formas nuevas se pintan con tokens de `globals.css`, nunca con hex literal:
  paleta clara y oscura salen gratis. El mockup solo trae tema claro; la implementación no
  puede.
- `lollipop`, `waffle`, `dumbbell` y `bullet` entran en `SELF_DESCRIBING`, luego **cada marca
  es focalizable con teclado y escribe su cifra**. Si una no llega a serlo, se queda fuera de
  la lista y conserva su tabla. No hay término medio.

---

## 9. Definición de «hecho» (AGENTS.md)

Por fase, antes de cerrar la PR:

- **A y B**: `docs/design/paneles-estadisticos.md` con la fecha de verificación al día — se
  toca el contrato (`PanelViz`, `SELF_DESCRIBING`, `TEXTUAL`, `hero`, `derived.viz`). Entrada
  **al final** de `docs/requirements/decisiones.md` (append-only) por dos decisiones: waffle
  en lugar de donut por el principio 3, y `viz` elegido en `derive()`.
- **C**: `docs/requirements/data-model.md` **no** cambia (no se toca esquema), pero sí su
  fecha de verificación si al leer se descubre deriva. Casilla en
  `docs/requirements/backlog.md`.
- **Ninguna fase añade columnas**, así que la superficie 6 de `DRIFT-CHECK.md` (grants por
  columna) no aplica. Si eso cambia, aplica y es obligatoria.
- Todo lo que quede fuera —§6.6, las de §6.7 que no entren, las formas descartadas de §4.4—
  **nace como issue con sus tres etiquetas en el mismo comando**, no como TODO ni como nota
  de PR.

## 10. Orden y por qué

1. **§4.1 panel héroe** — layout puro, cero datos, y es lo que más arregla la queja original.
2. **§4.2 `lollipop` + §4.3 colapso de rankings** — mata la peor repetición y libera sitio.
3. **§4.2 `area` en `horas-por-mes`** — una línea, con el componente ya escrito.
4. **§4.2 `waffle`** — corrige una infracción del propio doc.
5. **Fase B** — necesita las formas de A para que la tabla de degradación tenga sentido.
6. **Fase C** — §6.1 y §6.3 primero: son las dos que hacen que la pantalla diga algo que
   quien la mira no sabía.

## 11. Riesgos

- **El invariante de §5** (cinco sitios leyendo `spec.viz`) es el fallo probable de toda la
  spec: no lo caza el typecheck y se manifiesta como tabla duplicada o dato inalcanzable para
  un lector de pantalla. Test unitario sobre `StatPanel` que afirme que ningún camino lee
  `spec.viz`.
- **`column-span: all` en masonry** puede desequilibrar el reparto de las tarjetas que quedan
  debajo si la sección tiene pocas. Se prueba con secciones de 2, 3 y 7 paneles.
- **Que la fase C engorde el muro** en vez de mejorarlo. Por eso §4.3 va **antes** que la
  fase C, y no después.

---

## 12. Correcciones (2026-08-21, al escribir el plan)

Dos puntos de esta spec no sobrevivieron al contacto con el código. Se dejan escritos aquí
en vez de reescribir las secciones, para que se vea qué se propuso y por qué no se hizo.

### 12.1 El selector de faceta de §4.3 NO se hace

**Choca con una regla explícita.** `src/lib/stats/filter.ts:4-6`: *«acota TODOS los paneles
de la vista a la vez — **nunca hay un filtro por panel**: dos filtros distintos en la misma
pantalla hacen imposible saber qué compara cada cifra con cuál»*. `page.tsx:114` lo repite.

Los tres paneles de `ratedGroupPanel` se quedan. Lo que se arregla es la **forma** (pasan a
`lollipop`) y el **orden** (dejan de ir seguidos). El problema real eran tres *listas de
texto idénticas* en fila, y eso desaparece sin inventar un concepto de filtro nuevo.

Queda como issue `tipo:deuda`. Si algún día se hace, `faceta` tendría que ser un filtro
**global** en la fila de filtros: excepción deliberada a una regla documentada, que va a
`decisiones.md` **antes** de escribirse.

Consecuencia sobre §10: el orden de fase A pierde el paso «colapsar rankings», y la fase C
ya no tiene dos huecos esperándola. Si el muro se hace largo, lo que sobra se decide
mirándolo, no reservando sitio por adelantado.

### 12.2 `dumbbell` se mueve de la fase A a la C

§4.2 lo ponía en fase A. Ahí **no tiene consumidor**: su primer usuario es `relecturas`, que
es §6.3, fase C. Construirlo antes es YAGNI. Se hace justo antes del panel que lo usa.

El argumento de §4.2 sobre `PanelKpi.delta` sigue en pie —la variación es hoy tipografía y es
lo más repetido de la pantalla— pero convertir los deltas en dumbbells es un cambio propio,
con su propia decisión de diseño, y no entra en este plan.
