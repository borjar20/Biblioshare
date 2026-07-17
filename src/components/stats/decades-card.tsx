import { getTranslations } from "next-intl/server";
import type { CatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";

// Décadas de publicación (frame J): label + recuento y barra proporcional, en
// color de acento. El wrapper card lo pone la página.
export async function DecadesCard({ decades }: { decades: CatalogBreakdown["decades"] }) {
  const t = await getTranslations("stats");

  if (decades.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("decadesTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("decadesEmpty")}</p>
      </div>
    );
  }

  const top = decades.slice(0, 5);
  const max = Math.max(...top.map((d) => d.count));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("decadesTitle")}
      </h3>
      <div className="flex flex-col gap-2.5">
        {top.map((d) => (
          <div key={d.decade} className="flex items-center justify-between gap-3">
            <span className="text-xs text-foreground">
              {`${d.decade}s`} <b className="font-semibold">{d.count}</b>
            </span>
            <div className="h-1.5 w-[150px] max-w-[45%] shrink-0 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
