// A quién avisa un comentario o reacción sobre un target. Normalmente solo al
// dueño. En un hilo de nota en el margen hay dos personas y ninguna es «público»:
// cuando escribe el autor (dueño), el aviso va al lector (audience_id).
export function threadRecipients(
  target: { kind: string; owner_id: string; audience_id: string },
  actorId: string,
): string[] {
  if (target.owner_id !== actorId) return [target.owner_id];
  if (target.kind === "margin_encounter" && target.audience_id !== actorId) return [target.audience_id];
  return [];
}
