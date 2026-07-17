import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type StatsPeriod, periodParam } from "@/lib/stats/period";

// Selector de período (frame J): año en curso, anterior y "Todo". Son enlaces a
// `?periodo=` — sin estado de cliente, cada pill recarga la página con su año.
export async function PeriodPills({
  current,
  years,
}: {
  current: StatsPeriod;
  years: number[];
}) {
  const t = await getTranslations("stats");
  const options: { value: StatsPeriod; label: string }[] = [
    ...years.map((y) => ({ value: y as StatsPeriod, label: String(y) })),
    { value: "all", label: t("periodAll") },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={String(o.value)}
            href={`/estadisticas?periodo=${periodParam(o.value)}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
