import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineSection } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "./role-chip";
import { TimelineEntryRow } from "./timeline/timeline-entry-row";
import { buildTimelineLabels } from "./timeline/timeline-labels";
import { TimelineTandemRow } from "./timeline/timeline-tandem-row";
import { TimelineWindowRow } from "./timeline/timeline-window-row";

// Componente ÚNICO de orden de lectura (spec 2026-07-28): las mismas cuatro
// formas de fila en móvil y al pie del grafo de PC. Dos componentes se
// desincronizarían — todo lo que cuesta (el render de los cuatro estados) es
// común.
//
// Ojo con el vocabulario: este comentario decía "opcionales" y "nexos", las dos
// palabras que la issue #167 derogó precisamente porque se derivaban de
// heurísticas que etiquetaban mal (una arista `principal` salía como
// "Spin-off · opcional"; "nexo" se disparaba por `groupSagaId === null`, que
// significa "miembro directo del universo"). Una rama o un puente son
// posiciones en el layout, no afirmaciones sobre qué es la obra: eso solo lo
// dice el rol curado, vía RoleChip.
export async function ReadingTimeline({ sections }: { sections: TimelineSection[] }) {
  const t = await getTranslations("saga");
  const labels = buildTimelineLabels(t);

  return (
    <div data-testid="reading-timeline">
      {sections.map((section, si) => {
        // Sin cabecera de sección (modo `route`: una sola sección sin nombre),
        // la subsaga baja a etiqueta de fila.
        const showGroupLabel = section.groupName === null;
        return section.rows[0]?.kind === "bridge" ? (
          <div
            key={`bridge-${section.rows[0].node.id}`}
            className="my-3.5 flex items-center gap-3 rounded-xl border border-border bg-gradient-to-r from-spine/20 to-surface px-3.5 py-3"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-spine">
              {section.rows[0].node.coverUrl && (
                <Image src={section.rows[0].node.coverUrl} alt="" fill sizes="40px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0">
              <Link href={section.rows[0].node.href} className="block font-serif text-sm font-semibold">
                {section.rows[0].node.label}
              </Link>
              {/* Issue #167: `bridgeHint` ("Nexo entre tramos · léelo en
                  cualquier punto") se derogó. Se disparaba por groupSagaId ===
                  null, que significa "miembro directo del universo, sin
                  subsaga" — no "léelo donde quieras". Ahora solo habla el rol
                  curado, si lo hay. */}
              <span className="mt-0.5 block">
                <RoleChip role={section.rows[0].node.role} />
              </span>
            </span>
          </div>
        ) : (
          <section key={`${section.groupSagaId ?? "direct"}-${si}`}>
            {section.groupName && (
              <div className="mb-1 mt-3.5 flex items-center gap-2">
                <span className={`h-4 w-1 rounded-full ${SAGA_ACCENT[section.accent].tick}`} />
                <h3 className="font-serif text-base font-semibold">{section.groupName}</h3>
              </div>
            )}
            <div>
              {section.rows.map((row) => {
                if (row.kind === "entry") {
                  return (
                    <TimelineEntryRow key={row.node.id} row={row} labels={labels} showGroupLabel={showGroupLabel} />
                  );
                }
                if (row.kind === "tandem") {
                  return (
                    <TimelineTandemRow
                      key={`tandem-${row.nodes.map((n) => n.id).join("|")}`}
                      row={row}
                      labels={labels}
                      showGroupLabel={showGroupLabel}
                    />
                  );
                }
                if (row.kind === "window") {
                  return <TimelineWindowRow key={`window-${row.node.id}`} row={row} labels={labels} />;
                }
                return null;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
