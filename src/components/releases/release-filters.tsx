"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { BookIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";
import { isReleaseMonth } from "@/lib/releases/calendar";
import styles from "./release-calendar.module.css";

const TYPE_ICON = { book: BookIcon, movie: FilmIcon, series: SeriesIcon };

export function ReleaseFilterControls({ selection, type, market, fallbackMonth, children }: {
  selection: "explore" | "personal"; type: string; market: string; fallbackMonth?: string; children?: ReactNode;
}) {
  const t = useTranslations("releases");
  const search = useSearchParams();
  const calendarSearch = new URLSearchParams(search.toString());
  if (fallbackMonth && isReleaseMonth(fallbackMonth) && !isReleaseMonth(calendarSearch.get("mes") ?? "")) calendarSearch.set("mes", fallbackMonth);
  function href(nextSelection: "explore" | "personal", nextType: string, nextMarket: string) {
    const params = new URLSearchParams(calendarSearch.toString());
    // Type/market changes close a focused detail and retain the calendar period.
    params.delete("lanzamiento");
    for (const [key, value, defaultValue] of [["seleccion", nextSelection === "personal" ? "personal" : "", ""], ["tipo", nextType, "all"], ["mercado", nextMarket, "ES"]]) {
      if (value === defaultValue) params.delete(key); else params.set(key, value);
    }
    return "/novedades" + (params.size ? "?" + params.toString() : "");
  }
  return <>
    <nav aria-label={t("navigation")} className="flex gap-6 overflow-x-auto border-b border-border">
      {(["explore", "personal"] as const).map((option) => <Link key={option} href={href(option, type, market)} aria-current={selection === option ? "page" : undefined}
        className={"shrink-0 border-b-2 px-1 py-3 font-mono text-xs uppercase tracking-wider " + (selection === option ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
        {t(option === "explore" ? "browse" : "personal")}
      </Link>)}
    </nav>
    <section aria-label={t("filters")} className={styles.filterPanel}>
      <p className={styles.filterHint}>{selection === "personal" ? t("personalHint") : t("scope")}</p>
      <div className={styles.filterFields}>
        <div className={styles.typeField}>
          <p id="novedades-tipos" className={styles.fieldLabel}>{t("typeGroup")}</p>
          <nav aria-label={t("filters")} className={styles.typeChoices}>
            {(["all", "book", "movie", "series"] as const).map((value) => {
              const Icon = value === "all" ? null : TYPE_ICON[value];
              return <Link key={value} href={href(selection, value, market)} aria-current={type === value ? "page" : undefined} className={styles.typeChoice}>
                {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0" />}<span>{t("types." + value)}</span>
              </Link>;
            })}
          </nav>
        </div>
        <form key={selection + ":" + type + ":" + market} action="/novedades" aria-label={t("filters")} className={styles.marketForm}>
          {selection === "personal" && <input type="hidden" name="seleccion" value="personal" />}
          <input type="hidden" name="tipo" value={type} />
          {(["mes", "dia", "vista"] as const).map((key) => calendarSearch.get(key) ? <input key={key} type="hidden" name={key} value={calendarSearch.get(key)!} /> : null)}
          <div className={styles.marketField}>
            <label htmlFor="novedades-mercado" className={styles.fieldLabel}>{t("market")}</label>
            <Select id="novedades-mercado" name="mercado" defaultValue={market} className="min-h-11 w-full min-w-0">
              {(["ES", "INT", "all"] as const).map((value) => <option key={value} value={value}>{t("markets." + value)}</option>)}
            </Select>
          </div>
          <Button type="submit" variant="secondary" aria-label={t("apply")} className="min-h-11 rounded-lg px-3 text-xs">{t("applyShort")}</Button>
        </form>
      </div>
      {children}
    </section>
  </>;
}
