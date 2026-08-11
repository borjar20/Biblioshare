import type { ClubActivity } from "./core";

export type ActivityGroups = {
  active: ClubActivity[];
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
// (spec 2026-08-11). Se filtran por `kind`, no por estado, y en los tres grupos
// -- el que se olvida es `finished`, donde caía el evento ARCHIVADO y seguiría
// a la vista.
//
// Por eso esta función ya no necesita `today`: lo usaba solo para ordenar los
// eventos (futuros antes que pasados), y ese grupo ya no existe.
export function groupActivities(activities: ClubActivity[]): ActivityGroups {
  const sinEventos = activities.filter((a) => a.kind !== "evento");

  return {
    active: sinEventos.filter((a) => a.status === "active"),
    proposed: sinEventos.filter((a) => a.status === "proposed"),
    finished: sinEventos.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
