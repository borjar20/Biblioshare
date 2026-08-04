# Sistema de paneles estadísticos

[Canónico · verificado contra código el 2026-08-04]

Manda para: **cualquier panel que muestre un dato agregado** — actividad, evolución,
distribución, progreso, comparativas, porcentajes, objetivos, estados, rankings o
acumulados. No es una guía de estilo de gráficos: es el contrato que todo panel cumple.

Implementación: `src/lib/stats/panel/` (datos, transformación, interpretación) y
`src/components/stats/panel/` (presentación). Primer consumidor: `/estadisticas`.

---

## 1. Principios

Nueve reglas. Las cuatro primeras son las que se incumplían antes del rediseño.

1. **El gráfico no es la única forma de acceder al dato.** Cada panel lleva resumen
   textual, indicadores y tabla. El gráfico se puede borrar sin perder información.
2. **El color no diferencia nada por sí solo.** Toda serie lleva glifo de forma
   (`● ■ ▲ ◆`) y nombre en la tabla. *Medido:* `--type-movie` y `--type-series` tienen
   ΔE 1,1 en deuteranopia (umbral 8) y 10,5 en visión normal (umbral 15) — quien
   distinga esas dos series por el color, lo hace por suerte.
3. **Todo valor importante se lee exacto.** No hay dato que exija medir una altura,
   un área o un ángulo. El `title=` de un `<div>` no cuenta: no existe con teclado ni
   en táctil.
4. **Un hueco no es un cero.** `null` = no se midió, y se lee «Sin datos». `0` = se
   midió y salió cero. Un mes futuro, un objetivo sin configurar y una división por
   cero son huecos. Se prohíbe explícitamente la altura mínima cosmética que hacía
   parecer dato a un cero.
5. **Una sola fuente por panel.** Resumen, indicadores, gráfico y tabla se calculan
   del mismo `PanelSpec`, vía `derive()`. Ningún componente visual recibe un número
   ya escrito ni una conclusión ya redactada.
6. **El texto se adapta al dato.** Con un punto no hay máximo; sin total no hay cuota;
   sin comparación no hay variación. La regla que no se sostiene se calla, no rellena.
7. **Toda variación dice cuatro cosas:** valor, dirección, unidad y periodo de
   comparación. «+12 obras más que en 2025», nunca una flecha verde suelta.
8. **Todo panel declara su alcance.** Periodo, filtros y unidad, dentro del panel. Un
   panel que ignora el filtro de la página (una foto del momento) lo dice; si no,
   miente por omisión.
9. **Los filtros van en una fila, arriba, para todo el muro.** Nunca un filtro dentro
   de una tarjeta.

## 2. Jerarquía de contenido: dos densidades, un solo árbol

El panel entero es un `<details>`. **La tarjeta completa es el control**: se pulsa en
cualquier punto, funciona con teclado y se anuncia como desplegable, sin una línea de
JavaScript.

```
PLEGADO  (vista general — sin prosa)      DESPLEGADO  (el detalle)
┌────────────────────────────────┐        ├─ descripción     ← cómo se calcula
│ 2 Rótulo: periodo · alcance ·  │        ├─ 3 resumen completo
│   unidad                       │        ├─ 4 resto de indicadores
│ 1 Título                       │        ├─ 7 tabla de valores exactos
│ 4 Cifra que preside            │        ├─ 2 contexto en frase larga
│ 3 Una frase: lo que DESTACA    │        ├─ 8 notas
│ 5 Visualización + leyenda      │        └─ 10 acciones
│ 6 «Ver detalle ↓»              │
└────────────────────────────────┘        9 Estados sustituyen a todo esto
```

El orden del DOM **es** el orden de lectura y el de importancia. Quien entre en la
región y no siga leyendo ya se ha llevado la respuesta.

**Tres reglas de la vista compacta**, que es donde es fácil deshacer todo el trabajo:

