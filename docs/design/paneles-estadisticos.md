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
   textual e indicadores, y sus valores exactos en una tabla **o escritos dentro del
   propio gráfico** —con las marcas focalizables, no solo al pasar el ratón—. Lo que
   nunca vale es que haya que medir una altura para saber una cifra.
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

## 2. Jerarquía de contenido: dos densidades, la cara y la capa

**La tarjeta completa es el control**: se pulsa en cualquier punto y abre el panel
ampliado en una capa modal.

```
CARA  (vista general — sin prosa)         CAPA  (el detalle, sobre el muro)
┌────────────────────────────────┐        ├─ 1 título + 2 rótulo
│ 2 Rótulo: periodo · alcance ·  │        ├─ 4 cifra que preside
│   unidad                       │        ├─ descripción     ← cómo se calcula
│ 1 Título                       │        ├─ 3 resumen completo
│ 4 Cifra que preside            │        ├─ 4 resto de indicadores
│ 3 Una frase: lo que DESTACA    │        ├─ 5 visualización + leyenda
│ 5 Visualización + leyenda      │        ├─ 7 tabla — SOLO si el gráfico
                                          │     no dice ya sus cifras
│ 6 «Ampliar ↗»                  │        ├─ 2 contexto en frase larga
└────────────────────────────────┘        ├─ 8 notas
                                          └─ 10 acciones
9 Estados sustituyen a todo esto
```

El orden del DOM **es** el orden de lectura y el de importancia. Quien entre en la
región y no siga leyendo ya se ha llevado la respuesta. Dentro de la capa el texto va
**antes** del dibujo: quien no puede leer el gráfico no debería tener que saltárselo
para llegar al dato.

**Por qué una capa y no un `<details>` en línea.** El desplegable nativo es más barato
y fue la primera versión, pero en una rejilla de dos o tres columnas una tarjeta que
crece empuja a todas sus vecinas: el muro se recoloca bajo el cursor y lo que estabas
mirando se va de sitio. La capa deja el fondo quieto y concentra el foco —visual y de
teclado— en un solo panel. Hay un e2e que lo fija: ampliar un panel no puede mover la
posición de otro en el documento.

Sigue siendo `<dialog>` **nativo** con `showModal()`, como el resto de capas del repo:
Escape, trampa de foco, `inert` del fondo y devolución del foco al disparador vienen
de serie. El coste es un componente cliente mínimo (`panel-dialog.tsx`) en una página
que por lo demás es toda de servidor: solo sabe abrir y cerrar, y el contenido le llega
ya renderizado.

**Cuatro reglas de la vista compacta**, que es donde es fácil deshacer todo el trabajo:

1. **En la cara sigue habiendo cifra en texto.** La preside un `<dl>` de verdad; si la
   spec no declara indicadores, `heroKpi` fabrica uno con el total. Una tarjeta cerrada
   nunca es un dibujo a secas.
2. **La frase compacta es la SEGUNDA del resumen, no la primera.** La primera dice el
   total, y el total ya está ahí en 32 px: repetirlo gasta la única línea de prosa que
   tiene la vista general. La segunda dice lo que destaca.
3. **La leyenda viaja a la cara.** Un anillo sin leyenda sería identidad por color y
   nada más.
4. **Ese titular NO se repite en la capa.** Allí está el resumen entero, que ya lo
   contiene: reutilizar el bloque de la cara dejaba la misma frase dos veces seguidas,
   palabra por palabra.

**La cara no lleva nada interactivo.** El disparador la cubre entera (`absolute
inset-0`), así que cualquier enlace debajo sería intocable. Por eso el ranking recortado
va sin enlaces y los completos viven en la capa. El botón es una superposición y no
envuelve al contenido porque `<button>` solo admite contenido de frase: un `<h2>`
dentro sería HTML inválido.

**La decisión que sostiene la accesibilidad, y cómo cambió.** Al principio: el gráfico
`aria-hidden` y la tabla como único dato. Hoy no vale para todos, porque esa tabla se
volvió el problema — 365 filas en el mosaico del año, 348 de ellas diciendo «0».

La regla actual tiene dos mitades y **no se puede aplicar solo la primera**:

- Un gráfico que **escribe sus cifras dentro** (el total sobre cada barra, el valor
  junto a cada sector, la cifra sobre los días más movidos) pierde su tabla. En la capa
  deja de ser `aria-hidden` y cada marca medida es **focalizable**, con su desglose en
  el nombre accesible; el globo sale con `:hover` **y** con `:focus-visible`, en CSS
  puro. Un globo solo-ratón devolvería el dato a la categoría de decoración.
