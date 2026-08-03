"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportCandidate, ImportRow } from "@/lib/import/types";
import { resolveAmbiguousImportRow } from "./actions";
import { UnmatchedRowForm } from "./unmatched-row-form";

/**
 * Fila que casó con MÁS DE UNA obra: el matcher no desempata solo y aquí elige
 * el usuario. Nada se ha escrito todavía cuando se pinta esto.
 *
 * "Ninguna de estas" cae al formulario de sin-match de siempre, que ya sabe qué
 * ofrecer según el rol (alta manual si es colaborador, cola de revisión si no).
 */
export function AmbiguousRowForm({
  itemType,
  row,
  candidates,
  canResolveManually,
}: {
  itemType: ItemType;
  row: ImportRow;
  candidates: ImportCandidate[];
  canResolveManually: boolean;
}) {
  const t = useTranslations("import");
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState<string | null>(null);
  const [fellBack, setFellBack] = useState(false);

  if (fellBack) {
    return (
      <UnmatchedRowForm
        itemType={itemType}
        row={row}
        canResolveManually={canResolveManually}
      />
    );
  }

  if (resolved) {
    return (
      <p className="text-sm text-muted-foreground">
        {row.title} — {resolved}
      </p>
    );
  }

  const choose = (candidate: ImportCandidate) => {
    startTransition(async () => {
      const result = await resolveAmbiguousImportRow(itemType, row, candidate);
      setResolved(
        result.outcome === "imported"
          ? t("unmatchedResolved")
          : result.outcome === "duplicate"
            ? t("ambiguous.alreadyThere")
            : t("ambiguous.failed")
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">
          {row.title}
          {row.year !== null && (
            <span className="text-muted-foreground"> ({row.year})</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{t("ambiguous.hint")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => {
          const alt = altTitles(candidate);
          return (
          <li key={candidate.externalId}>
            <button
              type="button"
              onClick={() => choose(candidate)}
              disabled={pending}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-2 text-left transition hover:border-accent disabled:opacity-50"
            >
              <span className="relative aspect-2/3 w-10 shrink-0 overflow-hidden rounded bg-surface-muted">
                {candidate.coverUrl && (
                  <Image
                    src={candidate.coverUrl}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {candidate.title}
                  {candidate.year !== null && (
                    <span className="text-muted-foreground"> ({candidate.year})</span>
                  )}
                </span>
                {/* Los otros dos títulos (original e inglés) solo si aportan algo:
                    son justo lo que le dice al usuario que "La visita" es la peli
                    que él anotó como "The Visit". */}
                {alt.length > 0 && (
                  <span className="line-clamp-1 font-serif text-[11px] italic text-muted-foreground">
                    {alt.join(" · ")}
                  </span>
                )}
                {/* La sinopsis es lo ÚNICO que distingue dos películas con el
                    mismo título y el mismo año, que es el caso que trae aquí. */}
                {candidate.synopsis && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {candidate.synopsis}
                  </span>
                )}
              </span>
            </button>
          </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => setFellBack(true)}
        disabled={pending}
      >
        {t("ambiguous.none")}
      </Button>
    </div>
  );
}

function altTitles(candidate: ImportCandidate): string[] {
  const seen = new Set([candidate.title.toLowerCase()]);
  const out: string[] = [];
  for (const title of [candidate.englishTitle, candidate.originalTitle]) {
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push(title);
  }
  return out;
}
