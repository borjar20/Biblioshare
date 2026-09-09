---
name: Biblioshare
description: Sistema Paper — terracota sobre papel cálido, la portada como material, para un tracker de libros, películas y series.
colors:
  background: "#f3ece1"
  surface: "#fffdf8"
  surface-muted: "#ece3d4"
  surface-3: "#e2d7c4"
  foreground: "#2c2620"
  foreground-soft: "#584f43"
  muted-foreground: "#6b6255"
  foreground-faint: "#a89e8d"
  border: "rgba(44, 20, 32, 0.14)"
  scrim: "rgba(44, 38, 32, 0.45)"
  accent: "#b0542f"
  accent-hover: "#9a4526"
  accent-ink: "#a44e2c"
  accent-foreground: "#fff5ef"
  gold: "#c98a2b"
  gold-ink: "#8a5a12"
  gold-graphic: "#b57c27"
  green: "#5c7052"
  spine: "#b8a98f"
  status-planned: "#b3a894"
  status-in-progress: "#c98a2b"
  status-completed: "#5c7052"
  status-dropped: "#b0492f"
  status-planned-ink: "#685b46"
  status-in-progress-ink: "#714a0c"
  status-completed-ink: "#4b5e41"
  status-dropped-ink: "#8a3724"
  type-book: "#a15a34"
  type-movie: "#3f6b6e"
  type-series: "#7a5676"
  type-book-ink: "#844a2b"
  type-movie-ink: "#375e61"
  type-series-ink: "#6e4d6a"
  event-highlight: "#456895"
  event-meetup: "#756747"
  map-itinerary-jump: "#5b8dbf"
  map-tandem: "#7a5676"
  map-window: "#5b989c"
  tier-awesome: "#46663c"
  tier-great: "#6a8a4a"
  tier-good: "#92893a"
  tier-regular: "#b07a2e"
  tier-bad: "#a6432f"
  tier-garbage: "#6f5570"
  tier-foreground: "#fff5ef"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  detail: "4px"
  chip: "6px"
  cover: "10px"
  card: "14px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-foreground}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-green:
    backgroundColor: "{colors.green}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-danger:
    backgroundColor: "{colors.status-dropped}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.chip}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip-genre:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  status-badge:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  cover:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.cover}"
---

# Design System: Biblioshare

> **[Canónico · verificado contra `src/app/globals.css`, `src/lib/ui/layout.ts` y
> `src/components/ui/` el 2026-08-27]**
>
> Manda para **tokens**: color, tipografía, forma, elevación, layout y primitivos. Los
> **patrones** de pantalla (columnas, navegación secundaria, dónde vive lo destructivo) los manda
> [`docs/UI-GUIA.md`](docs/UI-GUIA.md); las **capturas** y el flujo de prototipado,
> [`docs/REFERENCIA-VISUAL.md`](docs/REFERENCIA-VISUAL.md); el **nombre** de cada concepto,
> [`docs/UI-GLOSARIO.md`](docs/UI-GLOSARIO.md). Si esto contradice a `globals.css`, manda
> `globals.css` y este doc está desactualizado.

## Overview

**Creative North Star: "La mesa de lectura"**

La interfaz es la mesa: papel cálido, quieta, sin brillo propio. Las obras son los objetos que
dejas encima, y son ellas —las portadas— quienes ponen el color. Todo lo que el sistema decide
sale de ahí: el fondo es papel (`#f3ece1`) y no blanco de pantalla; el cromo se apaga en tonos
tostados para que una carátula turquesa o un lomo rojo no compitan con un botón; el acento
terracota se raciona porque sobre una mesa llena de portadas, un color que aparece en todas
partes deja de señalar nada.

El carácter es **editorial y táctil**: titulares en Fraunces con la irregularidad de un serif de
imprenta, rótulos en Geist Mono a 10 px y `0.12em` que suenan a etiqueta de fichero, y una regla
de forma que separa el gesto del contenido — lo que se pulsa es píldora, lo que contiene es caja
de 14 px. El oscuro no es un negativo: es la misma mesa en espresso (`#1f1a16`), con la
terracota subida a un tono más luminoso para seguir siendo tinta y no mancha.

