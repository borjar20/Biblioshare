"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { isReleaseMonth } from "@/lib/releases/calendar";

export function ReleaseFilterControls({ selection, type, market, fallbackMonth }: { selection: "explore" | "personal"; type: string; market: string; fallbackMonth?: string }) {
  const t = useTranslations("releases");
  const search = useSearchParams();
  const calendarSearch = new URLSearchParams(search.toString());
  // Closing a focused announcement must retain its implicitly selected month.
  if (fallbackMonth && isReleaseMonth(fallbackMonth) && !isReleaseMonth(calendarSearch.get("mes") ?? "")) calendarSearch.set("mes", fallbackMonth);
  function href(nextSelection: "explore" | "personal", nextType: string, nextMarket: string) {
    const params = new URLSearchParams(calendarSearch.toString());
    // Changing a catalog filter closes the explicit detail as before; it keeps calendar navigation.
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
    <p className="-mt-3 text-sm text-muted-foreground">{selection === "personal" ? t("personalHint") : t("scope")}</p>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <nav aria-label={t("filters")} className="flex min-w-0 flex-wrap gap-2">
        {(["all", "book", "movie", "series"] as const).map((value) => <Link key={value} href={href(selection, value, market)} aria-current={type === value ? "page" : undefined}
          className={"inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors " + (type === value ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-surface-muted hover:text-foreground")}>
          {t("types." + value)}
        </Link>)}
      </nav>
      <form key={selection + ":" + type + ":" + market} action="/novedades" aria-label={t("filters")} className="flex flex-wrap items-end gap-2">
        {selection === "personal" && <input type="hidden" name="seleccion" value="personal" />}
        <input type="hidden" name="tipo" value={type} />
        {(["mes", "dia", "vista"] as const).map((key) => calendarSearch.get(key) ? <input key={key} type="hidden" name={key} value={calendarSearch.get(key)!} /> : null)}
        <div className="flex flex-col gap-1 text-xs font-medium">
          <label htmlFor="novedades-mercado">{t("market")}</label>
          <Select id="novedades-mercado" name="mercado" defaultValue={market} className="min-h-11">
            {(["ES", "INT", "all"] as const).map((value) => <option key={value} value={value}>{t("markets." + value)}</option>)}
          </Select>
        </div>
        <Button type="submit" variant="secondary" className="min-h-11">{t("apply")}</Button>
      </form>
    </div>
  </>;
}
