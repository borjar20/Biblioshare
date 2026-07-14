// Tipos y helpers puros del reto por lista (EPIC-05, Bloque H3).
//
// Viven aparte de list-challenge.ts a propósito: ese módulo es "use server", y
// ahí TODO export debe ser una server action asíncrona -- un helper síncrono
// como itemKey() no puede exportarse desde allí. Los componentes cliente
// importan de aquí.

export type ListChallengeParticipantProgress = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  completedKeys: string[]; // `${itemType}:${itemId}`
  completedOnByKey: Record<string, string>; // fecha del primer pase que cuenta
};

export type ListChallengeProgressView = {
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;
  // Roster COMPLETO de participantes (no solo quienes tienen algo completado):
  // quien va 0/N también necesita su columna en la rejilla. Viewer primero.
  participants: ListChallengeParticipantProgress[];
};

// Clave del pool polimórfico -- un ítem se identifica por (tipo, id), igual que
// en library_entries/club_activity_items.
export function itemKey(itemType: string, itemId: string): string {
  return `${itemType}:${itemId}`;
}

// Modalidad de compleción del reto (EPIC-05, Bloque H3b). Vive en
// club_activities.config->>'completionMode'.
//
//   "window" -- (default) un ítem cuenta si tienes un pase de diario terminado
//              dentro de la ventana del reto. Si ya lo leíste, toca relectura.
//   "any"    -- basta con tenerlo en la biblioteca como 'completed', sin
//              importar cuándo. Es la modalidad "sin revisionado".
export const COMPLETION_MODES = ["window", "any"] as const;
export type CompletionMode = (typeof COMPLETION_MODES)[number];

// La fuente de verdad de la regla es el SQL (get_list_challenge_progress lee el
// config por su cuenta). Esto es SOLO para pintar: qué opción sale marcada en el
// selector y qué línea de regla se muestra al pie del tablero. De ahí que
// cualquier valor inesperado (config nulo, clave ausente, basura) caiga en
// "window" -- el mismo default que el coalesce de la migración.
export function readCompletionMode(config: unknown): CompletionMode {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    if ((config as Record<string, unknown>).completionMode === "any") return "any";
  }
  return "window";
}
