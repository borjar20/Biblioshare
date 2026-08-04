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

## 2. Jerarquía de contenido

El orden del DOM **es** el orden de lectura y el de importancia. Un lector de pantalla
que entre en la región y no siga leyendo ya se ha llevado la respuesta.

```
1 Título              ← qué es
2 Contexto            ← de qué periodo, con qué filtros, en qué unidad
  + descripción       ← qué mide y cómo se calcula (opcional, pero ANTES del dato)
3 Resumen textual     ← la respuesta en una frase
4 Indicadores         ← el dato principal y su variación
5 Visualización       ← la forma (decorativa)
6 Selector de vista   ← "Ver los N valores exactos"
7 Tabla               ← todos los valores
8 Notas               ← salvedades de cálculo
9 Estados             ← sustituyen a 3–8 cuando toca
10 Acciones           ← a dónde ir a partir de aquí
```

**La decisión que sostiene la accesibilidad:** el gráfico va `aria-hidden` y la tabla
es el dato. La alternativa —un `aria-label` por barra— duplica cada cifra en el árbol
accesible, obliga a mantener dos copias y las desincroniza al primer cambio.

## 3. Plantilla genérica

```
┌─────────────────────────────────────────────────────┐
│ Horas por mes                        Ver detalle ›  │ 1 + 10
│ 2026 · Sesiones de lectura. Valores en minutos.     │ 2
│                                                     │
│ Total 1.240 minutos en 8 puntos. Máximo: Marzo      │ 3
│ (310 min); mínimo: Agosto (0 min). 4 de 12 puntos   │
│ sin datos.                                          │
│                                                     │
│ Sesión media          Mejor mes                     │ 4
│ 42 min                Marzo                         │
│ ▲ +8 minutos más que en 2025                        │
│                                                     │
│   ▁ ▃ █ ▅ ▂ ▄ ▃ ─ ·  ·  ·  ·                        │ 5
│   E F M A M J J A S  O  N  D                        │
│                    └─ ─ = cero medido               │
│                       · = sin datos                 │
│                                                     │
│ › Ver los 12 valores exactos                        │ 6
│   ┌────────────┬─────────┬────────┐                 │ 7
│   │ Mes        │ Minutos │  Cuota │                 │
│   ├────────────┼─────────┼────────┤                 │
│   │ Enero      │  90 min │    7 % │                 │
│   │ Agosto     │   0 min │    0 % │                 │
│   │ Septiembre │Sin datos│Sin datos│                │
│   ├────────────┼─────────┼────────┤                 │
│   │ Total      │1.240 min│        │                 │
│   └────────────┴─────────┴────────┘                 │
│                                                     │
│ Solo cuenta sesiones con duración. Un mes futuro    │ 8
│ aparece como «Sin datos», no como cero.             │
└─────────────────────────────────────────────────────┘
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
  <h2 id="horas-title">Horas por mes</h2>
  <p>2026 · Sesiones. Valores en minutos.</p>
  <p>Total 1.240 minutos en 8 puntos…</p>      <!-- resumen -->
  <dl>…</dl>                                    <!-- indicadores -->
  <div aria-hidden="true">…gráfico…</div>       <!-- decorativo -->
  <ul>…leyenda con glifo…</ul>                  <!-- NO oculta: nombra series -->
  <details>
    <summary>Ver los 12 valores exactos</summary>
    <table>
      <caption class="sr-only">Horas por mes. 2026 · Sesiones. Valores en minutos.</caption>
      <thead><tr><th scope="col">Mes</th><th scope="col">Minutos</th></tr></thead>
      <tbody><tr><th scope="row">Enero</th><td>90 min</td></tr></tbody>
      <tfoot><tr><th scope="row">Total</th><td>1.240 min</td></tr></tfoot>
    </table>
  </details>
</section>
```

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

- 16 unitarios (`summary.test.ts`) sobre hueco/cero, silencio de reglas y formato.
- 4 e2e (`e2e/estadisticas.spec.ts`) sobre región con nombre, contexto con unidad,
  tabla con `rowheader`/`columnheader`, y ausencia de tabla duplicada en un ranking.
- Paleta pasada por el validador de la guía de dataviz — resultado en la decisión
  correspondiente de `docs/requirements/decisiones.md`.