Densidad alta, admitida a propósito: esta app se usa para registrar y curar, y la información
apretada es su servicio. Lo que compensa la densidad no es el aire, es la jerarquía tipográfica
— serif para lo que titula, sans para lo que se lee, mono en mayúsculas para lo que rotula.

**Key Characteristics:**
- Papel cálido y espresso, nunca blanco puro ni gris azulado.
- Un solo primario en toda la app; el color de tipo pertenece al contenido, no al rol.
- Portada como material: `aspect-[2/3]`, esquina de 10 px y una sombra que le da grosor.
- Serif titula, sans lee, mono rotula. Tres papeles, sin solapamiento.
- Cuatro escalones de superficie antes que cualquier sombra.
- Sin toasts, sin emojis de sistema, sin adorno que no sea un dato.

## Colors

### Tintas de estado (#892, verificadas contra globals.css el 2026-09-06)

Los tokens `status-*` conservan el color de gráficos y puntos. Para texto de estado,
estadísticas y cambios de nota se usa el par `status-*-ink`, con contraste mínimo
4,5:1 sobre background, surface, surface-muted y surface-3. El oscuro del sistema
declara los mismos valores que `.dark`.

| Tinta | Claro | Oscuro explícito y del sistema |
|---|---|---|
| `status-planned-ink` | `#685b46` | `#b9ab98` |
| `status-in-progress-ink` | `#714a0c` | `#e0a94a` |
| `status-completed-ink` | `#4b5e41` | `#9fb68f` |
| `status-dropped-ink` | `#8a3724` | `#efa48e` |

Las tarjetas de biblioteca, tanto en Colección como en el perfil público, muestran
siempre la etiqueta de estado con la variante `overlay`: el color no es su única señal.
Los errores de formulario sobre surface conservan el rojo existente, cuyo contraste
ya cumple. Las superficies tintadas se comprueban en navegador con su composición real.

Paleta enteramente cálida —papel, teja, oro, verde oliva— con tres fríos que son **datos, no
cromo**: el teal de película, el violeta de serie y el azul del salto de itinerario. Cada color
existe en pareja claro/oscuro; el oscuro no se deriva, se declara.

### Primary
- **Terracota de Imprenta** (claro `#b0542f` · oscuro `#d98a5c`): el único primario de la app.
  CTA de ficha, botón primario, enlaces, anillo de foco, barra de progreso, barrita de la
  cabecera de página, hito del calendario del club. En oscuro sube en luminosidad para seguir
  leyéndose como tinta sobre espresso.
- **Terracota de Texto** (`#a44e2c` · oscuro: el mismo `#d98a5c`): pareja **solo para texto
  sobre su propio tinte** al 10 %. El acento puro da 4,35:1 ahí y no puede oscurecerse sin
  restilar media app.
- **Papel de Acento** (`#fff5ef` · oscuro `#1f1409`): el texto que va **encima** del acento.

### Secondary
- **Oro de Progreso** (`#c98a2b` · oscuro `#e0a94a`): lo que avanza y lo que se logra — racha,
  reto, «en curso», cierre de actividad. Nunca es un rol de botón.
  Sus dos parejas existen por contraste medido, no por gusto: **Oro de Tinta** (`#8a5a12`) para
  texto sobre tinte de oro, **Oro Gráfico** (`#b57c27`) para el objeto gráfico que solo debe
  3:1.
- **Verde de Encuentro** (`#5c7052` · oscuro `#8ba57b`): lo social que se acepta — unirse a un
  club, aprobar, aceptar. Es la única variante de botón que no es terracota.