1. **Plegado sigue habiendo cifra en texto.** La preside un `<dl>` de verdad; si la spec
   no declara indicadores, `heroKpi` fabrica uno con el total. Un panel plegado nunca es
   un dibujo a secas.
2. **La frase compacta es la SEGUNDA del resumen, no la primera.** La primera dice el
   total, y el total ya está ahí en 32 px: repetirlo gasta la única línea de prosa que
   tiene la vista general. La segunda dice lo que destaca.
3. **La leyenda viaja al bloque compacto.** Un anillo plegado sin leyenda sería
   identidad por color y nada más.

**La decisión que sostiene la accesibilidad:** el gráfico va `aria-hidden` y la tabla
es el dato. La alternativa —un `aria-label` por barra— duplica cada cifra en el árbol
accesible, obliga a mantener dos copias y las desincroniza al primer cambio.

## 3. Plantilla genérica

```
PLEGADO ─────────────────────────────────────────────┐
│ 2026 · MIN                                      ⌄  │ 2  rótulo mono
│ Horas por mes                                      │ 1  título serif
│                                                    │
│ 25 min                                             │ 4  cifra que preside
│ Total                                              │
│                                                    │
│ Máximo: Julio (25 min); mínimo: Enero (0 min).     │ 3  lo que DESTACA
│                                                    │
│ ─ ─ ─ ─ ─ ─ █ ─ ·  ·  ·  ·                         │ 5
│ E F M A M J J A S  O  N  D                         │
│                  └─ ─ = cero medido                │
│                     · = sin datos                  │
│ VER DETALLE ↓                                      │ 6
└────────────────────────────────────────────────────┘

DESPLEGADO (se añade debajo, al pulsar la tarjeta) ──┐
│ Solo cuenta sesiones con duración registrada.      │    descripción
│                                                    │
│ Total 25 minutos en 8 puntos. Máximo: Julio        │ 3  resumen completo
│ (25 min); mínimo: Enero (0 min). 4 de 12 puntos    │
│ sin datos.                                         │
│                                                    │
│ ┌────────────┬──────────┬──────────┐               │ 7
│ │ Mes        │  Minutos │    Cuota │               │
│ ├────────────┼──────────┼──────────┤               │
│ │ Enero      │    0 min │      0 % │               │
│ │ Julio      │   25 min │    100 % │               │
│ │ Septiembre │ Sin datos│ Sin datos│               │
│ ├────────────┼──────────┼──────────┤               │
│ │ Total      │   25 min │          │               │
│ └────────────┴──────────┴──────────┘               │
│ «Sin datos» significa que no se registró medida,   │
│ no que valga cero. El total suma solo lo medido.   │
│                                                    │
│ 2026 · Sesiones de lectura. Valores en minutos.    │ 2  contexto largo
│ Un mes futuro aparece como «Sin datos», no cero.   │ 8  nota
│ Ver estadísticas completas ›                       │ 10 acciones
└────────────────────────────────────────────────────┘
```

### Wireframes de los estados (bloque 9)

```
CARGANDO                      VACÍO
┌───────────────────────┐     ┌───────────────────────┐
│ Horas por mes         │     │ Horas por mes         │
│ 2026 · … en minutos.  │     │ 2026 · … en minutos.  │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒        │     │                       │
│ ▒▒▒▒▒▒▒▒              │     │ Sin sesiones este año │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │     │ Registra una sesión   │
│ (sr-only: "Cargando   │     │ con su duración para  │
│  Horas por mes…")     │     │ empezar a acumular.   │
└───────────────────────┘     └───────────────────────┘
 aria-busy="true"              NUNCA una fila de ceros

ERROR                         PARCIAL
┌───────────────────────┐     ┌───────────────────────┐
│ Horas por mes         │     │ Horas por mes         │
│ 2026 · … en minutos.  │     │ 2026 · … en minutos.  │
│ ┌───────────────────┐ │     │ ⚠ Faltan las sesiones │
│ │ ⚠ No se han podi- │ │     │   de marzo: su import │
│ │ do cargar estos   │ │     │   aún no ha terminado.│
│ │ datos.            │ │     │                       │
│ │ [Reintentar]      │ │     │ Total 1.240 minutos…  │
│ └───────────────────┘ │     │ (panel normal debajo) │
└───────────────────────┘     └───────────────────────┘
 El aviso va ARRIBA del dato, no en nota al pie
```

