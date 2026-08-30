/**
 * Reparto de la mesa. Puro y sin React: la pantalla más difícil de la app se decide
 * aquí, en funciones que se pueden probar sin montar un tablero.
 *
 * Tres familias, no quince maquetas (canvas de la fase 1a):
 * - `rows`  «mesa»: dos filas enfrentadas, la de arriba girada 180. El reparto base.
 * - `head`  «cabecera(s)»: el bloque central intacto y uno o dos asientos de canto.
 * - `flat`  «todos igual»: nadie girado. Para el móvil que se va pasando por la mesa
 *           y como salida accesible de quien la rotación le complica leer.
 *
 * El reparto es PREFERENCIA DE VISTA, no estado de partida: no entra en el log de
 * eventos, no reordena asientos y no toca el orden del DOM (el orden lógico es
 * siempre el de asientos — la rotación es solo `transform`, spec §7).
 */
export type BoardOrientation = "portrait" | "landscape";
export type LayoutFamily = "rows" | "head" | "flat";

export type SeatPlacement = {
  seat: number;
  /** Nombre de área de la rejilla; se pinta con `style={{ gridArea }}`. */
  area: string;
  rotation: 0 | 90 | 180 | -90;
};

export type BoardLayout = {
  family: LayoutFamily;
  /** `grid-template-columns` */
  columns: string;
  /** `grid-template-rows` */
  rows: string;
  /** `grid-template-areas` */
  areas: string;
  consoleArea: string;
  seats: SeatPlacement[];
};

const areaOf = (seat: number) => `s${seat}`;
const CONSOLE_AREA = "cons";

/**
 * La consola SIEMPRE tiene fila propia (`auto`), también tumbada. La variante
 * flotante (decisión 2026-08-29 (6)) se retiró en la (9): flotaba justo sobre la
 * franja donde TODAS las cabeceras pegan al centro y dejaba los nombres —y sus
 * hojas— intocables; ninguna reserva de padding aguanta una consola de ~300 px.
 * El coste real de la banda compacta tumbada es que el número de vidas baja de
 * 78 a ~76 px: se paga.
 */
const CONSOLE_TRACK = "auto";

/**
 * Reparte `areas` a lo largo de `columns` celdas repitiendo las que sobran. Sirve
 * para que una fila con menos asientos que columnas los estire en vez de dejar
 * huecos: a 3 jugadores, el de abajo ocupa el ancho entero.
 *
 * Cada área sale en celdas CONTIGUAS, que es lo que exige `grid-template-areas`
 * (un área partida en dos trozos invalida la declaración ENTERA, en silencio).
 */
function spread(areas: string[], columns: number): string[] {
  return Array.from({ length: columns }, (_, i) => areas[Math.floor((i * areas.length) / columns)]);
}

const fr = (n: number) => Array.from({ length: n }, () => "1fr").join(" ");
const quote = (cells: string[]) => `"${cells.join(" ")}"`;

function rowsLayout(players: number): BoardLayout {
  // El sobrante de un impar va ABAJO: es el lado de quien tiene el móvil en la mano.
  const top = Math.ceil(players / 2);
  const bottom = players - top;
  const columns = Math.max(top, bottom, 1);
  const topSeats = Array.from({ length: top }, (_, i) => i);
  const bottomSeats = Array.from({ length: bottom }, (_, i) => top + i);

  const areaRows = [quote(spread(topSeats.map(areaOf), columns))];
  const trackRows = ["1fr"];
  areaRows.push(quote(Array.from({ length: columns }, () => CONSOLE_AREA)));
  trackRows.push(CONSOLE_TRACK);
  if (bottom > 0) {
    areaRows.push(quote(spread(bottomSeats.map(areaOf), columns)));
    trackRows.push("1fr");
  }

  return {
    family: "rows",
    columns: fr(columns),
    rows: trackRows.join(" "),
    areas: areaRows.join(" "),
    consoleArea: CONSOLE_AREA,
    seats: [
      ...topSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 180 as const })),
      ...bottomSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 0 as const })),
    ],
  };
}

function headLayout(players: number): BoardLayout {
  // A cinco entra UN lateral (el 2x2 se queda intacto y el quinto se sienta en la
  // cabecera); a cuatro y a seis, dos — uno en cada extremo de la mesa.
  const lateralCount = players === 5 ? 1 : 2;
  const centerCount = players - lateralCount;
  const centerTop = Math.ceil(centerCount / 2);
  const centerBottom = centerCount - centerTop;
  const centerColumns = Math.max(centerTop, centerBottom, 1);

  const topSeats = Array.from({ length: centerTop }, (_, i) => i);
  const bottomSeats = Array.from({ length: centerBottom }, (_, i) => centerTop + i);
  const lateralSeats = Array.from({ length: lateralCount }, (_, i) => centerCount + i);

  const leftArea = lateralCount === 2 ? areaOf(lateralSeats[0]) : null;
  const rightArea = areaOf(lateralSeats[lateralCount - 1]);
  // Los laterales repiten su área en TODAS las filas: así el área es un rectángulo
  // de una columna por todo el alto, que es lo que los pone «de canto».
  const wrap = (cells: string[]) =>
    quote([...(leftArea ? [leftArea] : []), ...cells, rightArea]);

  const areaRows = [wrap(spread(topSeats.map(areaOf), centerColumns))];
  const trackRows = ["1fr"];
  areaRows.push(wrap(Array.from({ length: centerColumns }, () => CONSOLE_AREA)));
  trackRows.push(CONSOLE_TRACK);
  if (centerBottom > 0) {
    areaRows.push(wrap(spread(bottomSeats.map(areaOf), centerColumns)));
    trackRows.push("1fr");
  }

  // 0.62fr: un panel de canto necesita menos ancho que uno de frente porque su
  // número se lee girado — lo que le sobra es alto, no ancho.
  const columns = [...(leftArea ? ["0.62fr"] : []), fr(centerColumns), "0.62fr"].join(" ");

  return {
    family: "head",
    columns,
    rows: trackRows.join(" "),
    areas: areaRows.join(" "),
    consoleArea: CONSOLE_AREA,
    seats: [
      ...topSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 180 as const })),
      ...bottomSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 0 as const })),
      ...lateralSeats.map((seat, i) => ({
        seat,
        area: areaOf(seat),
        // El de la izquierda mira a la derecha y viceversa: la barra del asiento
        // apunta siempre al centro de la mesa.
        rotation: (lateralCount === 2 && i === 0 ? 90 : -90) as 90 | -90,
      })),
    ],
  };
}

