import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { SubsagaDoor } from "@/lib/sagas/subsaga-doors";

// «Subsagas» (plan fase 2, decisión 3): una puerta por hija directa. Sin sesión
// `completed` es siempre 0, así que se enseña el recuento en vez de «0 de N».
export async function SubsagaDoors({ doors, authenticated }: { doors: SubsagaDoor[]; authenticated: boolean }) {
  if (doors.length === 0) return null;
  const t = await getTranslations("saga");

  return (
    <section data-testid="subsaga-doors">
      <h2 className="mb-3 font-serif text-lg font-semibold">{t("doorsTitle")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {doors.map((d) => {
          const accent = SAGA_ACCENT[d.accent];
          const hasProgress = authenticated && d.counted > 0;
          const pct = d.counted > 0 ? Math.round((d.completed / d.counted) * 100) : 0;
          const covers: Array<string | null> = d.covers.length > 0 ? d.covers : [null];
          return (
            <Link
              key={d.sagaId}
              href={d.href}
              className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-3 transition-colors hover:bg-surface-muted"
            >
              <span aria-hidden className={`-mx-3 -mt-3 mb-1 block h-[3px] rounded-t-[14px] ${accent.bg}`} />
              <span className="relative block h-[62px]">
                {covers.map((src, i) => (
                  <span
                    key={i}
                    style={{ left: i * 14, bottom: i * 3 }}
                    className={`absolute block h-[54px] w-[36px] overflow-hidden rounded-[3px] shadow-cover ${src ? "" : accent.bg}`}
                  >
                    {src && <Image src={src} alt="" fill sizes="36px" className="object-cover" />}
                  </span>
                ))}
              </span>
              <span className="font-serif text-sm leading-tight font-semibold">{d.name ?? t("doorUnnamed")}</span>
              <span
                data-testid="door-progress"
                className={`font-mono text-[10px] ${d.state === "done" ? "text-green" : "text-muted-foreground"}`}>
                {!hasProgress
                  ? t("doorCount", { count: d.counted === 0 ? d.total : d.counted })
                  : d.state === "done"
                    ? (
                      <>
                        {t("doorDone")} <span aria-hidden>✓</span>
                      </>
                    )
                    : t("doorProgress", { completed: d.completed, counted: d.counted })}
                {hasProgress && d.state !== "done" && <span className="sr-only"> {t("doorWorksNoun")}</span>}
              </span>
              {hasProgress && (
                <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-surface-muted">
                  <span className={`block h-full ${accent.bg}`} style={{ width: `${pct}%` }} />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
