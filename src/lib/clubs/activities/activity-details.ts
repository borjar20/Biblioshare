// Edición de la cabecera de una actividad: los tipos y la validación que
// comparten el formulario y la server action.
//
// Vive en un módulo SIN directiva a propósito. Con "use client", Next 16
// convierte hasta una función pura en referencia de cliente y llamarla desde el
// servidor devuelve un 500 en tiempo de ejecución que ni tsc ni next build
// detectan (#595).

/** Los códigos que levanta la RPC, más el cajón de sastre. La UI los traduce. */
export type ActivityDetailsError =
  | "not_found"
  | "use_update_club_event"
  | "forbidden"
  | "dates_frozen"
  | "title_required"
  | "invalid_range"
  | "unknown";

export type ActivityDetailsResult = { ok: true } | { ok: false; code: ActivityDetailsError };

/** Tal como salen del formulario: cadenas, con "" para "sin fecha". */
export type ActivityDetailsInput = {
  title: string;
  description: string;
  startsOn: string;
  endsOn: string;
};

// La MISMA regla que la RPC, adelantada al formulario para no hacer el viaje.
// La autoridad sigue siendo el SQL: esto solo ahorra una ida y vuelta.
//
// Las fechas se comparan como cadenas ISO, que ordenan igual que
// cronológicamente -- ningún Date entra aquí (un `date` de Postgres no lleva
// zona y pasarlo por Date puede retroceder un día).
export function validateActivityDetails(input: ActivityDetailsInput): ActivityDetailsError | null {
  if (input.title.trim() === "") return "title_required";
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) return "invalid_range";
  return null;
}
