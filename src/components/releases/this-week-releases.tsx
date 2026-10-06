import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getPublicReleases } from "@/lib/releases/queries";
import { addDays, madridDay } from "@/lib/releases/precision";
import { RouteMessages } from "@/components/route-messages";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon } from "@/components/ui/icons";
import { ReleaseRetry } from "./release-retry";
import { ReleaseWorkCard } from "./release-work-card";

/** The block is public, including on the anonymous Home landing. */
export async function ThisWeekReleases() {
  await connection();
  const t = await getTranslations("releases");
  const today = madridDay(new Date());
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDays(today, dayOfWeek === 0 ? 0 : 7 - dayOfWeek);
  const result = await Promise.allSettled([getPublicReleases({ market: "ES", language: "es", from: today, to: sunday, includeUndated: false, limit: 3 })]);
  return <RouteMessages ns={["releases"]}>
    <section aria-labelledby="novedades-semana" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="novedades-semana" className="font-serif text-xl font-semibold">{t("weekTitle")}</h2>
        <Link href="/novedades" className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline hover:text-foreground">{t("weekLink")}</Link>
      </div>
      {result[0].status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
        : result[0].value.length === 0 ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("weekEmpty")} />
          : <div className="flex min-w-0 flex-col gap-3">{result[0].value.map((work) => <ReleaseWorkCard key={work.workKey} releases={work.releases} compact />)}</div>}
    </section>
  </RouteMessages>;
}
