import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";
import type { TimelineBranch } from "@/lib/sagas/derive-timeline";
import { RequisiteBadge } from "../requisite-badge";
import { RoleChip } from "../role-chip";
import { RoleRibbon } from "./role-ribbon";
import { SkipOptionalButton } from "./skip-optional-button";
import type { TimelineLabels } from "./timeline-labels";

// Rama punteada: fuera de la columna principal, nunca bloquea al siguiente
// título. Issue #167: "requisito" se mantiene porque es un dato REAL y curado
// (la arista dice "léelo antes"). "Spin-off · opcional" se derogó: se pintaba
// para cualquier arista no-requisito, incluidas las `principal`, así que
// llamaba spin-off a lo que no lo era. Ahora, o hay rol curado, o no se dice
// nada.
//
// Ojo con el vocabulario: estar en una rama NO es ser opcional. La rama es una
// POSICIÓN en el layout (nodo sin hueco); `optional` es una afirmación curada
// sobre la obra (`saga_items.optional`), y las dos son ortogonales — hay
// opcionales con hueco fijo, y ramas que no son opcionales. Solo la segunda
// merece chapa y botón.
export function TimelineBranchRow({
  branch,
  accent,
  labels,
  sagaId,
}: {
  branch: TimelineBranch;
  accent: SagaAccentToken;
  labels: TimelineLabels;
  /** Ficha que hay que revalidar al saltar; null sin sesión (no se pinta control). */
  sagaId: string | null;
}) {
  const skipped = branch.node.skipped;
  return (
    <div className="relative ml-10 py-1.5 pl-6">
      <span
        className={`absolute -top-2 left-0 h-10 w-4 rounded-bl-lg border-b-[2.5px] border-l-[2.5px] border-dashed ${SAGA_ACCENT[accent].border}`}
      />
      {/* El botón es HERMANO del enlace, no hijo: un <form> dentro de un <a> es
          HTML inválido y el navegador reordena el DOM. */}
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-surface px-3 py-2 ${
          skipped ? "opacity-50" : ""
        }`}
      >
        <Link href={branch.node.href} className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded">
            {branch.node.coverUrl && (
              <Image src={branch.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />
            )}
            <RoleRibbon role={branch.node.role} labels={labels} />
          </span>
          <span className="min-w-0">
            {/* Esto era un if/else que pintaba el chip de rol SOLO si la obra no
                era requisito ni opcional — justo al revés del caso más común:
                un spin-off casi siempre es opcional (lo dice el propio mockup),
                así que un spin-off opcional no decía en ninguna parte que fuera
                un spin-off. Ahora la chapa de posición/estado y el rol conviven:
                dicen cosas distintas. */}
            <span className="flex flex-wrap items-center gap-1">
              {branch.edgeType === "requisito" && <RequisiteBadge label={labels.branchRequisite} />}
              {branch.node.optional && (
                <span
                  data-testid="optional-tag"
                  className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold"
                >
                  {skipped ? labels.skippedTag : labels.optionalTag}
                </span>
              )}
              <RoleChip role={branch.node.role} />
            </span>
            <span
              className={`mt-1 block truncate text-[13px] font-semibold ${
                skipped ? "line-through decoration-muted-foreground" : ""
              }`}
            >
              {branch.node.label}
            </span>
          </span>
        </Link>
        {branch.node.optional && <SkipOptionalButton sagaId={sagaId} node={branch.node} labels={labels} />}
      </div>
    </div>
  );
}
