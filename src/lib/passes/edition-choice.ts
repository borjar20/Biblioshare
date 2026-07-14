// Clave de localStorage para recordar la edición elegida AL SEGUIR un ítem,
// antes de que exista ningún pase donde guardarla (Hallazgo 3 de la revisión
// final: la edición vive en el PASE, no en la entrada — no hay
// library_entries.preferred_edition_id ni se va a añadir). Va por itemId, no
// por entryId ni passId: se escribe en FollowButton (log-panel.tsx), cuando
// todavía no hay ni entrada ni pase, y se consume — y se borra — en cuanto
// se abre el primer pase de ese ítem (ManagedLog > ProgressBlock), que es
// quien de verdad puede guardar una edición. Mismo patrón que
// src/lib/passes/edition-asked.ts.
export const editionChoiceStorageKey = (itemId: string) =>
  `biblioshare:edition-choice:${itemId}`;