## 4. Variantes por tipo de dato

`viz` elige la forma. Todo lo demás del contrato es idéntico en las trece.

| `viz` | Para qué | Gráfico | Columnas por defecto | Regla de resumen |
|---|---|---|---|---|
| `bars` | magnitud por categoría o periodo | barras, base anclada | label · valor · cuota | total, extremos, huecos |
| `stacked` | composición a lo largo del tiempo | barras apiladas, hueco de 1 px | label · **una por serie** · valor · cuota | total, extremos, reparto, variación |
| `line` | evolución continua | línea 2 px, **partida en los huecos** | label · valor · cuota | total, extremos, huecos |
| `area` | evolución con volumen | línea + relleno 14 % | ídem | ídem |
| `donut` | parte-todo, ≤ 6 sectores | anillo, resto en gris | label · valor · cuota | total, mayor y su cuota |
| `gauge` | progreso hacia objetivo | barra + marca de meta | label · valor | hecho / meta, cuánto falta, o «cumplido» |
| `heatmap` | densidad en calendario | rampa de **un** tono + el número dentro | label · valor | días activos sobre el total |
| `ranking` | orden por mérito | **ninguno**: `<ol>` real | label · valor | nº de posiciones, 1.ª y última |
| `kpi` | una o varias cifras sueltas | **ninguno**: `<dl>` | — | etiqueta, valor y variación |
| `table` | demasiadas categorías para un gráfico | **ninguno**: la tabla, sin plegar | todas | total y recuento |

Reglas de forma heredadas de la guía de dataviz: nunca dos ejes Y; el color sigue a la
entidad, jamás al ranking; secuencial = un tono claro→oscuro; más de ~7 clases de color
con significado ⇒ `table`; una sola barra o dos sectores ⇒ `kpi`.

**`ranking`, `kpi` y `table` no llevan tabla plegada aparte**: su contenido ya es texto
estructurado, y duplicarlo solo obliga al lector de pantalla a oírlo dos veces.

## 5. Reglas de generación del resumen

`buildSummary(spec)` en `src/lib/stats/panel/summary.ts`. Puras, probadas en
`summary.test.ts` (16 casos).

**Guardas, antes que nada:**

| Condición | Resultado |
|---|---|
| `spec.summary` presente | se usa tal cual (escotilla de escape) |
| ni un valor medido | `""` → el panel pinta su estado vacío |
| medido y todo a cero | «Sin actividad: los N puntos medidos valen cero» |
| < 2 puntos, o todos iguales | se omiten máximo y mínimo |
| `total <= 0` | se omite toda cuota (no es «0 %») |
| algún `null` | se añade «N de M puntos sin datos» |

**Frases, en orden:** dato principal → extremos → reparto → variación → huecos. Se
concatenan solo las que alguna regla llenó, así que el resumen encoge con el dato en
vez de arrastrar muletillas.

`summaryLines()` las devuelve **sueltas**, no unidas: la vista compacta enseña la
segunda (`buildHighlight`) y la ampliada las une todas (`buildSummary`). Partir el
párrafo por el punto sería adivinar dónde acaba cada frase.

**Concordancia**, que es donde falla un generador de texto en español:

