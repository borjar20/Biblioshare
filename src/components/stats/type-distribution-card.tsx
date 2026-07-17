import { getTranslations } from "next-intl/server";
import type { TypeDistribution } from "@/lib/stats/get-type-distribution";

// Distribución por tipo (frame J): tres donuts, cada anillo relleno según su
// cuota sobre el total, con el color del tipo. El wrapper card lo pone la página.
export async function TypeDistributionCard({ dist }: { dist: TypeDistribution }) {
  const t = await getTranslations("stats");

  if (dist.total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("typeTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("typeEmpty")}</p>
      </div>
    );
  }

  const items = [
    { label: t("typeBooks"), color: "var(--type-book)", count: dist.book },
    { label: t("typeMovies"), color: "var(--type-movie)", count: dist.movie },
    { label: t("typeSeries"), color: "var(--type-series)", count: dist.series },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("typeTitle")}
      </h3>
      <div className="flex justify-around gap-2">
        {items.map((item) => {
          const pct = Math.round((item.count / dist.total) * 100);
          return (
            <div key={item.label} className="flex flex-col items-center gap-1.5">
              <div
                className="grid h-16 w-16 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(${item.color} 0 ${pct}%, var(--surface-3) ${pct}% 100%)`,
                }}
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-sm font-semibold text-foreground">
                  {item.count}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