- Un gráfico que **no** las escribe (línea, área, medidor) sigue `aria-hidden` y sigue
  teniendo tabla.

La lista vive en `SELF_DESCRIBING` (`stat-panel.tsx`) y `PLAIN_VIZ` (`charts.tsx`).
Mover un `viz` de una a otra obliga a mover también su dato: **quitar la tabla sin
escribir las cifras es perder información, no simplificar.**

**El gráfico consultable va SOLO en la capa.** En la cara, el disparador la cubre entera
con `absolute inset-0`: una marca focalizable ahí quedaría debajo —el ratón no la
alcanzaría y el teclado enfocaría algo tapado—. Por eso el armazón pinta dos gráficos,
el de la cara decorativo y el de la capa consultable. Las cifras escritas salen en los
dos: son texto, no control.

## 3. Plantilla genérica

```
CARA ────────────────────────────────────────────────┐
│ 2026 · MIN                                         │ 2  rótulo mono
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
│ AMPLIAR ↗                                          │ 6
└────────────────────────────────────────────────────┘

CAPA (modal sobre el muro, al pulsar la tarjeta) ────┐
│                                              [ ✕ ] │    cierre pegado arriba
│ 2026 · MIN                                         │ 2
│ Horas por mes                                      │ 1
│                                                    │
│ 25 min                                             │ 4  la cifra se repite:
│ Total                                              │    la capa tapa la cara
│                                                    │
│ Solo cuenta sesiones con duración registrada.      │    descripción
│                                                    │
│ Total 25 minutos en 8 puntos. Máximo: Julio        │ 3  resumen completo
│ (25 min); mínimo: Enero (0 min). 4 de 12 puntos    │    (el titular NO se
│ sin datos.                                         │     repite: ya está aquí)
│                                                    │
│ ─ ─ ─ ─ ─ ─ █ ─ ·  ·  ·  ·                         │ 5
│ E F M A M J J A S  O  N  D                         │
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
  context: {
    period: string;            // "Este mes", "2026", "Todo el histórico"
    filter?: string;           // el filtro GLOBAL: "Libros". Va en el rótulo
    filters?: string[];        // los propios del panel: ["Solo pases con nota"]
    scope?: string;            // "foto del momento", "todos los tipos"
  };
  viz: PanelViz;
  unit: Unit;                  // { short, one, many, decimals? }
  data: PanelDatum[];
  series?: PanelSeries[];      // { key, label, color, glyph? }
  target?: number | null;      // gauge
  kpis?: PanelKpi[];           // { label, value|text, unit?, delta?, hint? }
  summary?: string;            // sustituye al generado
  columns?: PanelColumnId[];   // "label"|"value"|"share"|"detail"
  labelHeader?: string; valueHeader?: string;
  heatmap?: {                  // año: fluye por columna, una por semana
    rows: number; offset?: number; columns?: number;
    months?: { label: string; column: number }[];
  };
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
<section aria-labelledby="horas-title" class="relative">   <!-- región con nombre -->
  <div>                                       <!-- LA CARA: nada interactivo -->
    <span class="label-section">2026 · min</span>
    <h2 id="horas-title">Horas por mes</h2>
    <dl><dd>25 min</dd><dt>Total</dt></dl>    <!-- la cifra, en texto -->
    <p>Máximo: Julio (25 min)…</p>            <!-- lo que destaca -->
    <div aria-hidden="true">…gráfico…</div>   <!-- decorativo -->
    <ul>…leyenda con glifo…</ul>              <!-- NO oculta: nombra series -->
  </div>

  <!-- El disparador CUBRE la tarjeta; no la envuelve -->
  <button aria-haspopup="dialog" aria-label="Ampliar Horas por mes"
          class="absolute inset-0"></button>

  <dialog aria-label="Horas por mes">         <!-- showModal(): modal + inert -->
    <button aria-label="Cerrar">✕</button>
    <span class="label-section">2026 · min</span>
    <h2 id="horas-dialog-title">Horas por mes</h2>
    <dl><dd>25 min</dd><dt>Total</dt></dl>
    <p>Total 25 minutos en 8 puntos…</p>      <!-- resumen completo -->

    <!-- El gráfico de la CAPA se consulta punto a punto: cada marca medida es
         focalizable y lleva su desglose en el nombre. El globo sale con
         :hover Y con :focus-visible, en CSS puro — un tooltip solo-ratón
         devolvería el dato a la categoría de decoración. -->
    <div>
      <div tabindex="0" role="img"
           aria-label="Julio: 26 obras — 19 libros, 4 películas, 3 series">…</div>
    </div>

    <!-- Solo cuando el gráfico NO dice ya sus cifras (línea, área, medidor) -->
    <table>
      <caption class="sr-only">Horas por mes. 2026 · Sesiones. Valores en minutos.</caption>
      <thead><tr><th scope="col">Mes</th><th scope="col">Minutos</th></tr></thead>
      <tbody><tr><th scope="row">Enero</th><td>0 min</td></tr></tbody>
      <tfoot><tr><th scope="row">Total</th><td>25 min</td></tr></tfoot>
    </table>
  </dialog>
</section>
```

