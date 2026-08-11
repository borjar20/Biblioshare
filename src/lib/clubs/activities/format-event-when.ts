// Fecha y hora de un evento EN SU ZONA. Módulo aparte de format-date.ts porque
// ese formatea `date` de Postgres (sin zona, y por eso parte la cadena a mano);
// aquí se formatea un `timestamptz`, que es un instante y SÍ necesita una zona
// para pintarse.
//
// Todo pasa por Intl con `timeZone` explícita: nunca por la zona del proceso. Un
// servidor en UTC y un navegador en Madrid tienen que pintar lo mismo, y el
// horario de verano lo resuelve la base de datos de zonas del motor, no
// aritmética nuestra.

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = [
  "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
];

// Partes de la fecha en una zona concreta, como números. `en-CA` da
// "YYYY-MM-DD", el único formato que se parte sin ambigüedad.
function partsIn(instant: string, timeZone: string) {
  const date = new Date(instant);
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-")
    .map(Number);

  // El día de la semana se pide a Intl en la MISMA zona en vez de calcularlo:
  // getDay() usaría la zona del proceso y podría bailar un día.
  const weekdayIndex = DIAS.indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
      .format(date)
      .toLowerCase()
      .replace("sunday", "domingo")
      .replace("monday", "lunes")
      .replace("tuesday", "martes")
      .replace("wednesday", "miércoles")
      .replace("thursday", "jueves")
      .replace("friday", "viernes")
      .replace("saturday", "sábado"),
  );

  return { year: y, month: m, day: d, weekdayIndex };
}

export function formatEventTime(instant: string | null, timeZone: string): string | null {
  if (!instant) return null;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    // h23 explícito: sin él, algunas versiones de ICU dan "24:00" para medianoche.
    hourCycle: "h23",
  }).format(new Date(instant));
}

/** «12 de agosto» — para cuando ya se sabe de qué año se habla. */
function dayMonth(instant: string, timeZone: string): string {
  const { day, month } = partsIn(instant, timeZone);
  return `${day} de ${MESES[month - 1]}`;
}

/**
 * «miércoles, 12 de agosto de 2026 · 18:00 – 20:00».
 *
 * Si el fin cae otro día EN LA ZONA DEL EVENTO, se repite la fecha: «18:00 –
 * 13 de agosto, 01:30». Sin eso, un evento que cruza la medianoche parecería
 * terminar antes de empezar.
 */
export function formatEventWhen(
  startsAt: string | null,
  endsAt: string | null,
  timeZone: string,
): string | null {
  if (!startsAt) return null;

  const start = partsIn(startsAt, timeZone);
  const fecha = `${DIAS[start.weekdayIndex]}, ${start.day} de ${MESES[start.month - 1]} de ${start.year}`;
  const horaInicio = formatEventTime(startsAt, timeZone);
  if (!endsAt) return `${fecha} · ${horaInicio}`;

  const end = partsIn(endsAt, timeZone);
  const horaFin = formatEventTime(endsAt, timeZone);
  const mismoDia =
    start.year === end.year && start.month === end.month && start.day === end.day;

  return mismoDia
    ? `${fecha} · ${horaInicio} – ${horaFin}`
    : `${fecha} · ${horaInicio} – ${dayMonth(endsAt, timeZone)}, ${horaFin}`;
}

/** «11 de agosto a las 18:00» — el «te avisaremos…» del selector. */
export function formatReminderMoment(
  instant: string | null,
  timeZone: string,
): string | null {
  if (!instant) return null;
  return `${dayMonth(instant, timeZone)} a las ${formatEventTime(instant, timeZone)}`;
}

// Desplazamiento respecto a UTC en minutos, para una zona y un instante dados.
// Se calcula comparando la misma marca formateada en la zona y en UTC, que es la
// forma de obtenerlo sin librerías.
function offsetMinutes(timeZone: string, instant: string): number {
  const date = new Date(instant);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const [fecha, hora] = fmt.format(date).split(", ");
  const comoUtc = Date.parse(`${fecha}T${hora}:00Z`);
  return Math.round((comoUtc - date.getTime()) / 60_000);
}

/**
 * ¿Merece la pena enseñar la zona? Solo si el reloj del evento NO es el de quien
 * mira. Dos nombres distintos con el mismo desplazamiento (Madrid y Bruselas) no
 * son ruido que valga: enseñar «Europe/Madrid» a quien está en Bruselas no le
 * aclara nada.
 *
 * Se comparan dos instantes separados seis meses para no confundir «mismo reloj
 * todo el año» con «mismo reloj hoy»: Madrid y Londres coinciden en ninguno, pero
 * hay pares que solo divergen en verano.
 */
export function shouldShowTimezone(
  eventTimeZone: string,
  viewerTimeZone: string | null,
): boolean {
  if (!viewerTimeZone) return true;
  if (eventTimeZone === viewerTimeZone) return false;

  const invierno = "2026-01-15T12:00:00Z";
  const verano = "2026-07-15T12:00:00Z";
  return (
    offsetMinutes(eventTimeZone, invierno) !== offsetMinutes(viewerTimeZone, invierno) ||
    offsetMinutes(eventTimeZone, verano) !== offsetMinutes(viewerTimeZone, verano)
  );
}

/**
 * «Europe/Madrid (GMT+2)». El desplazamiento se calcula contra la fecha DEL
 * EVENTO, no contra hoy: la misma zona es GMT+1 en enero y GMT+2 en agosto, y
 * usar «hoy» mentiría media parte del año.
 */
export function timezoneLabel(timeZone: string, instant: string): string {
  const minutos = offsetMinutes(timeZone, instant);
  const signo = minutos < 0 ? "-" : "+";
  const abs = Math.abs(minutos);
  const horas = Math.floor(abs / 60);
  const resto = abs % 60;
  const desfase = resto === 0 ? `${horas}` : `${horas}:${String(resto).padStart(2, "0")}`;
  return `${timeZone} (GMT${signo}${desfase})`;
}