### Tertiary
- **Triada de medio** — **Teja de Libro** (`#a15a34`), **Teal de Película** (`#3f6b6e`),
  **Violeta de Serie** (`#7a5676`): identifican **contenido**. Barras, chips, marcas de
  calendario, los tres lomos del logo. Prohibido usarlos para el rol de un control.
  Los tres son de **gráfico** (3:1). Para **texto** existe su par oscuro —`type-book-ink`
  `#844a2b`, `type-movie-ink` `#375e61`, `type-series-ink` `#6e4d6a`— porque el puro se queda
  en 3,64:1 sobre su propio tinte al 10 %. Es a esos a los que apunta `MEDIA_ACCENT.text`;
  mismo patrón que `accent`/`accent-ink` y `gold`/`gold-ink`.
- **Cuarteto de estado** — **Arena Pendiente** (`#b3a894`), **Oro en Curso** (`#c98a2b`),
  **Oliva Terminado** (`#5c7052`), **Teja Abandonada** (`#b0492f`): el dot de estado y, el
  último, el rojo de error de formulario y del botón `danger`. No hay un segundo rojo.
- **Beige de Nexo** (`#b8a98f`) y sus vecinos de calendario y mapa (**Azul de Fecha**
  `#456895`, **Caqui de Encuentro** `#756747`, **Azul de Salto** `#5b8dbf`, **Violeta de
  Tándem** `#7a5676`, **Teal de Ventana** `#5b989c`): cada uno nació porque los siete anteriores
  ya estaban comprometidos y dos clases del mismo tono anulan el sentido de colorear por tipo.
  Los tres del mapa **no cambian con el tema** — su lienzo es oscuro siempre.
- **Escala de tier** (`tier-awesome` … `tier-garbage`): puntuación de episodio, seis peldaños de
  verde a violeta sobre `tier-foreground`.

### Neutral
- **Papel Cálido** (`#f3ece1` · oscuro **Espresso** `#1f1a16`): el fondo de la mesa.
- **Papel de Ficha** (`#fffdf8` · oscuro `#2a231d`): tarjetas, inputs, hojas.
- **Papel Hundido** (`#ece3d4` · oscuro `#332b23`) y **Papel Hundido Profundo** (`#e2d7c4` ·
  oscuro `#3d342b`): los dos escalones por debajo de la ficha. El segundo existe porque los dots
  vacíos pintados con `border` no se distinguían del fondo.
- **Tinta** (`#2c2620` · oscuro `#f0e8db`): el texto que manda.
- **Tinta Suave** (`#584f43` · oscuro `#cabfb0`): prosa larga — reseñas, sinopsis, feed.
- **Tinta Apagada** (`#6b6255` · oscuro `#a99e8c`): etiquetas, fechas, metadatos, hints. **Es el
  color de todo el texto secundario de la app** (836 sitios).
- **Tinta Fantasma** (`#a89e8d` · oscuro `#6f665a`): **no colorea texto nunca**. Dots
  decorativos y glifos `aria-hidden`.

### Named Rules

**La Regla de la Tinta Única.** Hay un primario en toda la app y es la terracota. Una vista con
dos naranjas significa que una de las dos acciones no era primaria. El color por tipo de medio
es del contenido; el CTA de una serie sigue siendo terracota.

**La Regla de la Tinta Fantasma.** `--foreground-faint` no colorea texto — da 2,25:1 — y no se
arregla subiendo el valor: cualquier tono que llegue a 4,5:1 sobre papel cae donde ya está la
Tinta Apagada. El texto secundario usa `--muted-foreground` y el test
`contraste-tokens.test.ts` falla si vuelve a aparecer un `text-foreground-faint`.

**La Regla del Par por Tema.** Un color no se deriva del claro por fórmula: se declara en los
tres bloques (`:root`, `.dark`, y el espejo de `prefers-color-scheme: dark`). Un token que
cambia en uno y no en los otros dos es un bug que `mark-accent.test.ts` caza token a token.

**La Regla del Frío Prestado.** Los únicos fríos de la paleta son datos: teal de película,
violeta de serie, azul de itinerario y de fecha destacada. Ningún gris azulado, ningún glow
ambiental, ningún cromo frío.