| Trampa | Regla |
|---|---|
| «137 títulos repartid**as**» | La frase evita el participio: la unidad la elige cada panel y su género no se puede suponer. |
| «1 obra**s**» | `formatValue` pluraliza cuando el símbolo corto ES la palabra (`obras`, `días`); las abreviaturas de verdad (`min`, `%`, `★`) no se tocan. |
| «más que **en** la semana pasada» | El conector concuerda: `en` solo si el periodo empieza por dígito. |
| «los 1 puntos medidos» | El mensaje de todo-a-cero concuerda en singular y plural. |

**Variación** (`formatDelta`), siempre las cuatro señales:

```
+12 obras más que en 2025      −3 obras menos que en 2025
Sin cambios respecto a 2025    +5 minutos más que la semana pasada
```

Detalles de idioma que ya están resueltos: `−` es U+2212 (no el guion), el `%` lleva
espacio duro delante, la concordancia singular/plural sale de `Unit.one`/`Unit.many`, y
el conector concuerda con el periodo (`en 2025` vs `la semana pasada`).

## 6. Componentes reutilizables

| Módulo | Responsabilidad | Capa |
|---|---|---|
| `panel/types.ts` | `PanelSpec`, `Unit`, `UNITS`, estados | datos |
| `panel/derive.ts` | totales, extremos, escala, huecos, glifos | transformación |
| `panel/summary.ts` | la frase | interpretación |
| `panel/format.ts` | es-ES: número, unidad, cuota, variación | interpretación |
| `panel/specs.ts` | getter → `PanelSpec` (uno por panel) | configuración |
| `panel/stat-panel.tsx` | el armazón: los 10 bloques y los 5 estados | presentación |
| `panel/charts.tsx` | las 7 formas + leyenda. Todas decorativas | presentación |
| `panel/panel-table.tsx` | la tabla accesible | accesibilidad |

Separación estricta: `charts.tsx` no importa `format` ni `summary` — no puede escribir
un número; `summary.ts` no importa React — no puede pintar.

## 7. Modelo de datos

```ts
type PanelSpec = {
  id: string;                  // único: prefija los id de título y tabla
  title: string;
  description?: string;
  context: { period: string; filters?: string[]; scope?: string };
  viz: PanelViz;
  unit: Unit;                  // { short, one, many, decimals? }
  data: PanelDatum[];
  series?: PanelSeries[];      // { key, label, color, glyph? }
  target?: number | null;      // gauge
  kpis?: PanelKpi[];           // { label, value|text, unit?, delta?, hint? }
  summary?: string;            // sustituye al generado
  columns?: PanelColumnId[];   // "label"|"value"|"share"|"detail"
  labelHeader?: string; valueHeader?: string;
  note?: string;
  actions?: { label; href }[];
  state?: PanelState;          // ready | loading | error | partial
  empty?: { title: string; message?: string };
};

type PanelDatum = {
  key: string; label: string; short?: string;
  value: number | null;        // null = SIN DATO. 0 = cero real.
  parts?: { key: string; value: number | null }[];  // apilado
  detail?: string; href?: string;
};
```

**`"empty"` no es un estado que se declare**: se deriva de que no haya ni una medida.
Así nadie puede marcar como vacío un panel que sí trae ceros medidos — que es
exactamente el error que se quería impedir.

## 8. Microcopy

| Situación | Texto |
|---|---|
| Contexto | `2026 · Solo libros. Valores en minutos.` |
| Alcance ajeno al filtro | `Ahora mismo · Foto del momento: el selector de periodo no la afecta.` |
| Hueco | `Sin datos` (nunca «0», «—» ni «N/A») |
| Aclaración del hueco | `«Sin datos» significa que no se registró medida, no que valga cero. El total suma solo lo medido.` |
| Abrir la tabla | `Ver los 12 valores exactos` |
| Vacío | `Sin sesiones registradas este año` + `Registra una sesión con su duración para empezar a acumular.` |
| Error | `No se han podido cargar estos datos.` + acción de reintento |
| Parcial | `⚠ Faltan las sesiones de marzo: su importación aún no ha terminado.` |
| Cargando | `Cargando Horas por mes…` (solo lectores de pantalla) |
| Truncado | `Se muestran 6 de 23 géneros. Las cuotas se calculan sobre los mostrados.` |