**El disparador se superpone, no envuelve.** `<button>` solo admite contenido de frase:
meter dentro el `<h2>` sería HTML inválido y algunos lectores lo aplanan. Por eso el
botón es una capa `absolute inset-0` con `aria-label` propio —«Ampliar Horas por mes»,
que dice qué se abre y de qué panel— y el `aria-labelledby` de la región sigue apuntando
al `<h2>`, así que el panel conserva su nombre en la lista de regiones.

**Cabecera y cifra se repiten dentro de la capa, y no duplican nada.** Un `<dialog>`
cerrado no existe para el lector de pantalla, y con la capa abierta el fondo queda
`inert`: en ningún momento hay dos copias vivas. Sin repetirlas, el detalle aparecería
huérfano de la cifra que lo contextualiza, porque la capa tapa la cara.

**Ningún enlace en la cara.** El disparador la cubre entera, así que serían enlaces
intocables: los del ranking y los de la tabla viven en la capa, y la lista recortada de
la vista compacta va sin ellos.

**Carga, error y vacío no se amplían**: no hay detalle detrás que abrir.

Qué se usa y por qué:

- `<section aria-labelledby>` — la convierte en **región navegable**: 12 paneles = 12
  saltos, en vez de un muro plano.
- `aria-hidden` en el gráfico — el valor existe **una sola vez** en el árbol accesible.
- `<dialog>` + `showModal()` — el modal **nativo**: Escape, trampa de foco, `inert` del
  fondo y devolución del foco al disparador, sin escribirlos a mano. Es el mismo patrón
  que el resto de capas del repo (`sheet-shell.tsx`, `image-zoom.tsx`).
- `<dl>/<dt>/<dd>` — los indicadores son pares término/valor de verdad.
- `<ol>` en rankings — la posición la da el marcado, no un número pintado.
- `scope="col"`/`scope="row"` + `<caption>` — cada celda queda situada al navegar.
- `aria-busy` + `role="status"` en carga y error; el foco **no** se mueve solo.
- Ningún `role="img"` con un `alt` largo: un párrafo de resumen se puede releer,
  buscar y traducir; un `alt` de 300 caracteres, no.

## 10. Criterios de aceptación

### Funcionales

- [ ] El panel responde a las 7 preguntas sin abrir nada más que su capa.
- [ ] Resumen, indicadores, gráfico y tabla salen del mismo `PanelSpec`.
- [ ] Borrar el gráfico no pierde información.
- [ ] **En la cara, el panel sigue teniendo su cifra en texto** (no solo el dibujo).
- [ ] La tarjeta entera abre con ratón y con teclado; la capa cierra con Escape, con el
      botón y pulsando fuera, y **devuelve el foco al disparador**.
- [ ] **Ampliar un panel no mueve a ningún otro** de sitio en el documento.
- [ ] Ninguna frase aparece dos veces seguidas dentro de la capa.
- [ ] La leyenda es visible sin ampliar en todo panel con 2+ series.
- [ ] El alcance ajeno al filtro se ve **antes** que la cifra, sin ampliar.
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
| 2.1.1 Teclado | Solo hay controles nativos: `<button>`, `<dialog>` y enlaces |
| 2.1.2 Sin trampas de teclado | La trampa de foco de la capa es la del `<dialog>` nativo, y Escape siempre sale |
| 2.4.3 Orden del foco | Al cerrar, el `<dialog>` nativo devuelve el foco al disparador (con e2e) |
| 2.4.6 Encabezados y etiquetas | Un `h2` por panel; nivel configurable para no romper la jerarquía |
| 2.4.7 Foco visible | El `:focus-visible` global de `globals.css` (anillo de acento, offset 2) |
| 2.4.11 Foco no oscurecido | Sin barras fijas sobre los paneles |
| 2.5.8 Tamaño del objetivo | El disparador ocupa la tarjeta entera |
| 3.2.4 Identificación coherente | Los 12 paneles comparten armazón, orden y microcopy |
| 3.3.1 Identificación de errores | El error es texto con glifo, nunca un panel en rojo sin más |
| 4.1.2 Nombre, función, valor | Elementos nativos; el ARIA se limita a nombrar la región y ocultar el adorno |