## Typography

**Display Font:** Fraunces (con Georgia, serif)
**Body Font:** Geist (con system-ui, sans-serif)
**Label/Mono Font:** Geist Mono (con ui-monospace, monospace)

**Character:** un serif de imprenta con carácter para lo que titula, un sans neutro y bien
espaciado para lo que se lee, y un mono en mayúsculas y muy espaciado para lo que rotula. El
contraste entre los tres es lo que sostiene la densidad: sin él, una pantalla llena de datos se
convierte en un muro gris.

### Hierarchy
- **Display** (Fraunces 600, 24 px → 28 px en `lg`, `line-height` 1.15): el `<h1>` de página,
  que lo pinta siempre `ui/page-header.tsx` — nunca un `<h1>` suelto con su propio tamaño.
- **Headline** (Fraunces 600, 20 px): el titular de un vacío a tamaño `page`, encabezados de
  sección grandes.
- **Title** (Fraunces 600, 14–16 px): títulos de tarjeta y de obra. El subtítulo de portada va
  en Fraunces **itálica** a 12 px, en Tinta Apagada.
- **Body** (Geist 400, 14 px, `line-height` ~1.55): el tamaño de lectura por defecto de la
  interfaz; la prosa larga se pinta en Tinta Suave. En móvil, todo `input`, `select` y
  `textarea` sube a **16 px** por regla global — por debajo, Safari hace auto-zoom al enfocar.
- **Label** (Geist Mono 500, 10 px, `0.12em`, mayúsculas, Tinta Apagada): el rótulo que encabeza
  un bloque. Existe como utilidad `label-section` y no se vuelve a escribir a mano.

### Named Rules

**La Regla de los Tres Papeles.** Serif titula, sans lee, mono rotula. Un rótulo de sección en
sans es deriva; un párrafo en serif también.

**La Regla del Rótulo Único.** Todo encabezado de bloque usa `label-section`. Llegó a haber
quince variantes de la misma idea —de 8,5 a 12 px y diez valores de `tracking`—, así que la
misma etiqueta salía a 12 px en Clubes y a 10 px en Inicio.

**Deuda vigente, no doctrina:** el cuerpo de la app usa hoy ~15 tamaños arbitrarios
(`text-[11.5px]`, `text-[12.5px]`, `text-[9.5px]`…) junto a los pasos de la escala. Los cinco
papeles de arriba son la referencia para lo nuevo; los arbitrarios son historia a reducir, no un
patrón a imitar.

## Layout

**Móvil primero, dos escalones.** La app se diseña en `base` y `lg:` (442 usos de `lg:` contra
23 de `md:`): tablet es hoy «móvil ancho», decisión registrada y abierta a revisión. Lo táctil
no se decide por ancho sino por capacidad — `(pointer: coarse)`, `(hover: none)`.

**Cuatro anchos de contenedor, y solo cuatro** (`src/lib/ui/layout.ts`): `SHELL_READ`
(`max-w-4xl`, prosa y listas de una columna), `SHELL_APP` (`max-w-2xl` → 1200 px en `lg`, todo
lo que lleva raíl o muro), `SHELL_GRID` (crece hasta 100 rem, rejillas de portadas donde más
ancho = más obras) y `RAIL` (340 px, el raíl derecho único). Antes había nueve.

**El contenedor y la escalera de columnas son una sola decisión.** Los breakpoints de Tailwind
miran la ventana, no el contenedor: una rejilla `2xl:grid-cols-8` dentro de un contenedor de
896 px pinta ocho portadas diminutas en un tercio de pantalla. Por eso `COVER_GRID_COLS`
(2→3→4→5→6→8) solo se usa junto a `SHELL_GRID`, y cada tipo de tarjeta tiene su escalera:
`NOTE_GRID_COLS` para texto, `CARD_GRID_COLS` y `TILE_GRID_COLS` para tarjetas anchas,
`FORM_CARD_GRID_COLS` para fichas-formulario.

