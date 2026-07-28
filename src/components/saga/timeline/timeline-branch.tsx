import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";
import type { TimelineBranch } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "../role-chip";
import type { TimelineLabels } from "./timeline-labels";

// Rama punteada: fuera de la columna principal, nunca bloquea al siguiente
// título. Issue #167: "requisito" se mantiene porque es un dato REAL y curado
// (la arista dice "léelo antes"). "Spin-off · opcional" se derogó: se pintaba
// para cualquier arista no-requisito, incluidas las `principal`, así que
// llamaba spin-off a lo que no lo era. Ahora, o hay rol curado, o no se dice
// nada.
export function TimelineBranchRow({
  branch,
  accent,
  labels,
}: {
  branch: TimelineBranch;
  accent: SagaAccentToken;
  labels: TimelineLabels;
}) {
  return (
    <div className="relative ml-10 py-1.5 pl-6">
      <span
        className={`absolute -top-2 left-0 h-10 w-4 rounded-bl-lg border-b-[2.5px] border-l-[2.5px] border-dashed ${SAGA_ACCENT[accent].border}`}
      />
      <Link
        href={branch.node.href}
        className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-surface px-3 py-2"
      >
        <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded">
          {branch.node.coverUrl && (
            <Image src={branch.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />
          )}
        </span>
        <span className="min-w-0">
          {branch.edgeType === "requisito" ? (
            <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
              {labels.branchRequisite}
            </span>
          ) : (
            <RoleChip role={branch.node.role} />
          )}
          <span className="mt-1 block truncate text-[13px] font-semibold">{branch.node.label}</span>
        </span>
      </Link>
    </div>
  );
}