### Comprobado el 2026-08-04

- **97 unitarios** de estadísticas (`summary.test.ts`, `period.test.ts`,
  `library-health.test.ts`, `habits-pace.test.ts`): hueco vs cero, silencio de reglas,
  concordancia, qué indicador preside, límites de semana/mes/año y su periodo anterior
  (incluido enero, que retrocede de año), tasas sobre lo cerrado y no sobre la
  biblioteca entera, y la curva de la pila dejando fuera las abandonadas.
- **15 e2e** (`e2e/estadisticas.spec.ts`): región con nombre, rótulo con periodo y
  unidad, cifra en texto sin ampliar, Escape cerrando **y devolviendo el foco al
  disparador**, que ampliar un panel no mueva a sus vecinos, el muro agrupado en
  secciones con su índice y sus paneles a nivel `h3`, el índice marcando la sección
  activa (incluida la última, que es donde falla el scrollspy de manual), el periodo
  admitiendo semana y mes, el conmutador obras/tiempo cambiando la unidad, el filtro de
  tipo declarándose en el rótulo —y «Distribución por tipo» declarando que NO lo
  obedece—, la pestaña del perfil sin rail, y el contrato nuevo de los gráficos: que la
  tabla NO esté **y** que el dato SÍ siga estando (punto focalizable con su valor en el
  nombre), y que eso ocurra solo en la capa, nunca en la cara.
- **Revisión visual en navegador** (1400 px y 390 px, claro y oscuro, cara y capa). De
  ahí salieron trece defectos que ninguna prueba veía: color de sector por posición en
  vez de por categoría, «1 obras», el indicador vacío presidiendo, la columna de cuota
  con total cero, 96 px de hueco con todo a cero, las dos «M» de martes y miércoles, el
  titular repetido palabra por palabra dentro de la capa, «. última Solaris» en
  minúscula tras punto, las etiquetas del eje pisándose («Fantasía» sobre «Ciencia
  ficción»), **el calendario anual de cinco mil píxeles**, **«La pila crece» con el
  periodo en «todo»**, **las tres cifras del mosaico pisándose entre ellas y con los
  rótulos de mes** (en una tarjeta de 340 px las celdas miden 6 px y los picos vienen
  juntos) y **el anillo desapareciendo con todo a cero** — que es un cero medido, no
  una ausencia, y la tarjeta perdía su forma.
- Paleta pasada por el validador de la guía de dataviz — resultado en la decisión
  correspondiente de `docs/requirements/decisiones.md`.

### Consumidores

| Vista | Paneles | Fuera del armazón |
|---|---|---|
| `/estadisticas` | 26 en 7 secciones | — |
| `/u/[username]?tab=estadisticas` | 10 (6 comparten constructor con el muro) | calendario mensual y editor de objetivo: son controles con estado |
| Rail del feed (`stats-rail`) | 0 — sigue con sus tarjetas propias | es un resumen deliberadamente distinto |

## 11. Organización: secciones, periodo y filtro global

El muro dejó de ser doce tarjetas sueltas en una rejilla. Va en **siete secciones**, y
el título de la sección contesta antes que el de la tarjeta a la pregunta que más se
falla: si «Décadas» habla de lo que ves o de lo que tienes esperando.

| § | Sección | Contesta |
|---|---|---|
| 1 | Resumen general | Cuánto llevas en el periodo y cómo se reparte |
| 2 | Actividad | Cuándo ocurrió, en qué ritmo y con qué constancia |
| 3 | Hábitos | A qué hora, qué día y con qué sesiones |
| 4 | Biblioteca y estados | Qué tienes, qué acabas y qué se te acumula |
| 5 | Valoraciones | Cómo puntúas y qué puntúas mejor |
| 6 | Gustos y descubrimiento | Qué eliges, de quién y de qué época |
| 7 | Por categoría | Lo que solo tiene sentido dentro de un tipo de obra |