**Las páginas de tres áreas viven en `globals.css`, no en utilidades**, porque son varios
reflows con `grid-template-areas` y porque página y esqueleto comparten la clase por nombre para
no poder divergir en ancho: `.home-grid` (personal · feed · stats; una columna hasta 1100, tres
a partir de ahí), `.post-grid` (obra · conversación · social; el raíl de obra se oculta bajo
1023), `.person-grid` (ficha · obras · raíl; dos columnas de 1000 a 1599, tres a ≥1600). En las
tres, el orden visual lo fijan las áreas, no el DOM, y las laterales se pegan bajo la topbar con
`top: calc(var(--topbar-h) + 16px)`.

**Ritmo de espaciado:** 8 px y 12 px son el gap por defecto (369 y 290 usos), 6 px para lo
apretado, 16 px entre bloques, 24 px entre secciones. La tarjeta pauta 16 px de padding interno.
La topbar es una constante (`--topbar-h: 59px`), no una altura que crece con su contenido: hay
barras que se pegan justo debajo y necesitan saber dónde acaba.

### Named Rules

**La Regla del Cero Overflow.** `min-width: 0` (o `minmax(0, 1fr)`) en toda celda de grid o flex
cuyo contenido deba encoger. Sin ella, un título sin espacios fuerza scroll horizontal en toda
la página — ya rompió dos vistas.

**La Regla de la Segunda Columna.** En desktop, una página con contenido + contexto se diseña a
dos columnas mínimo. La columna única centrada (`max-w` ~720 px) queda para formularios
utilitarios. Ninguna pantalla deja un tercio del viewport vacío sistemáticamente.

## Elevation & Depth

Paper es **liso**. La profundidad la dan primero los cuatro escalones de papel —fondo, ficha,
hundido, hundido profundo— y solo después una de **exactamente dos sombras**, cada una con su
trabajo. No hay glow ambiental (el sistema anterior lo tenía y se quitó a propósito) y no hay un
tercer nivel de elevación esperando a que alguien lo invente.

### Shadow Vocabulary
- **Sombra de tarjeta** (`box-shadow: 0 6px 16px -12px rgba(60, 35, 15, 0.4)`): asienta la
  tarjeta sobre el papel. Es la sombra por defecto de todo contenedor `rounded-card` (99 usos).
- **Sombra de portada** (`box-shadow: 0 8px 18px -8px rgba(60, 35, 15, 0.5)`): más profunda y
  más corta; le da **grosor físico** a la portada, que es el único objeto de la app que debe
  parecer una cosa y no una superficie.

Ambas son marrones, no negras: una sombra gris sobre papel cálido se lee como suciedad.

### Named Rules

**La Regla de las Dos Sombras.** Hay dos sombras y tienen nombre. Una sombra nueva —o un
`shadow-lg` de Tailwind colado en una tarjeta— es deriva, y necesita entrada en `decisiones.md`
antes que código.

**La Regla del Tono Primero.** Antes de añadir sombra, pregunta si el escalón de superficie
resuelve la separación. Casi siempre lo hace.

## Shapes

Tres radios, cada uno con su sitio: **chip 6 px** (chips, inputs, controles compactos),
**portada 10 px** (cualquier carátula) y **tarjeta 14 px** (contenedores). El cuarto valor,
**4 px**, es el detalle diminuto —dots, marcas—, no una caja.

Los radios de Tailwind **apuntan a esa escala** en vez de a sus valores de fábrica:
`rounded-md` = 6, `rounded-lg` = 10, `rounded-xl` = `rounded-2xl` = 14. Escribir `rounded-lg` es
legítimo y cae dentro del sistema; lo que se sale es un `rounded-[9px]` nuevo. `rounded-sm` (4)
queda deliberadamente fuera del mapeo.

