// Anchos de contenedor y escaleras de rejilla, en un solo sitio.
//
// Antes de esto la app tenía NUEVE anchos de página distintos (de 672 a 1600) y
// NUEVE de raíl (de 260 a 372), cada uno decidido por separado: el rediseño
// Paper dejó unas pantallas a dos columnas y otras en una tira centrada. Aquí
// viven los cuatro papeles que de verdad hay, y cada página escoge uno.
//
// REGLA QUE NO SE PUEDE ROMPER: el ancho de contenedor y la escalera de
// columnas son UNA decisión, nunca dos. Los breakpoints de Tailwind miran la
// VENTANA, no el contenedor, así que una rejilla `2xl:grid-cols-8` dentro de un
// contenedor de 896px pinta ocho portadas diminutas en un tercio de la
// pantalla. Fue el fallo del skeleton en la PR #372. Por eso `COVER_GRID_COLS`
// solo se usa junto a `SHELL_GRID`, y `NOTE_GRID_COLS` también.

/** Un solo camino, un solo foco: alta, acceso, importar (fases de subida), onboarding. */
export const SHELL_FORM = "max-w-2xl";

/** Prosa y listas de una columna, donde la línea larga cansa: /admin, seguidores, siguiendo. */
export const SHELL_READ = "max-w-4xl";

/**
 * Todo lo que lleva raíl o muro: home, ficha, club, perfil, /estadisticas.
 * Para en 1200 a propósito — más allá, la columna de texto del feed se hace
 * incómoda de leer. Las rejillas sí siguen creciendo, ver `SHELL_GRID`.
 */
export const SHELL_APP = "max-w-2xl lg:max-w-[1200px]";

/** Rejillas, donde más ancho = más obras a la vista y no hay prosa que se estire. */
export const SHELL_GRID = "max-w-4xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[100rem]";

/** Raíl derecho único. Era el valor de las fichas, las pantallas más trabajadas
 *  del rediseño Paper: así son las descolgadas las que se mueven, no ellas. */
export const RAIL = "340px";

/**
 * Envoltorio de DOS columnas (contenido + raíl de 340px). Nació para la HOME
 * (feed + raíl), pero la HOME pasó a tres áreas (`SHELL_HOME` + `.home-grid`);
 * hoy lo usa `/post/[id]` (post + raíl de contexto), así que sobrevive pese al
 * nombre heredado. Vive aquí, no como literal en cada página, para que esqueleto
 * y contenido no diverjan en ancho (#376). El `340px` es el valor de `RAIL`;
 * Tailwind necesita el literal en el fuente para generar el CSS, así que se
 * escribe literal aquí, en un solo sitio que los consumidores importan.
 */
export const HOME_TWO_COL =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7";

/**
 * Contenedor de la HOME de tres áreas (personal · feed · stats). Su propio
 * ancho, NO `SHELL_APP`: el reparto en tres columnas amplias (≥1440) necesita
 * ~1368px, más que los 1200 de `SHELL_APP`. Por debajo de 1100 el Inicio va en
 * UNA columna, así que ahí se queda en `max-w-2xl` (672) —un ancho de lectura,
 * no una columna estirada a 1440—; a partir de 1100, donde arrancan las tres
 * columnas, crece hasta 1440 y el reparto lo hace la rejilla `.home-grid` (en
 * `globals.css`), que `page.tsx` y `loading.tsx` comparten por nombre para no
 * poder divergir (era el motivo de la vieja `HOME_TWO_COL`; ver #376). A ≥1440 y
 * con `px-7` da columnas de ~493/543/300 (la central, el feed, algo más ancha
 * que la izquierda).
 */
export const SHELL_HOME = "max-w-2xl min-[1100px]:max-w-[1440px]";