La pestaña del perfil es la **vista corta del mismo esquema**, sin secciones y en este
orden: actividad del periodo · semana · objetivo · racha · ritmo · calendario · la pila
· balance · valoración · récords · cuándo consumes.

**Ya no hay rail.** El rail de 340 px no repartía por importancia sino por ancho: la
racha y el ritmo cabían en él, así que salían antes que la actividad del periodo. Ahora
es una sola secuencia en rejilla, con el orden del DOM igual al del esquema — que es el
que lee un lector de pantalla y el que se ve en móvil.

### Rejilla con `items-start`, nunca `columns`

Las dos vistas usan `grid ... items-start`, y las dos partes de esa decisión se pagaron
mirando la pantalla:

- **`columns` no vale.** El navegador elige una altura de columna y reparte; el
  calendario —la tarjeta más alta con diferencia— se quedaba a diez píxeles de caber en
  la primera columna, se iba entero a la segunda y dejaba medio metro de hueco muerto
  abajo a la izquierda. Y el empate es frágil: depende de cuántas sesiones tenga el mes.
- **`items-start` no es un olvido.** Sin él la rejilla estira las tarjetas de cada fila
  a la altura de la más alta, y «La pila» junto al calendario se quedaba con 250 px de
  vacío entre su anillo y su pie. **Una tarjeta hueca se lee como rota; el aire entre
  tarjetas se lee como maqueta.** Se prefiere lo segundo aunque los píxeles sobrantes
  sumen lo mismo.

Queda algo de borde irregular entre filas, y es el precio correcto: las columnas
terminan a ras y ninguna tarjeta miente sobre dónde acaba su contenido.

### Los tres controles, y una sola fila para toda la pantalla

Nunca un filtro por panel: con dos filtros distintos a la vez nadie puede saber qué
compara cada cifra con cuál. Son **enlaces**, no estado de cliente — el servidor tiene
que consultar de nuevo igualmente, así la elección se comparte y sobrevive a recargar.

| Control | Valores | URL |
|---|---|---|
| Periodo | Semana · Mes · año en curso · anterior · Todo | `?periodo=` |
| Tipo de obra | Todo · Libros · Películas · Series | `?tipo=` |
| Magnitud | Obras · Tiempo | `?medida=` |

El periodo por defecto **no es el mismo en las dos vistas**: el muro arranca en el año
en curso y la pestaña del perfil en «todo el histórico», que es lo que enseñaba antes
de tener selector. Estrenar un control no debe cambiarle los números a nadie.

### La regla dura: un panel que no obedece al filtro tiene que decirlo

El filtro global va en el **rótulo** (`context.filter`), entre el periodo y la unidad, y
separado de los filtros propios del panel (`context.filters`, que viven en la capa). La
distinción es de fondo, no de sitio: los propios no cambian nunca; el global lo acaba de
elegir quien mira, y si no se ve junto a la cifra, la cifra miente — «97 obras» a secas
parece el total y es solo el de libros.

Y al revés: varios paneles **no pueden** obedecerlo, porque su consulta no lo acepta o
porque son justo los que responden a esa pregunta. Esos declaran `scope: "todos los
tipos"`. Callarlo es el peor de los dos errores: con el muro en «Libros», una tarjeta
que sigue contando películas y no lo dice es indistinguible de una que sí filtró.

| Panel | Filtro de tipo |
|---|---|
| Distribución por tipo | **No** — es el que responde a esa pregunta |
| Rachas | **No** — una noche de cine no rompe la racha de quien tiene puesto «Libros» |
| Completadas por año, Horas por mes, Calendario anual | **No** — su consulta es anual y sin tipo |
| Libros / Películas / Series (§7), Autores, Editoriales, Directores | Se ocultan cuando el tipo elegido no es el suyo |
| El resto | Sí, y lo declaran en el rótulo |

### Lo que queda fuera, y por qué

La línea es **si el dato existe en la base**. Todo lo que se podía calcular —aunque
hiciera falta un getter nuevo— está hecho. Lo que exige columna, enum o hidratación
nueva no se ha simulado ni se ha dejado a medias: no aparece en el muro, y ningún
panel afirma nada sobre ello.

