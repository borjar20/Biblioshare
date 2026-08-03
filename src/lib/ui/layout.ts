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
 * Fichas-formulario que se revisan en tanda (filas sin emparejar al importar,
 * cola de revisión). Cada celda conserva ~470px dentro de `SHELL_APP`: de sobra
 * para etiqueta e input sin apretar.
 */
export const FORM_CARD_GRID_COLS = "grid-cols-1 lg:grid-cols-2";