**La forma separa el gesto del contenido:** lo que se pulsa es **píldora** (`rounded-full`:
botones, badges de estado, chips de filtro, el avatar); lo que contiene es **caja** (6/10/14). Es
la señal de affordance más barata del sistema y por eso no se rompe.

El borde es una sola línea: `--border`, un tinte de la tinta al 14 % (12 % en oscuro), nunca un
gris opaco — así el borde toma temperatura del papel que tenga debajo. El borde **discontinuo**
está reservado a lo que aún no existe: un hueco de colección, una ronda sin proponer, una zona
de soltar.

## Components

Carácter general: **táctil y editorial**. Se nota la mano — la píldora invita a pulsar, la
portada tiene grosor, el chip mono suena a etiqueta de fichero. Materialidad antes que
minimalismo, pero sin adorno que no sea un dato.

### Buttons
- **Forma:** píldora completa (`rounded-full`), `padding` 8 px / 20 px, texto 14 px peso 500,
  `gap` 8 px con su icono, `transition-colors`.
- **Cinco variantes y son todas las que hay:** `primary` (terracota sólida sobre Papel de
  Acento), `secondary` (borde + hover a papel hundido), `ghost` (solo texto, mismo hover),
  `green` (lo social que se acepta) y `danger` (rojo `--status-dropped` sólido).
- **Hover:** `primary` cambia de token (`--accent-hover`); `green` y `danger` atenúan al 90 %
  porque no existe un token de hover propio y no se inventa uno. `disabled` baja a opacidad 60.
- **Foco:** no lo declara el botón. Lo pone `globals.css` para toda la app.

### Chips
- **Género** (`GenreTag`): mono 10 px en mayúsculas, papel hundido, borde, radio de chip, texto
  en Tinta Apagada que sube a Tinta al hover. Enlaza a su página de género cuando la etiqueta
  pertenece al vocabulario canónico; si no, es un `<span>` muerto — nunca un enlace roto.
- **Estado** (`StatusBadge`): píldora con dot de color a la izquierda, en tres tallas de
  contexto — `chip` (papel hundido, en listados), `hero` (papel de ficha + borde,
  en la ficha de obra) y `overlay` (papel translúcido al 88 % + `backdrop-blur` + borde, para
  leerse encima de cualquier portada). La variante `dotOnly` deja solo el punto con un anillo de
  fondo, y el nombre del estado vive en el `aria-label`. Las tarjetas de biblioteca usan
  siempre `overlay` con texto, también en el perfil público; nunca `dotOnly`.

### Cards / Containers
- **Esquina:** 14 px. **Fondo:** Papel de Ficha. **Borde:** la línea de `--border`.
  **Sombra:** la de tarjeta. **Padding interno:** 16 px (12 px en las compactas).
- El combo canónico es literal: `rounded-card border border-border bg-surface shadow-card p-4`.
- **Discontinuo** para el hueco: lo que falta se dibuja, no se deja en blanco.

### Inputs / Fields
- **Estilo:** radio de chip (6 px), borde de `--border`, fondo Papel de Ficha, texto 14 px,
  placeholder en Tinta Apagada.
- **Foco:** el borde pasa a acento y se suma un anillo de 1 px del mismo color; en teclado, el
  anillo global de 2 px con 2 px de offset.
- **Etiqueta** (`Field`): 14 px peso 500 por defecto, con variante mono `label-section` opt-in.
  El asterisco de requerido va en acento. El `hint` va 12 px en Tinta Apagada; el error va
  inline con `role="alert"`, en `--status-dropped`.
- **En móvil todos los campos se pintan a 16 px** — regla global, no clase por componente.

### Navigation
- **Móvil:** barra inferior fija de cinco destinos, `sticky bottom-0`, fondo al 90 % con
  `backdrop-blur`, borde superior, padding que respeta `env(safe-area-inset-bottom)`. Etiqueta
  en mono 10 px bajo un icono de 20 px; el destino activo va en acento con `aria-current`.
