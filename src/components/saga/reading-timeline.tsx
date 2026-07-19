import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineSection } from "@/lib/sagas/derive-timeline";

// Timeline vertical ramificado (frame B): raíl coloreado por subsaga, tarjetas
// por nodo de la columna, ramas punteadas para opcionales y tarjeta-puente
// para los nexos.
export async function ReadingTimeline({ sections }: { sections: TimelineSection[] }) {
  const t = await getTranslations("saga");
  return (
    <div>
      {sections.map((section, si) =>
        section.rows[0]?.kind === "bridge" ? (
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
              <span className="block text-[11px] leading-snug text-muted-foreground">{t("bridgeHint")}</span>
            </span>
          </div>
        ) : (
          <section key={section.groupSagaId ?? `s-${si}`}>
            {section.groupName && (
              <div className="mb-1 mt-3.5 flex items-center gap-2">
                <span className={`h-4 w-1 rounded-full ${SAGA_ACCENT[section.accent].tick}`} />
                <h3 className="font-serif text-base font-semibold">{section.groupName}</h3>
              </div>
            )}
            <div>
              {section.rows.map((row) =>
                row.kind !== "entry" ? null : (
                  <div key={row.node.id}>
                    <div className="relative flex gap-3 py-2">
                      <div className="relative flex w-6 shrink-0 justify-center">
                        <span className={`absolute -bottom-2 -top-2 w-[2.5px] ${SAGA_ACCENT[section.accent].bg}`} />
                        <span
                          className={`z-10 mt-6 h-[15px] w-[15px] rounded-full ring-4 ring-background ${
                            row.node.status === "in_progress"
                              ? "border-4 border-accent bg-surface"
                              : row.node.status === "completed"
                                ? SAGA_ACCENT[section.accent].bg
                                : `border-[2.5px] border-dashed bg-surface ${SAGA_ACCENT[section.accent].border}`
                          }`}
                        />
                      </div>
                      <Link
                        href={row.node.href}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-surface px-3 py-2 ${
                          row.node.status === "in_progress" ? "border-accent/50 shadow-md" : "border-border"
                        } ${row.node.status === null ? "opacity-60" : ""}`}
                      >
                        <span className="relative h-[66px] w-[44px] shrink-0 overflow-hidden rounded shadow">
                          {row.node.coverUrl && (
                            <Image src={row.node.coverUrl} alt="" fill sizes="44px" className="object-cover" />
                          )}
                          {row.node.status === "completed" && (
                            <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white">✓</span>
                          )}
                          {row.node.status === "in_progress" && (
                            <span className="absolute inset-0 grid place-items-center bg-foreground/40 text-sm text-white">◉</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          {row.node.orderNo !== null && (
                            <span className="block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                              {t("orderNo", { n: row.node.orderNo })}
                            </span>
                          )}
                          <span className="block truncate font-serif text-[14.5px] font-semibold leading-tight">
                            {row.node.label}
                          </span>
                        </span>
                        <span className="text-base text-muted-foreground">›</span>
                      </Link>
                    </div>
                    {row.branches.map((b) => (
                      <div key={b.node.id} className="relative ml-10 py-1.5 pl-6">
                        <span className={`absolute -top-2 left-0 h-10 w-4 rounded-bl-lg border-b-[2.5px] border-l-[2.5px] border-dashed ${SAGA_ACCENT[section.accent].border}`} />
                        <Link
                          href={b.node.href}
                          className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-surface px-3 py-2"
                        >
                          <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded">
                            {b.node.coverUrl && (
                              <Image src={b.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
                              {b.edgeType === "requisito" ? t("branchRequisite") : t("branchOptional")}
                            </span>
                            <span className="mt-1 block truncate text-[13px] font-semibold">{b.node.label}</span>
                          </span>
                        </Link>
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