| Punto del esquema | Por qué no está | Issue |
|---|---|---|
| «Pausadas» | `media_status` solo tiene `planned/in_progress/completed/dropped` | [#426](https://github.com/borjar20/Biblioshare/issues/426) |
| Países · idioma de pantalla · formato de libro · ficción/no ficción | Sin columna en ninguna tabla del catálogo | [#427](https://github.com/borjar20/Biblioshare/issues/427) |
| Cine / casa / plataforma | Es del pase, y `passes` no tiene dónde guardarlo | [#428](https://github.com/borjar20/Biblioshare/issues/428) |
| Objetivo en páginas, películas o episodios | `profiles` solo tiene `daily_goal_minutes` | [#429](https://github.com/borjar20/Biblioshare/issues/429) |
| «Obras terminadas en una sola sesión» | **Sí hay dato**; ningún getter cruza sesiones con pases terminados | [#430](https://github.com/borjar20/Biblioshare/issues/430) |

Dos paneles llevan la ausencia escrita en su nota, para que la pantalla no prometa lo
que no tiene: «Estados» dice que no existe el estado «pausada», y «Objetivo de hoy»
que el objetivo es de minutos. Esas notas se retiran al cerrar #426 y #429.

## 12. Gráficos sin tabla, y la cabecera segmentada

Handoff `HANDOFF - Gráficos sin tabla mensual.md` del proyecto de diseño
(claude.ai/design), con cuatro mockups. Lo que cambia y por qué.

### La tabla se sustituye, no se borra

El problema no era la tabla en abstracto: era que **crecía sin límite con el
histórico** y repetía en texto lo que el dibujo ya decía. En el mosaico del año eran
365 filas, 348 de ellas diciendo «0», y enterraban el resto de la capa.

| Gráfico | Lo que ahora lleva dentro | Qué pierde |
|---|---|---|
| Barras y apiladas | El total **encima de cada barra**, siempre visible; globo con el desglose por tipo | La tabla Mes/Libros/Películas/Series/Cuota |
| Anillo | El valor de cada categoría **junto a su sector y en su color**; la leyenda añade valor y cuota | La cifra del centro y la tabla |
| Mosaico del año | **Rótulos de mes** sobre la rejilla y la cifra escrita sobre los días más movidos | Las 365 filas |

La condición para retirar una tabla es que su gráfico escriba las cifras **y** se pueda
recorrer con el tabulador (ver §2). Las dos mitades, o ninguna.

**Los rótulos del mosaico son tres letras, no una.** Con la inicial sola, marzo y mayo
caen los dos en «M» en un eje de doce, y un eje que no distingue sus etiquetas no es un
eje. Y su columna se calcula igual que la celda —`(índice del día + desplazamiento) / 7`—
porque repartir doce rótulos a ojo entre 53 columnas los desalinea un par de semanas.

**Como mucho tres cifras escritas sobre el mosaico, y separadas.** Los picos vienen
juntos —una racha buena son días seguidos—, así que en una tarjeta de 340 px, donde la
celda mide 6 px, las tres se pisaban entre ellas y con los rótulos de mes. Se descarta
la que caiga a menos de cuatro columnas de otra ya escrita: menos etiquetas legibles
valen más que tres ilegibles.

**El anillo se dibuja en SVG, no con `conic-gradient`.** Un gradiente es un fondo: no
tiene tramos a los que apuntar, así que no admite ni la separación de 2 px entre
sectores —que es lo que impide leer como uno solo dos colores que fallan en
daltonismo— ni un globo por arco. Con todo a cero se dibuja la pista vacía: un cero
medido no es una ausencia, y la tarjeta perdería su forma.

### La cabecera

- Los filtros pasan de botones sueltos a **grupos segmentados** (una cápsula por grupo,
  activo en relleno). Con tres grupos en dos filas, el hueco *dentro* de un grupo y el
  hueco *entre* grupos medían casi lo mismo, así que «Series» y «Obras» parecían
  opciones de la misma pregunta.
- **Separador vertical** entre «Tipo de obra» y «Magnitud»: dos decisiones
  independientes en la misma línea, sin gastar otra fila.
- El índice de secciones gana **estado activo real** (color + subrayado). Siete enlaces
  del mismo color dicen a dónde se puede ir, no dónde estás.

**El activo se sigue con la posición, y no con `IntersectionObserver`.** Es la respuesta
de manual y falla justo en el borde que más se nota: con el margen recortado por abajo
—para que «la actual» sea la de arriba y no la que asoma por el pie— la ÚLTIMA sección
no llega nunca a cruzar la línea si la página ya no puede scrollear más. Pulsas «Por
categoría», la pantalla salta al final y el resaltado se queda en la anterior. La regla
explícita («la última sección cuyo borde superior haya pasado la línea de guardia; si
estamos al final del documento, la última de todas») es más corta y no tiene ese agujero.