Un vacío se escribe en dos frases: **qué falta** y **qué hacer**. Nunca «No hay datos» a
secas, que no dice si es culpa del filtro o de que no hay nada.

## 9. Semántica y ARIA

```html
<section aria-labelledby="horas-title">        <!-- región con nombre -->
  <details>
    <summary>                                   <!-- LA TARJETA ENTERA es el control -->
      <span class="label-section">2026 · min</span>
      <h2 id="horas-title">Horas por mes</h2>
      <dl><dd>25 min</dd><dt>Total</dt></dl>    <!-- la cifra, en texto -->
      <p>Máximo: Julio (25 min)…</p>            <!-- lo que destaca -->
      <div aria-hidden="true">…gráfico…</div>   <!-- decorativo -->
      <ul>…leyenda con glifo…</ul>              <!-- NO oculta: nombra series -->
    </summary>

    <div>
      <p>Total 25 minutos en 8 puntos…</p>      <!-- resumen completo -->
      <table>
        <caption class="sr-only">Horas por mes. 2026 · Sesiones. Valores en minutos.</caption>
        <thead><tr><th scope="col">Mes</th><th scope="col">Minutos</th></tr></thead>
        <tbody><tr><th scope="row">Enero</th><td>0 min</td></tr></tbody>
        <tfoot><tr><th scope="row">Total</th><td>25 min</td></tr></tfoot>
      </table>
    </div>
  </details>
</section>
```

El `<h2>` va **dentro** del `<summary>`: el nombre accesible del desplegable acaba
siendo «Horas por mes · 2026 · min · 25 min · Total…», que es informativo — dice qué se
va a abrir. A cambio, `aria-labelledby` de la región sigue apuntando al `<h2>`, así que
el panel conserva su nombre en la lista de regiones.

**Ningún enlace dentro del `<summary>`.** Un enlace dentro del control que abre la
tarjeta es una trampa de teclado: los enlaces de un ranking y de la tabla viven en el
bloque desplegado, y la lista recortada de la vista compacta va sin ellos.

**Carga, error y vacío no se pliegan**: no hay detalle detrás que abrir.

Qué se usa y por qué:

- `<section aria-labelledby>` — la convierte en **región navegable**: 12 paneles = 12
  saltos, en vez de un muro plano.
- `aria-hidden` en el gráfico — el valor existe **una sola vez** en el árbol accesible.
- `<details>/<summary>` — el desplegable **nativo**: teclado y anuncio de estado
  plegado/desplegado sin una línea de JavaScript, y funciona aunque el JS falle.
- `<dl>/<dt>/<dd>` — los indicadores son pares término/valor de verdad.
- `<ol>` en rankings — la posición la da el marcado, no un número pintado.
- `scope="col"`/`scope="row"` + `<caption>` — cada celda queda situada al navegar.
- `aria-busy` + `role="status"` en carga y error; el foco **no** se mueve solo.
- Ningún `role="img"` con un `alt` largo: un párrafo de resumen se puede releer,
  buscar y traducir; un `alt` de 300 caracteres, no.

## 10. Criterios de aceptación

### Funcionales

- [ ] El panel responde a las 7 preguntas sin abrir nada más que el desplegable.
- [ ] Resumen, indicadores, gráfico y tabla salen del mismo `PanelSpec`.
- [ ] Borrar el gráfico no pierde información.
- [ ] **Plegado, el panel sigue teniendo su cifra en texto** (no solo el dibujo).
- [ ] La tarjeta entera abre y cierra con ratón y con teclado, y no hay enlaces dentro
      del control que la abre.
