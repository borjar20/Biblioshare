import { getTranslations } from "next-intl/server";
import type { TbrSnapshot } from "@/lib/stats/get-tbr-snapshot";

// La pila (frames B/G): foto del momento — pendientes ahora, desglose por tipo
// y lo más antiguo. Sin gráfico de flujo (ver spec 2026-08-03). El wrapper card
// lo pone la pestaña/página.
export async function TbrCard({ snapshot }: { snapshot: TbrSnapshot }) {
  const t = await getTranslations("stats");

  if (snapshot.pending === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("tbrTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("tbrEmpty")}</p>
      </div>
    );
  }

  const types = [
    { label: t("typeBooks"), color: "var(--type-book)", count: snapshot.byType.book },
    { label: t("typeMovies"), color: "var(--type-movie)", count: snapshot.byType.movie },
    { label: t("typeSeries"), color: "var(--type-series)", count: snapshot.byType.series },
  ].filter((x) => x.count > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("tbrTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("tbrPendingCount", { count: snapshot.pending })}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {types.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
            {x.label}
            <span className="font-medium text-foreground">{x.count}</span>
          </span>
        ))}
      </div>

      {snapshot.oldest && (
        <p className="text-[11px] text-muted-foreground">
          {t("tbrOldest")}:{" "}
          <span className="font-medium text-foreground">{snapshot.oldest.title}</span>{" "}
          {t("tbrWaitingMonths", { count: snapshot.oldest.monthsWaiting })}
        </p>
      )}
    </div>
  );
}
