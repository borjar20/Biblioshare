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
