import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { TimelineBranchRow } from "./timeline-branch";
import type { TimelineLabels } from "./timeline-labels";

type TandemRow = Extract<TimelineRow, { kind: "tandem" }>;

// Estado 01 del mockup: N obras que comparten hueco. Un solo número, porque
// comparten puesto — es exactamente lo que las hace tándem.
//
// `row.mode` y `row.note` los cura el editor de secuencia desde la fase 2
// (`saga_tandems`). Siguen pudiendo ser null —«sin declarar» es una opción de
// verdad— y entonces la fila no dice nada sobre el orden: afirmar «se leen a la
// vez» sin que nadie lo haya declarado es justo lo que esta fase vino a quitar.
export function TimelineTandemRow({
  row,
  labels,
  showGroupLabel,
}: {
  row: TandemRow;
  labels: TimelineLabels;
  showGroupLabel: boolean;
}) {
  const accent = row.nodes[0]?.accent ?? "beige";
  return (
    <div>
      <div className="relative flex gap-3 py-2">
        <div className="relative flex w-6 shrink-0 justify-center">
          <span className={`absolute -bottom-2 -top-2 w-[2.5px] ${SAGA_ACCENT[accent].bg}`} />
          {/* Corchete: el raíl se abre para abrazar las N obras del hueco. */}
          <span
            className={`absolute bottom-3 left-1/2 top-3 w-2 rounded-l-md border-b-[2.5px] border-l-[2.5px] border-t-[2.5px] ${SAGA_ACCENT[accent].border}`}
          />
        </div>
        <div
          data-testid="timeline-tandem"
          className={`min-w-0 flex-1 rounded-xl border border-dashed bg-surface px-3 py-2.5 ${SAGA_ACCENT[accent].border}`}
        >
          <div className="flex items-baseline gap-2">
            {row.no !== null && (
              <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {labels.orderNo(row.no)}
              </span>
            )}
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {labels.tandemTitle}
              {row.mode !== null &&
                ` · ${row.mode === "simultaneo" ? labels.tandemModeSimultaneo : labels.tandemModeIndistinto}`}
              {` · ${labels.tandemCount(row.nodes.length)}`}
            </span>
          </div>
          {row.note && <p className="mt-1 text-[11px] italic text-muted-foreground">{row.note}</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {row.nodes.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="flex items-center gap-3">
                  <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded shadow">
                    {n.coverUrl && <Image src={n.coverUrl} alt="" fill sizes="38px" className="object-cover" />}
                    {n.status === "completed" && (
                      <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[13.5px] font-semibold leading-tight">
                      {n.label}
                    </span>
                    {showGroupLabel && n.groupName && (
                      <span className="block truncate font-mono text-[9px] text-muted-foreground">{n.groupName}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {row.branches.map((b) => (
        <TimelineBranchRow key={b.node.id} branch={b} accent={accent} labels={labels} />
      ))}
    </div>
  );
}