function flatLayout(players: number): BoardLayout {
  // Nadie girado. Con pocos jugadores va en una columna; a partir de cuatro, en dos.
  const columns = players <= 3 ? 1 : 2;
  const rowCount = Math.ceil(players / columns);
  const seats = Array.from({ length: players }, (_, seat) => ({
    seat,
    area: areaOf(seat),
    rotation: 0 as const,
  }));

  const areaRows: string[] = [];
  const trackRows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowSeats = seats.slice(r * columns, r * columns + columns).map((s) => s.area);
    areaRows.push(quote(spread(rowSeats, columns)));
    trackRows.push("1fr");
    // La consola va debajo de la primera fila también aquí: sigue siendo el sitio
    // que todo el mundo alcanza, y así el reparto accesible no pierde el deshacer.
    if (r === 0) {
      areaRows.push(quote(Array.from({ length: columns }, () => CONSOLE_AREA)));
      trackRows.push(CONSOLE_TRACK);
    }
  }

  return {
    family: "flat",
    columns: fr(columns),
    rows: trackRows.join(" "),
    areas: areaRows.join(" "),
    consoleArea: CONSOLE_AREA,
    seats,
  };
}

/** Familias que tienen sentido para ese número de jugadores y esa orientación. */
export function layoutOptions(players: number, orientation: BoardOrientation): LayoutFamily[] {
  const options: LayoutFamily[] = ["rows"];
  // A 2 y 3 no hay bloque central que dejar intacto: la «cabecera» sería el reparto
  // en filas con otro nombre. A 6 de pie tampoco: dos laterales dejan los paneles
  // centrales en 81 px y dos cifras en mono necesitan 93 — no cabe, medido.
  if (players >= 4 && (players !== 6 || orientation === "landscape")) options.push("head");
  options.push("flat");
  return options;
}

export function defaultLayout(players: number, orientation: BoardOrientation): LayoutFamily {
  // A cinco, la cabecera gana por algo que no es estético: pasar de 4 a 5 jugadores
  // no recoloca a nadie, añade un asiento. A seis tumbado salen las seis personas
  // donde estarían en la mesa. En todo lo demás manda el reparto en filas.
  if (players === 5) return "head";
  if (players === 6 && orientation === "landscape") return "head";
  return "rows";
}

export function resolveLayout(
  players: number,
  orientation: BoardOrientation,
  family: LayoutFamily,
): BoardLayout {
  // Una familia que no aplica a ese número cae al por defecto en vez de pintar una
  // mesa imposible: la preferencia vive en localStorage y puede quedar obsoleta si
  // la siguiente partida tiene otro número de jugadores.
  const usable = layoutOptions(players, orientation).includes(family)
    ? family
    : defaultLayout(players, orientation);
  if (usable === "head") return headLayout(players);
  if (usable === "flat") return flatLayout(players);
  return rowsLayout(players);
}

/** Techo, suelo y holgura del número de vidas, en px. */
const LIFE_MAX = 78;
const LIFE_MIN = 28;
/** Ancho de un dígito en Geist Mono: 0,6 em. */
const MONO_DIGIT_RATIO = 0.6;
/** Padding lateral del panel que el número no puede invadir. */
const PANEL_PADDING = 24;

/**
 * El tamaño sale del panel Y del número de dígitos, no solo del reparto: en
 * Commander se gana vida a puñados y hay mesas que pasan de cien. A 78 px, tres
 * cifras en mono ocupan ~140 px de los ~172 útiles del panel de pie: cabe, pero sin
 * aire. La holgura del 0,8 es lo que devuelve ese aire.
 */
export function lifeFontSize({
  width,
  height,
  digits,
}: {
  width: number;
  height: number;
  digits: number;
}): number {
  const byHeight = height * 0.44;
  const usable = Math.max(0, width - PANEL_PADDING);
  const byWidth = (usable * 0.8) / (Math.max(digits, 1) * MONO_DIGIT_RATIO);
  return Math.max(LIFE_MIN, Math.floor(Math.min(LIFE_MAX, byHeight, byWidth)));
}