- **Desktop (`sm:` en adelante):** topbar horizontal de altura constante (59 px), enlaces a
  13 px con `transition-colors`, avatar de 34 px con el menú de «Tu cuenta». La barra inferior
  desaparece (`sm:hidden`).
- El armazón (`AppShell`) pone el `<main id="contenido">` y el skip-link una sola vez para toda
  la app; ninguna página los declara.

### Cabecera de página (componente firma)
`PageHeader` es la firma de cada pantalla: una barrita de acento de 8×22 px con esquina de
píldora, el título en Fraunces, y a la derecha lo que la pantalla necesite. Cuando la pantalla
es un destino al que se entra desde otra, la barrita se sustituye por un botón circular de
vuelta. La barra es `aria-hidden`: es marca de página, no información.

### Portada (componente firma)
`CoverCard` es **el** componente del sistema: proporción `2/3`, esquina de 10 px, borde, papel
hundido de fondo mientras carga, sombra de portada, y un `scale-105` de 200 ms al hover del
grupo. Debajo, título en Fraunces 14 px a dos líneas máximo y subtítulo en Fraunces itálica
12 px. La opción `fixedTitleHeight` reserva siempre las dos líneas, y solo se usa cuando bajo la
tarjeta va algo más que deba quedar a la misma altura entre vecinas.

### Vacío (componente firma)
`EmptyState` tiene **dos tallas, no dos componentes**: `page` (glifo de 64 px, titular serif de
20 px, 128 px de aire — cuando el vacío ES la pantalla) y `panel` (glifo de 44 px, titular serif
de 16 px — cuando es una lista dentro de una sección). La anatomía no cambia: glifo en caja con
borde y acento, qué pasa, y una salida.

### Marca
El logo son **tres lomos de distinta altura** en los colores de tipo de medio —libro, película,
serie—: una mini estantería que dice «aquí cabe todo» reutilizando el mismo sistema de color que
organiza la interfaz. El wordmark parte el nombre en «Biblio» + «share» en acento. Vigente y
documentado como estado actual, **no como invariante**: un logo mejor puede sustituirlo.

### Iconografía
Set propio, `viewBox` 24, trazo 1.8 con extremos y uniones redondeados, sin relleno, en
`currentColor`. El logo es la única excepción multicolor.

## Do's and Don'ts

### Excepción de la mascota: RPG de bosque (#1165, 2026-09-09)

`/mascota` tiene un sistema local idéntico en claro y oscuro. La fuente ejecutable y
**única** es `src/components/pet/game/pet-game.module.css`; no cambia los tokens
globales de Paper. `training.module.css` y `equipment-panel.module.css` **consumen**
esos tokens y no declaran ninguno propio: cuando tenían paleta propia, el mismo botón
salía melocotón en Entrenamiento y crema en Aventura, y había trece dorados para un
solo papel.

**Paleta con nombre.** Bosque `--forest-900 #071f19` (fondo), `--forest-800 #0c2d24`
(panel), `--forest-700 #123b2f` (hundido), `--forest-600 #1d493c` (pista de barras y
selección); `--moss #355b48` (borde) y `--moss-light #6cb86b` (progreso y vida).
Madera `--wood-dark #6c421e`, `--wood #81572a`, `--wood-edge #b1934e`. Tinta
`--cream #f4f0d8`, `--cream-muted #b5cfc0`. Señales `--gold #eed281` (selección y
foco), `--sky #1f5f94` (XP), `--hp #6cb86b`, `--hp-rival #d9694f`, `--arcane #7a4fa8`
(ulti). Color por atributo, que pertenece al dato y nunca al rol de un control:
`--attr-fue #d9694f`, `--attr-con #e0574f`, `--attr-int #4aa3df`, `--attr-sab
#6cb86b`, `--attr-car #b48ad6`, `--attr-des #eed281`.

**Forma y texto.** Dos radios y solo dos: `--r-1: 4px` para lo diminuto y `--r-2: 8px`
para todo lo demás. Escala de texto 12/13/14/16/18/22/26 y pesos 400/600/700; **nada
por debajo de 12 px** y ni serif ni mono dentro del juego. Los controles táctiles y
el regreso a Biblioshare miden 44 px.