- [ ] La leyenda es visible sin desplegar en todo panel con 2+ series.
- [ ] El alcance ajeno al filtro se ve **antes** que la cifra, sin desplegar.
- [ ] `null` se lee «Sin datos» y no entra en totales, medias ni cuotas.
- [ ] Un `0` medido se dibuja y se lista como `0`.
- [ ] Con un solo punto no se anuncian máximo ni mínimo.
- [ ] Toda variación dice valor, dirección, unidad y periodo comparado.
- [ ] Un panel que ignora el filtro de página lo declara en su contexto.
- [ ] Los cuatro estados existen y el vacío se deriva, no se declara.
- [ ] Truncar una serie se dice, y las cuotas se recalculan sobre lo mostrado.

### Accesibilidad — WCAG 2.2 AA

| Criterio | Cómo se cumple |
|---|---|
| 1.1.1 Contenido no textual | Gráfico `aria-hidden`; el dato vive en resumen y tabla |
| 1.3.1 Información y relaciones | `section`+`h2`, `dl`, `ol`, `table` con `scope` y `caption` |
| 1.3.2 Secuencia significativa | El orden del DOM es el de lectura, también en el muro de columnas |
| 1.4.1 Uso del color | Glifo de forma por serie + etiqueta; ninguna serie se distingue solo por tono |
| 1.4.3 Contraste mínimo | Todo valor va en tinta de texto, nunca en el color de la serie |
| 1.4.4 Redimensionar texto | Sin alturas fijas en el texto; el panel crece con él |
| 1.4.10 Reajuste (400 %) | Una columna; la tabla desplaza en su propio contenedor, la página no |
| 1.4.11 Contraste no textual | El dato no depende del gráfico, así que ningún tono es información única |
| 2.1.1 Teclado | Solo hay dos controles, ambos nativos: `<details>` y enlaces |
| 2.4.6 Encabezados y etiquetas | Un `h2` por panel; nivel configurable para no romper la jerarquía |
| 2.4.7 Foco visible | El `:focus-visible` global de `globals.css` (anillo de acento, offset 2) |
| 2.4.11 Foco no oscurecido | Sin barras fijas sobre los paneles |
| 2.5.8 Tamaño del objetivo | El `<summary>` ocupa la línea completa |
| 3.2.4 Identificación coherente | Los 12 paneles comparten armazón, orden y microcopy |
| 3.3.1 Identificación de errores | El error es texto con glifo, nunca un panel en rojo sin más |
| 4.1.2 Nombre, función, valor | Elementos nativos; el ARIA se limita a nombrar la región y ocultar el adorno |

### Comprobado el 2026-08-04

- **28 unitarios** (`summary.test.ts`): hueco vs cero, silencio de reglas, concordancia,
  qué indicador preside y qué frase llega a la vista compacta.
- **6 e2e** (`e2e/estadisticas.spec.ts`): región con nombre, rótulo con periodo y unidad,
  tabla oculta plegada y visible al pulsar la tarjeta, `rowheader`/`columnheader`,
  cifra en texto sin desplegar, ausencia de tabla duplicada en un ranking, y la
  pestaña del perfil sobre el mismo armazón.
- **Revisión visual en navegador** (1280 px y 390 px, plegado y desplegado). De ahí
  salieron seis defectos que ninguna prueba veía: color de sector por posición en vez
  de por categoría, «1 obras», el indicador vacío presidiendo, la columna de cuota con
  total cero, 96 px de hueco con todo a cero, y las dos «M» de martes y miércoles.
- Paleta pasada por el validador de la guía de dataviz — resultado en la decisión
  correspondiente de `docs/requirements/decisiones.md`.

### Consumidores

| Vista | Paneles | Fuera del armazón |
|---|---|---|
| `/estadisticas` | 12 | — |
| `/u/[username]?tab=estadisticas` | 9 (4 comparten constructor con el muro) | calendario mensual y editor de objetivo: son controles con estado |
| Rail del feed (`stats-rail`) | 0 — sigue con sus tarjetas propias | es un resumen deliberadamente distinto |
