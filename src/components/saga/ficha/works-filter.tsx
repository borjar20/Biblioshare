"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// Filtro de «Todas las obras» (spec 2026-10-27 §1.8). Esconde por CSS los
// `li[data-type][data-status]` que no encajan: la rejilla la pinta el servidor,
// con su reparto por subsaga, y aquí no se vuelve a calcular nada.
const TYPE_HIDE = {
  all: "",
  book: "[&_li[data-type]:not([data-type=book])]:hidden",
  movie: "[&_li[data-type]:not([data-type=movie])]:hidden",
  series: "[&_li[data-type]:not([data-type=series])]:hidden",
} as const;
const STATUS_HIDE = {
  all: "",
  done: "[&_li[data-status=pending]]:hidden",
  pending: "[&_li[data-status=done]]:hidden",
} as const;

const TYPE_LABEL = { all: "filterAll", book: "filterBooks", movie: "filterMovies", series: "filterSeries" } as const;
const STATUS_LABEL = { all: "filterAll", done: "filterDone", pending: "filterPending" } as const;

export function WorksFilter({ children }: { children: ReactNode }) {
  const t = useTranslations("saga");
  const [type, setType] = useState<keyof typeof TYPE_HIDE>("all");
  const [status, setStatus] = useState<keyof typeof STATUS_HIDE>("all");
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11px] font-semibold ${on ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`;
  return (
    <div className={`${TYPE_HIDE[type]} ${STATUS_HIDE[status]}`.trim()} data-testid="works-filter">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", "book", "movie", "series"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={type === k} className={chip(type === k)} onClick={() => setType(k)}>
            {t(TYPE_LABEL[k])}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {(["all", "done", "pending"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={status === k} className={chip(status === k)} onClick={() => setStatus(k)}>
            {t(STATUS_LABEL[k])}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