**Escala de píxel entera, sin excepciones.** Los escenarios se sirven a 2× (3× desde
1400 px) del tamaño nativo del WebP con `background-size` en píxeles, nunca con
`cover`: un factor fraccionario con `image-rendering: pixelated` reparte píxeles de
uno y dos px y el arte deja de leerse como pixel art. El sprite va a 2×, así que las
dos rejillas casan. Móvil usa la lámina en vertical `camp-portrait.webp` (288×384);
escritorio la apaisada `camp.webp` (576×448); la Madriguera tiene escena propia,
`gathering.webp` (576×432). Las sombras de contacto son elipses dentadas, no
`drop-shadow` desenfocado.

**Materiales.** Tres piezas de nueve cortes en `public/pet/ui/`, generadas con
PixelLab: `frame-moss.webp` (recorte 8 px) para los paneles de contenido,
`frame-wood.webp` (recorte 16 px) para la placa de identidad, y `plank-normal`,
`plank-hover` y `plank-pressed` (recorte `0 8`) para la acción principal. El tablón
exige altura múltiplo de 32 px —64 px en el CTA— o la veta se estira desigual.
`frame-parchment.webp` está generado y **sin cablear**: su centro claro obliga a
tinta oscura dentro (issue abierta).

**Botones del juego.** La acción principal es tablón de madera; el resto,
musgo. `buttonVariants("primary")` de Paper no entra bajo `.game` — traía el
terracota, que aquí no significa nada. `secondary` y `ghost` sí valen: no llevan
color propio y heredan los tokens remapeados.

Las reglas Paper de abajo siguen aplicándose fuera del juego. Madrigueras de clubes
y mascotas embebidas en perfiles conservan la presentación del contexto anfitrión.

### Do:
- **Do** usar la terracota como único primario, y reservarla para el CTA, el foco, el progreso y
  la selección. Si aparece en todas partes, deja de señalar.
- **Do** declarar cada color nuevo en los **tres** bloques de tema (`:root`, `.dark` y el espejo
  de `prefers-color-scheme`), o el test lo caza.
- **Do** pintar el texto secundario en `--muted-foreground` y dejar `--foreground-faint` para
  objetos decorativos `aria-hidden`.
- **Do** encabezar todo bloque con `label-section`, no con una combinación `font-mono … uppercase`
  escrita a mano.
- **Do** poner `min-width: 0` en cada celda de grid o flex que deba encoger.
- **Do** elegir el contenedor y la escalera de columnas **a la vez**, de `src/lib/ui/layout.ts`.
- **Do** dejar el foco de teclado a `globals.css`: ya está resuelto para toda la app.
- **Do** dibujar el hueco (borde discontinuo, tres huecos punteados) en vez de dejar aire en
  blanco donde falta contenido.

### Don't:
- **Don't** usar emojis como iconografía. El set es de línea, monocromo y en `currentColor`; los
  emojis solo existen como reacciones que escribe el usuario.
- **Don't** introducir toasts. El feedback vive inline, con `role="status"` o `role="alert"`; un
  aviso flotante que se va solo no es una respuesta.
- **Don't** usar el color de tipo de medio (libro/película/serie) para el rol de un control. Es
  del contenido: barras, chips, marcas. El CTA de una serie sigue siendo terracota.
- **Don't** añadir una tercera sombra ni colar un `shadow-lg` en una tarjeta. Hay dos sombras y
  tienen nombre.
- **Don't** sembrar acciones destructivas inline: van tras el «···» y solo preguntan cuando son
  irreversibles Y arrastran otros datos.
- **Don't** escribir `focus:outline-none` esperando que apague algo — la regla global de foco va
  sin capa y gana.
- **Don't** poner `maximum-scale=1` ni `user-scalable=no`: mata el zoom de accesibilidad para
  todo el mundo.
