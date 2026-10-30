"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ProfileYear } from "@/lib/profile/year";

const MONTHS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const monthName = (i: number) =>
  new Intl.DateTimeFormat("es", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15)));

// Su año (spec §2 y §3.1 punto 5): un resumen, no un panel. No enlaza a
// Estadísticas (las herramientas del dueño viven en Biblioteca).
export function YearView({ data, isOwner }: { data: ProfileYear | null; isOwner: boolean }) {
  const t = useTranslations("profile.visual.year");
  if (!data) return null;
  const max = Math.max(...data.byMonth, 1);
  return (
    <section data-testid="profile-year" className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-semibold">
          {isOwner ? t("titleOwn", { year: data.year }) : t("title", { year: data.year })}
        </h2>
        <span className="font-serif text-[22px] font-bold text-gold">
          {data.total} <span className="font-mono text-[11px] font-medium uppercase text-muted-foreground">{t("works", { count: data.total })}</span>
        </span>
      </div>
      <figure aria-label={t("chartLabel", { year: data.year })} className="mt-3 flex h-[70px] items-end gap-1">
        {data.byMonth.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-[3px] ${i === data.bestMonth ? "bg-gold" : v ? "bg-accent/55" : "bg-foreground/[.07]"}`}
              style={{ height: `${(v / max) * 56 + 2}px` }}
              title={`${monthName(i)}: ${v}`}
            />
            <span aria-hidden="true" className="font-mono text-[9px] text-muted-foreground">{MONTHS[i]}</span>
          </div>
        ))}
      </figure>
      {data.bestMonth !== null && (
        <p className="mt-2 text-[12.5px] text-foreground-soft">
          {isOwner
            ? t("bestMonthOwn", { month: monthName(data.bestMonth), count: data.byMonth[data.bestMonth] })
            : t("bestMonth", { month: monthName(data.bestMonth), count: data.byMonth[data.bestMonth] })}
          {data.topRated && (
            <> {t.rich("topRated", {
              name: data.topRated.title,
              title: (chunks) => <Link href={data.topRated!.href} className="font-semibold text-foreground">{chunks}</Link>,
            })}</>
          )}
        </p>
      )}
    </section>
  );
}
