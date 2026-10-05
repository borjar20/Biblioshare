"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Mini-lista del patrón C: filas compactas «etiqueta mono · texto · valor».
// La usan los episodios del día (y, en las PRs 2-3, avances y miembros).
// Muestra `max` filas y, si sobran, «+N más».
export type FeedMiniListRow = { key: string; label: string; text: ReactNode; value: ReactNode };

export function FeedMiniList({ rows, max = 3 }: { rows: FeedMiniListRow[]; max?: number }) {
  const t = useTranslations("feed");
  const hidden = rows.length - max;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {rows.slice(0, max).map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-11 shrink-0 font-mono text-[10.5px] text-muted-foreground">{r.label}</span>
          <span className="min-w-0 flex-1 truncate">{r.text}</span>
          {r.value != null && <span className="shrink-0">{r.value}</span>}
        </li>
      ))}
      {hidden > 0 && <li className="text-[11.5px] text-muted-foreground">{t("card.moreItems", { count: hidden })}</li>}
    </ul>
  );
}
