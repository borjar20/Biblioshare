import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "../role-chip";
import type { TimelineLabels } from "./timeline-labels";

type WindowRow = Extract<TimelineRow, { kind: "window" }>;

// Estado 02 del mockup: lectura libre dentro de un tramo. Sin número: no tiene
// puesto, y eso es justo lo que la hace ventana.
//
// `row.track` es null hasta la fase 3 (el mini-track y sus tres avisos) y
// `row.reason` hasta que exista `saga_placement_windows.motivo`. Las anclas SÍ
// llegan resueltas desde la fase 1: son las que ya resolvió `deriveSagaMap`.
export function TimelineWindowRow({ row, labels }: { row: WindowRow; labels: TimelineLabels }) {
  const accent = row.node.accent;
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative flex w-6 shrink-0 justify-center">
        {/* Banda: el tramo dentro del que la obra es libre. */}
        <span className={`absolute -bottom-2 -top-2 border-l-[2.5px] border-dashed ${SAGA_ACCENT[accent].border}`} />
      </div>
      <div
        data-testid="timeline-window"
        className={`min-w-0 flex-1 rounded-xl border border-dashed bg-surface px-3 py-2.5 ${SAGA_ACCENT[accent].border}`}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          {labels.windowTitle}
        </span>
        <Link href={row.node.href} className="mt-2 flex items-center gap-3">
          <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded shadow">
            {row.node.coverUrl && <Image src={row.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif text-[13.5px] font-semibold leading-tight">{row.node.label}</span>
            <span className="mt-0.5 block">
              <RoleChip role={row.node.role} />
            </span>
          </span>
        </Link>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {labels.windowFree}
          {row.after && <>: {labels.windowAfter(row.after.label)}</>}
          {row.after && row.before && <>, </>}
          {!row.after && row.before && <>: </>}
          {row.before && labels.windowBefore(row.before.label)}
        </p>
      </div>
    </div>
  );
}
