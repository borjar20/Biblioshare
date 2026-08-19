import type { SequencePayload } from "./sequence-draft";

/** Validación previa al envío, en la línea de `validate-route-draft.ts`.
 *  Devuelve códigos (el consumidor los traduce).
 *
 *  Con la interfaz de la fase 2a estos errores NO deberían poder producirse: el
 *  número lo deriva la posición y la zona determina el placement. Se validan
 *  igual porque son la última red antes del 23514 crudo de la BD, y porque un
 *  bug del cliente no debe llegar a Postgres — es exactamente el papel que
 *  cumple el mismo espejo (histórico: lo comprobaba `member-actions.ts`,
 *  borrado en la Task 9 junto con el formulario por fila). */
export function validateSequenceDraft(
  payload: SequencePayload,
  ctx: { childIds: Set<string>; anchorKeys: Set<string>; windowOwners: Map<string, string> },
): { errors: string[]; unclassified: number } {
  const errors = new Set<string>();
  let unclassified = 0;
  const anchorKeys = ctx.anchorKeys;

  const positions: number[] = [];
  const seen = new Set<string>();

  for (const e of payload.entries) {
    const key = `${e.item_type}:${e.item_id}`;
    if (seen.has(key)) errors.add("duplicate");
    seen.add(key);
    if ((e.placement === "fijo") !== (e.position !== null)) errors.add("placement");
    if (e.placement === null) unclassified++;
    if (e.position !== null) positions.push(e.position);
  }

  for (const b of payload.blocks) {
    if (seen.has(`saga:${b.child_saga_id}`)) errors.add("duplicate");
    seen.add(`saga:${b.child_saga_id}`);
    if (!ctx.childIds.has(b.child_saga_id)) errors.add("foreignBlock");
    if ((b.placement_in_parent === "fijo") !== (b.position_in_parent !== null)) errors.add("placement");
    if (b.placement_in_parent === null) unclassified++;
    if (b.position_in_parent !== null) positions.push(b.position_in_parent);
  }

  // Un sujeto `anclado` SIN ventana no tiene sentido: su posición ES la ventana.
  // La ventana viaja aparte en `payload.windows`, así que se cruza por clave de
  // sujeto (mismo formato `i:<tipo>:<id>` / `s:<uuid>`).
  const subjectsConVentana = new Set<string>();
  for (const w of payload.windows) {
    const sk = w.item_id !== null && w.item_type !== null
      ? `i:${w.item_type}:${w.item_id}`
      : w.child_saga_id !== null ? `s:${w.child_saga_id}` : null;
    if (sk !== null) subjectsConVentana.add(sk);
  }
  for (const e of payload.entries) {
    if (e.placement === "anclado" && !subjectsConVentana.has(`i:${e.item_type}:${e.item_id}`)) {
      errors.add("anchoredNoWindow");
    }
  }
  for (const b of payload.blocks) {
    if (b.placement_in_parent === "anclado" && !subjectsConVentana.has(`s:${b.child_saga_id}`)) {
      errors.add("anchoredNoWindow");
    }
  }

  // Ventanas (fase 2b): forma calcada de `saga_placement_windows`. La clave
  // usa el mismo formato que `DraftEntry.key` (`i:<tipo>:<id>` / `s:<uuid>`)
  // para que `ctx.anchorKeys`, que el llamante rellena con las claves del
  // subárbol, se pueda comparar directamente.
  const key = (itemType: string | null, itemId: string | null, childSagaId: string | null): string | null =>
    itemId !== null && itemType !== null ? `i:${itemType}:${itemId}`
      : childSagaId !== null ? `s:${childSagaId}`
      : null;

  for (const w of payload.windows) {
    const subjectKey = key(w.item_type, w.item_id, w.child_saga_id);
    // `windowOwners` responde a las DOS preguntas de una vez: si el sujeto puede
    // tener ventana (está `libre`) y bajo qué saga vive su fila. En servidor se
    // resuelve contra BD (`loadWindowOwners`); en cliente, del borrador vivo
    // (`draftWindowOwners`), para que una entrada recién movida a «Cuando
    // quieras» no se acuse de ajena sin recargar — el `foreignBlock` falso de
    // la fase 2a.
    const owner = subjectKey === null ? undefined : ctx.windowOwners.get(subjectKey);
    if (owner === undefined) errors.add("windowNotFree");
    else if (owner !== w.saga_id) errors.add("windowWrongOwner");

    const afterKey = key(w.after_item_type, w.after_item_id, w.after_child_saga_id);
    const beforeKey = key(w.before_item_type, w.before_item_id, w.before_child_saga_id);
    if (afterKey === null && beforeKey === null) errors.add("windowNoAnchor");

    if (afterKey !== null) {
      if (afterKey === subjectKey) errors.add("windowSelfAnchor");
      if (!anchorKeys.has(afterKey)) errors.add("windowForeignAnchor");
    }
    if (beforeKey !== null) {
      if (beforeKey === subjectKey) errors.add("windowSelfAnchor");
      if (!anchorKeys.has(beforeKey)) errors.add("windowForeignAnchor");
    }
  }

  // Tándems (fase 2): los metadatos hablan de un hueco COMPARTIDO, así que un
  // número con una sola entrada no puede llevarlos. Guardarlos ahí dejaría una
  // fila que reaparecería sobre OTRAS obras en cuanto alguien emparejara en ese
  // hueco. El tope de la nota es el mismo que el CHECK `saga_tandems_nota_len`:
  // esto es la red antes del 23514 crudo, no una segunda regla.
  const occupants = new Map<number, number>();
  for (const p of positions) occupants.set(p, (occupants.get(p) ?? 0) + 1);
  for (const t of payload.tandems) {
    if ((occupants.get(t.position) ?? 0) < 2) errors.add("tandemNotShared");
    if ((t.nota?.length ?? 0) > 200) errors.add("tandemNoteTooLong");
  }

  // Consecutivas desde 1 ADMITIENDO EMPATES: se comparan los huecos DISTINTOS,
  // así que 1,2,3,3,4 es válido y 1,3 no. Comprobar la lista con duplicados
  // contra su índice rechazaría el tándem, que es justo el dato que la fase
  // viene a permitir.
  const distinct = [...new Set(positions)].sort((a, b) => a - b);
  if (distinct.some((p, i) => p !== i + 1)) errors.add("positions");

  return { errors: [...errors], unclassified };
}
