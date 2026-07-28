import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "../role-chip";
import { RoleRibbon } from "./role-ribbon";
import type { TimelineLabels } from "./timeline-labels";
import { WindowTrackBar } from "./window-track-bar";

type WindowRow = Extract<TimelineRow, { kind: "window" }>;

// Estado 02 del mockup: lectura libre dentro de un tramo. Sin número: no tiene
// puesto, y eso es justo lo que la hace ventana.
//
// Desde la fase 3 la fila dice las tres cosas del frame B: entre qué y qué
// (anclas, resueltas por `deriveSagaMap` desde la fase 1), dónde estás
// (`row.track`) y POR QUÉ existe el tramo (`row.reason`).
//
// Los tres son opcionales, y ninguno por el mismo motivo:
//  · `track` es null si no hay columna sobre la que situar nada, o si la
//    ventana está al revés (`from > to`).
//  · `track.notice` es null SIN SESIÓN — la ficha es pública y el tramo se
//    pinta igual; lo que desaparece es el marcador y el aviso.
//  · `reason` es null si el curador no lo declaró, que es el estado de las 4
//    ventanas que ya existían al llegar esta fase (no hubo backfill).
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
            <RoleRibbon role={row.node.role} labels={labels} />
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
        {row.track && (
          <WindowTrackBar
            track={row.track}
            ariaLabel={labels.windowTrackAria(row.node.label)}
            startLabel={labels.windowTrackStart}
            endLabel={labels.windowTrackEnd}
          />
        )}
        {row.track?.notice && (
          <p data-testid="window-notice" className="mt-1.5 text-[11px] font-semibold">
            {labels.windowNotice(row.track.notice)}
          </p>
        )}
        {row.reason && (
          <p data-testid="window-reason-note" className="mt-1 text-[11px] text-muted-foreground">
            {labels.windowReason(row.reason)}
          </p>
        )}
      </div>
    </div>
  );
}
