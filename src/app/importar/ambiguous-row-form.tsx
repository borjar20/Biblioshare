"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportCandidate, ImportRow } from "@/lib/import/types";
import { resolveAmbiguousImportRow } from "./actions";
import { CandidateList } from "./candidate-list";
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

      <CandidateList candidates={candidates} onChoose={choose} disabled={pending} />

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
