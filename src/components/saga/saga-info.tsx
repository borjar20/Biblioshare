import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { MemberGroup } from "@/lib/sagas/group-members";

// Pestaña Info (frames A/D): sinopsis + títulos agrupados por subsaga. La
// celda replica el icell del mockup: portada, badge de orden, estado ✓/◉,
// contorno punteado si es opcional (= sin position en fase 1, spec §2.3).
// Vocabulario de portada calcado de CoverCard (rounded-cover + shadow-cover +
// border-border + bg-surface-muted de reserva).
export async function SagaInfo({
  overview,
  groups,
  hasGraph,
  canConfigure,
  sagaId,
}: {
  overview: string | null;
  groups: MemberGroup[];
  hasGraph: boolean;
  canConfigure?: boolean;
  sagaId: string;
}) {
  const t = await getTranslations("saga");
  return (
    <div className="flex flex-col gap-5 px-4 pb-10">
      <section>
        <h2 className="mb-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {t("synopsis")}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-foreground sm:columns-2 sm:gap-11">
          {overview ?? t("noSynopsis")}
        </p>
      </section>

      {/* Infonote (spec §2.3): avisa de que hay un orden de lectura configurado
          antes de que el usuario llegue a la grid de portadas — el enlace real
          a la pestaña vive en SagaTabs, esto solo anuncia que existe. */}
      {hasGraph && (
        <aside className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-3">
          <span className="text-[15px] text-gold">◆</span>
          <p className="text-xs leading-relaxed text-foreground">
            <b>{t("graphAvailableTitle")}</b> {t("graphAvailableBody")}
          </p>
        </aside>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("itemsTitle")}
          </h2>
          {canConfigure && !hasGraph && (
            <Link
              href={`/saga/${sagaId}/mapa/editar`}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
            >
              ✎ {t("configureGraph")}
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-5">
          {/* group-members.ts: sagaId null = "Nexo" si hay hijas, único grupo
              si no. Con un único grupo directo (saga hoja, sin subsagas) la
              cabecera "Nexo" no tiene sentido — la sección ya dice "Títulos
              que la componen", así que aquí se omite (sin tick/nombre/contador)
              y se pinta la grid pelada. Con 2+ grupos, o un único grupo que SÍ
              es de subsaga, la cabecera se mantiene como siempre. */}
          {groups.map((group) => {
            const isSoleDirectGroup = groups.length === 1 && group.sagaId === null;
            return (
              <div key={group.sagaId ?? "nexus"}>
                {!isSoleDirectGroup && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`h-[15px] w-1 rounded-full ${SAGA_ACCENT[group.accent].tick}`} />
                    <h3 className="font-serif text-[15px] font-semibold">
                      {group.name ?? t("nexusGroup")}
                    </h3>
                    <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">
                      {group.members.length}
                    </span>
                  </div>
                )}
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                  {group.members.map((m) => (
                    <li key={`${m.itemType}-${m.itemId}`}>
                      <Link href={m.href} className="block">
                        <div
                          className={`relative aspect-[2/3] overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover ${
                            m.position === null ? "outline-dashed outline-1 -outline-offset-1 outline-gold" : ""
                          }`}
                        >
                          {m.coverUrl ? (
                            <Image src={m.coverUrl} alt={m.title} fill sizes="120px" className="object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center px-1.5 text-center text-[10px] text-muted-foreground">
                              {m.title}
                            </div>
                          )}
                          {m.position !== null && (
                            <span className="absolute left-1 top-1 rounded bg-foreground/70 px-1 font-mono text-[8.5px] text-background">
                              {m.position}
                            </span>
                          )}
                          {m.status === "completed" && (
                            <span
                              aria-label={t("statusDone")}
                              className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white"
                            >
                              ✓
                            </span>
                          )}
                          {m.status === "in_progress" && (
                            <span
                              aria-label={t("statusReading")}
                              className="absolute inset-0 grid place-items-center bg-foreground/40 text-base text-white"
                            >
                              ◉
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight">
                          {m.title}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
