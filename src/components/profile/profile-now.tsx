"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { NowItem } from "@/lib/profile/now";
import { CoverTile } from "./cover-tile";

// Leyendo ahora (spec §3.1 punto 4): la más reciente en grande con su avance,
// las otras en pastillas, y la mascota a la derecha. Sin nada que enseñar, nada.
export function NowView({ items, pet }: { items: NowItem[]; pet: ReactNode }) {
  const t = useTranslations("profile.visual.now");
  if (items.length === 0 && !pet) return null;
  const [first, ...rest] = items;
  return (
    <section data-testid="profile-now" className="relative overflow-hidden rounded-card border border-border bg-surface">
      {first?.coverUrl && (
        <div aria-hidden="true" className="absolute -inset-8 opacity-45 blur-2xl" style={{ backgroundImage: `url("${first.coverUrl}")`, backgroundSize: "cover" }} />
      )}
      <div className="relative flex items-center gap-3.5 p-3.5">
        {first && (
          <Link href={first.href} aria-hidden="true" tabIndex={-1} className="w-14 shrink-0"><CoverTile cover={first} sizes="56px" /></Link>
        )}
        <div className="min-w-0 flex-1">
          {first && (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[.09em] text-foreground-soft">{t("title")}</p>
              <Link href={first.href} className="flex min-h-11 items-center font-serif text-[17px] font-semibold">{first.title}</Link>
              {first.progressPercent !== null && (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={first.progressPercent}
                  aria-label={first.title}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10"
                >
                  <div className="h-full rounded-full bg-gold-graphic" style={{ width: `${first.progressPercent}%` }} />
                </div>
              )}
              {first.progressLabel && <p className="mt-1 text-xs text-muted-foreground">{first.progressLabel}</p>}
            </>
          )}
        </div>
        {pet}
      </div>
      {rest.length > 0 && (
        <div className="relative flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[.08em] text-muted-foreground">{t("also")}</span>
          {rest.map((c) => (
            <Link key={c.href} href={c.href} className="flex min-h-11 items-center gap-2 rounded-full bg-foreground/[.06] py-1 pr-3 pl-1 text-[12.5px]">
              <CoverTile cover={c} sizes="22px" className="w-[22px]" decorative initialsClassName="text-[9px]" />
              <span className="truncate">{c.title}{c.progressLabel ? ` · ${c.progressLabel}` : ""}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
