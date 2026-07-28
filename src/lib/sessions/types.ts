import type { Position } from "@/lib/library/position";

// A single logged reading/watching session (docs/REQUIREMENTS.md §7.14).
// Distinct from DiaryEntry: a diary entry records a *complete pass* (rating +
// review); a session records *incremental progress* (position reached,
// optional manual duration).
//
// SIN `note` a propósito (issue #109). `addSession` escribe el texto de la nota
// en dos sitios —`progress_sessions.note` y una fila en `notes`— y la ficha
// pintaba los dos, así que la misma frase salía duplicada en la pestaña
// Registro. El hogar del texto es la tabla `notes`, que es la que tiene tipo,
// anclaje, etiquetas y acciones; quien lo pinta es «Mis notas y citas».
//
// La columna vieja NO se deja de escribir: sigue alimentando el feed social y
// el recuento de get-today-focus. Simplemente ya no se lee desde aquí.
export type ProgressSession = {
  id: string;
  sessionDate: string;
  /** Cuándo se guardó la fila — timestamptz, nunca editado por el usuario
   *  (a diferencia de sessionDate, que sí se puede backdatear). Ver
   *  sessionRelativeBasis en session-relative-basis.ts. */
  createdAt: string;
  durationMinutes: number | null;
  // Position REACHED in this session: {page} for books, {season, episode}
  // for series. Movies don't have sessions (see §7.14 scope decision).
  position: Position;
};