/**
 * Contenedor de `/post/[id]`, la página individual de un post en TRES áreas
 * (OBRA · CONVERSACIÓN · SOCIAL). Su propio ancho, NO `SHELL_APP`: el reparto en
 * tres columnas cómodas a ≥1440 (250 / minmax(620,760) / 300 + gaps) necesita
 * ~1358px, más que los 1200 de `SHELL_APP`, y el diseño pide un contenedor de
 * ~1450. Por debajo de 1023 la página va en UNA columna (la CONVERSACIÓN manda y
 * conserva un ancho de lectura), así que ahí se queda en `max-w-2xl` (672) y NO
 * se estira; a partir de 1023, donde arrancan las tres columnas, crece hasta
 * 1450 y el reparto lo hace la rejilla `.post-grid` (en `globals.css`). La
 * prioridad responsive es CONVERSACIÓN > SOCIAL > OBRA: las columnas laterales
 * conservan TODA su información mientras son visibles y solo desaparecen a <1023
 * (sin reducción progresiva de contenido — decisión 2026-08-11).
 */
export const SHELL_POST = "max-w-2xl min-[1023px]:max-w-[1450px]";

/**
 * Contenedor de `/persona/[id]`, la ficha de persona en TRES áreas (FICHA ·
 * OBRAS · RAÍL). Su propio ancho, NO `SHELL_APP`: el centro es un explorador de
 * obras con filas de cuatro zonas (obra · crédito · estado · valoración), y el
 * reparto del mockup —308 / fluida / 344 con gap 28 y padding 30— pide un
 * contenedor de ~1740, muy por encima de los 1200 de `SHELL_APP`.
 *
 * Por debajo de 1000 la ficha va en UNA columna y se queda en `max-w-2xl` (672)
 * —ancho de lectura, no una columna estirada a 1740—; a partir de 1000 crece y
 * el reparto lo hace `.person-grid` (en `globals.css`), que `page.tsx` y
 * `loading.tsx` comparten POR NOMBRE para no poder divergir (mismo motivo que
 * `.post-grid` y `.home-grid`, ver #372/#376).
 */
export const SHELL_PERSON = "max-w-2xl min-[1000px]:max-w-[1740px]";

/**
 * Portadas. Celda estrecha con `aspect-[2/3]`: a 1600px caben ocho y siguen
 * leyéndose. Las dos últimas paradas existen para que ensanchar el shell no
 * infle la portada al repartir 1600px entre cinco.
 */
export const COVER_GRID_COLS =
  "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8";

/**
 * Tarjetas de texto (notas y citas). Escalera propia, NO la de portadas: una
 * nota no quiere el ancho de una carátula. A 1600px son cuatro columnas de
 * ~380px, ancho cómodo para leer una cita entera.
 */
export const NOTE_GRID_COLS = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

/**
 * Tarjetas anchas con contenido dentro (saga con progreso, club con portada y
 * recuento). Paran en cuatro: a 1600px repartidos entre tres, cada tarjeta se
 * iría a ~530px y el contenido queda flotando.
 *
 * OJO: `saga-load-more` monta su PROPIA rejilla para las filas que añade, así
 * que tiene que usar esta misma constante o las columnas dejan de alinearse
 * con las de la primera página.
 */
export const CARD_GRID_COLS = "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * Rejilla de Colecciones, dentro de `SHELL_GRID` (mismo contenedor que `Todo` y
 * `Sagas`: cambiar de pestaña no salta de ancho). Misma escalera grande que
 * `CARD_GRID_COLS` (3 en `lg`, 4 en `xl`) — para que `Colecciones` y `Sagas`
 * lleguen al mismo número de columnas en pantallas grandes y no solo compartan
 * ancho de contenedor. Difiere solo en MÓVIL: dos columnas desde el principio
 * (`CARD_GRID_COLS` empieza en una), porque la tarjeta de colección es vertical
 * y estrecha — a una sola columna sobra media pantalla vacía a cada lado.
 */
export const TILE_GRID_COLS = "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * Fichas-formulario que se revisan en tanda (filas sin emparejar al importar,
 * cola de revisión). Cada celda conserva ~470px dentro de `SHELL_APP`: de sobra
 * para etiqueta e input sin apretar.
 */
export const FORM_CARD_GRID_COLS = "grid-cols-1 lg:grid-cols-2";
