import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "../role-chip";
import { RoleRibbon } from "./role-ribbon";
import { SkipOptionalButton } from "./skip-optional-button";
import { TimelineBranchRow } from "./timeline-branch";
import type { TimelineLabels } from "./timeline-labels";

type EntryRow = Extract<TimelineRow, { kind: "entry" }>;

// Fila de una obra con puesto. El raíl se colorea con el acento del NODO, no
// con el de la sección: en modo `curation` es equivalente por construcción (una
// sección agrupa nodos con el mismo `groupSagaId`), y es lo que permite que en
// modo `route` —sección única sin cabecera— cada fila conserve el color de SU
// subsaga.
//
// `showGroupLabel` lo pone la cáscara cuando la sección NO lleva cabecera: la
// subsaga baja de cabecera de sección a etiqueta de fila (spec §1 — repetir
// «Magos» dos veces porque el itinerario parte el hilo rompe más de lo que
// explica).
//
// Desde la fase 4, una obra opcional puede estar AQUÍ y no solo como rama: en
// producción hay dos con hueco fijo (Saga de los Huesos Verdes, huecos 1 y 2).
// Por eso la tarjeta deja de ser un `<Link>` a secas — el botón de saltar tiene
// que ser HERMANO del enlace, no hijo: un <form> dentro de un <a> es HTML
// inválido (contenido interactivo anidado) y el navegador reordena el DOM.
export function TimelineEntryRow({
  row,
  labels,
  showGroupLabel,
  sagaId,
}: {
  row: EntryRow;
  labels: TimelineLabels;
  showGroupLabel: boolean;
  /** Ficha que hay que revalidar al saltar; null sin sesión (no se pinta control). */
  sagaId: string | null;
}) {
  const accent = row.node.accent;
  return (
    <div>
      <div className="relative flex gap-3 py-2">
        <div className="relative flex w-6 shrink-0 justify-center">
          <span className={`absolute -bottom-2 -top-2 w-[2.5px] ${SAGA_ACCENT[accent].bg}`} />
          <span
            className={`z-10 mt-6 h-[15px] w-[15px] rounded-full ring-4 ring-background ${
              row.node.status === "in_progress"
                ? "border-4 border-accent bg-surface"
                : row.node.status === "completed"
                  ? SAGA_ACCENT[accent].bg
                  : `border-[2.5px] border-dashed bg-surface ${SAGA_ACCENT[accent].border}`
            }`}
          />
        </div>
        <div
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-surface px-3 py-2 ${
            row.node.status === "in_progress" ? "border-accent/50 shadow-md" : "border-border"
          } ${row.node.status === null ? "opacity-60" : ""} ${row.node.skipped ? "opacity-50" : ""}`}
        >
          <Link href={row.node.href} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="relative h-[66px] w-[44px] shrink-0 overflow-hidden rounded shadow">
              {row.node.coverUrl && (
                <Image src={row.node.coverUrl} alt="" fill sizes="44px" className="object-cover" />
              )}
              {row.node.status === "completed" && (
                // Con cinta de rol el ✓ sube: la cinta ocupa el borde inferior
                // y taparlo a medias es peor que moverlo — el estado de lectura
                // manda sobre la etiqueta.
                <span
                  className={`absolute right-0.5 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white ${
                    row.node.role === null ? "bottom-0.5" : "top-0.5"
                  }`}
                >
                  ✓
                </span>
              )}
              {row.node.status === "in_progress" && (
                <span className="absolute inset-0 grid place-items-center bg-foreground/40 text-sm text-white">◉</span>
              )}
              <RoleRibbon role={row.node.role} labels={labels} />
            </span>
            <span className="min-w-0 flex-1">
              {(row.no !== null || row.node.role !== null) && (
                <span className="flex items-center gap-1.5">
                  {row.no !== null && (
                    <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      {labels.orderNo(row.no)}
                    </span>
                  )}
                  {/* Issue #184: la fila numerada no llevaba chip de rol — se
                      veía en la pestaña Info y en "Como lista lineal", pero no
                      aquí, mismo dato. `RoleChip` ya vuelve null sin rol. */}
                  <RoleChip role={row.node.role} />
                </span>
              )}
              <span
                className={`block truncate font-serif text-[14.5px] font-semibold leading-tight ${
                  row.node.skipped ? "line-through decoration-muted-foreground" : ""
                }`}
              >
                {row.node.label}
              </span>
              {row.node.optional && (
                <span
                  data-testid="optional-tag"
                  className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-muted-foreground"
                >
                  {row.node.skipped ? labels.skippedTag : labels.optionalTag}
                </span>
              )}
              {showGroupLabel && row.node.groupName && (
                <span className="block truncate font-mono text-[9px] text-muted-foreground">{row.node.groupName}</span>
              )}
            </span>
            <span className="text-base text-muted-foreground">›</span>
          </Link>
          {row.node.optional && <SkipOptionalButton sagaId={sagaId} node={row.node} labels={labels} />}
        </div>
      </div>
      {row.branches.map((b) => (
        <TimelineBranchRow key={b.node.id} branch={b} accent={accent} labels={labels} sagaId={sagaId} />
      ))}
    </div>
  );
}
