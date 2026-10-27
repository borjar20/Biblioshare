import { sagaHref } from "@/lib/catalog/item-href";
import type { SagaAccentToken } from "./accents";
import { isMemberCompleted } from "./completion";
import type { MemberGroup } from "./group-members";

// «Subsagas» de la ficha (plan fase 2, decisión 3): una puerta por hija
// directa con miembros. No depende del itinerario; el progreso usa el mismo
// criterio que la pila de la balda (no opcionales, `isMemberCompleted`).

export type SubsagaDoor = {
  sagaId: string;
  /** null solo si la hija llega sin nombre; el componente pone una etiqueta. */
  name: string | null;
  accent: SagaAccentToken;
  href: string;
  /** hasta 3 portadas no nulas */
  covers: string[];
  /** todos los miembros, opcionales incluidos */
  total: number;
  /** miembros no opcionales */
  counted: number;
  /** de esos, los terminados */
  completed: number;
  state: "done" | "started" | "todo";
};

export function deriveSubsagaDoors(groups: MemberGroup[]): SubsagaDoor[] {
  const doors: SubsagaDoor[] = [];
  for (const g of groups) {
    if (g.sagaId === null || g.members.length === 0) continue;
    const counted = g.members.filter((m) => !m.optional);
    const completed = counted.filter((m) => isMemberCompleted(m)).length;
    const inProgress = g.members.some((m) => m.status === "in_progress");
    const state: SubsagaDoor["state"] =
      counted.length > 0 && completed === counted.length
        ? "done"
        : completed > 0 || inProgress
          ? "started"
          : "todo";
    doors.push({
      sagaId: g.sagaId,
      name: g.name,
      accent: g.accent,
      href: sagaHref(g.sagaId),
      covers: g.members.flatMap((m) => (m.coverUrl ? [m.coverUrl] : [])).slice(0, 3),
      total: g.members.length,
      counted: counted.length,
      completed,
      state,
    });
  }
  return doors;
}
