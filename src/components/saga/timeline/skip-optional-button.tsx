import { parseItemKey } from "@/lib/sagas/derive-map";
import type { SagaGraphNode } from "@/lib/sagas/map-types";
import { skipOptional, unskipOptional } from "@/lib/sagas/optional-actions";
import type { TimelineLabels } from "./timeline-labels";

// Píldora «Saltar» / «Deshacer» del mockup (`.skip`). Server Component con un
// <form>, como AdoptRouteButton: sin JS de cliente.
//
// `sagaId === null` = sin sesión. La ficha es pública y hay que verla ENTERA
// sin sesión (riesgo 5 de la spec): las opcionales se ven igual, lo que
// desaparece es el control — no hay a quién guardarle el salto.
//
// El par (tipo, id) sale de la clave del nodo con `parseItemKey`, la inversa de
// la función que la construyó. `ownerSagaId` no se puede sacar de ahí: viaja en
// el nodo desde `deriveSagaMap`, y es la saga con la que se guarda el salto —
// no la de la ficha.
export function SkipOptionalButton({
  sagaId,
  node,
  labels,
}: {
  sagaId: string | null;
  node: SagaGraphNode;
  labels: TimelineLabels;
}) {
  const item = parseItemKey(node.id);
  if (sagaId === null || item === null) return null;

  const action = node.skipped
    ? unskipOptional.bind(null, sagaId, node.ownerSagaId, item.itemType, item.itemId)
    : skipOptional.bind(null, sagaId, node.ownerSagaId, item.itemType, item.itemId);

  return (
    <form action={action} className="shrink-0">
      <button
        type="submit"
        data-testid={node.skipped ? "unskip-optional" : "skip-optional"}
        aria-label={node.skipped ? labels.unskipAria(node.label) : labels.skipAria(node.label)}
        className="tap-44 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground"
      >
        {node.skipped ? labels.unskip : labels.skip}
      </button>
    </form>
  );
}
