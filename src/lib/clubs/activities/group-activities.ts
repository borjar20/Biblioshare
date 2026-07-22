import type { ClubActivity } from "./core";

export type ActivityGroups = {
  /** Eventos vivos (kind='evento', status='active'), futuros antes que pasados. */
  events: ClubActivity[];
  active: ClubActivity[];
  proposed: ClubActivity[];
  /** Finalizadas y archivadas, incluidos los eventos archivados. */
  finished: ClubActivity[];
};

// "Pasado" se DERIVA de la fecha, nunca se persiste (spec 2026-07-22 §2.3): un
// estado que hay que mantener sincronizado con el calendario es un estado que se
// desincroniza. La comparación es de cadenas ISO, que ordenan lexicográficamente
// igual que cronológicamente -- así no entra ningún Date en el cálculo.
//
// Un evento que es HOY no ha pasado: sigue siendo la fecha señalada.
export function isPastEvent(startsOn: string | null, today: string): boolean {
  if (!startsOn) return false;
  return startsOn < today;
}

export function groupActivities(
  activities: ClubActivity[],
  today: string,
): ActivityGroups {
  // Los eventos SALEN del filtro de activas: comparten status='active' con las
  // actividades en marcha, y sin esto aparecerían en dos grupos a la vez.
  const events = activities
    .filter((a) => a.kind === "evento" && a.status === "active")
    .sort((x, y) => {
      const xPast = isPastEvent(x.startsOn, today);
      const yPast = isPastEvent(y.startsOn, today);
      if (xPast !== yPast) return xPast ? 1 : -1;
      const xDate = x.startsOn ?? "";
      const yDate = y.startsOn ?? "";
      // Futuros: el más próximo primero. Pasados: el más reciente primero.
      return xPast ? yDate.localeCompare(xDate) : xDate.localeCompare(yDate);
    });

  return {
    events,
    active: activities.filter((a) => a.status === "active" && a.kind !== "evento"),
    proposed: activities.filter((a) => a.status === "proposed"),
    finished: activities.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
