import type { ClubActivity } from "./core";

export type ActivityGroups = {
  /** Activas que ya han empezado, o que nunca dijeron cuándo empezaban. */
  enCurso: ClubActivity[];
  /** Activas con fecha de inicio en el futuro. */
  proximas: ClubActivity[];
  proposed: ClubActivity[];
  /** Finalizadas y archivadas. Sin eventos: los archivados también salen. */
  finished: ClubActivity[];
};

// "Pasado" se DERIVA de la fecha, nunca se persiste (spec 2026-07-22 §2.3): un
// estado que hay que mantener sincronizado con el calendario es un estado que se
// desincroniza. La comparación es de cadenas ISO, que ordenan lexicográficamente
// igual que cronológicamente -- así no entra ningún Date en el cálculo.
//
// Un evento que es HOY no ha pasado: sigue siendo la fecha señalada.
//
// OJO: esta función se ha quedado SIN NINGÚN LLAMADOR DE PRODUCCIÓN, solo la
// llama su test. Ya no la usa groupActivities (los eventos salieron de la
// pestaña) y su único uso restante, en activity-card.tsx, está gateado tras
// `!linked` -- y `linked` es `definition.hasDetailView`, que solo es false para
// `evento`, el kind que groupActivities acaba de sacar del listado. Es decir:
// `linked` es siempre true para todo lo que puede llegar a esa tarjeta.
//
// Se conserva a propósito, no por descuido: el borrado (aquí y en
// activity-card.tsx) va aparte, en la issue #587, para no mezclar dos
// diagnósticos en la misma revisión. Ahí está la cadena entera y las trampas.
export function isPastEvent(startsOn: string | null, today: string): boolean {
  if (!startsOn) return false;
  return startsOn < today;
}

// Los eventos NO se agrupan aquí: viven en el calendario y en su ficha propia
// (spec 2026-08-11). Se filtran por `kind`, no por estado, y en TODOS los grupos
// -- el que se olvida es `finished`, donde caía el evento ARCHIVADO.
//
// `today` volvió a hacer falta (spec 2026-08-12) por un motivo NUEVO, no por una
// vuelta atrás: partir las activas en las que ya corren y las que aún no
// empiezan. Viene del SERVIDOR; con el reloj del visitante, una actividad
// cambiaría de sección según el huso y contradiría al calendario del club (#271).
//
// Una PROPUESTA con fecha futura no es "próxima": `proposed` es una cola de
// moderación y puede acabar rechazada (spec 2026-08-12, D2). Por eso el reparto
// por fecha se aplica SOLO a las activas.
export function groupActivities(
  activities: ClubActivity[],
  today: string,
): ActivityGroups {
  const sinEventos = activities.filter((a) => a.kind !== "evento");
  const activas = sinEventos.filter((a) => a.status === "active");

  return {
    enCurso: activas.filter((a) => !a.startsOn || a.startsOn <= today),
    proximas: activas.filter((a) => a.startsOn !== null && a.startsOn > today),
    proposed: sinEventos.filter((a) => a.status === "proposed"),
    finished: sinEventos.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
