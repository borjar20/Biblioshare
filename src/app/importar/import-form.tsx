"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow, ImportRowResult } from "@/lib/import/types";
import { parseImportFile, commitImportBatch, type ParseImportState } from "./actions";
import { UnmatchedRowForm } from "./unmatched-row-form";

const BATCH_SIZE = 20;

const initialParseState: ParseImportState = {};

type Phase = "upload" | "processing" | "results";

export function ImportForm({ canResolveManually }: { canResolveManually: boolean }) {
  const t = useTranslations("import");
  const [parseState, parseAction, parsePending] = useActionState(
    parseImportFile,
    initialParseState
  );

  const [phase, setPhase] = useState<Phase>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [itemType, setItemType] = useState<ItemType>("book");
  const [processed, setProcessed] = useState(0);
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [, startProcessing] = useTransition();
  const startedRef = useRef(false);

  useEffect(() => {
    const parsed = parseState.result;
    if (!parsed || startedRef.current) return;
    startedRef.current = true;

    setRows(parsed.rows);
    setItemType(parsed.itemType);
    setPhase("processing");

    startProcessing(async () => {
      const collected: ImportRowResult[] = [];
      for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
        const chunk = parsed.rows.slice(i, i + BATCH_SIZE);
        const chunkResults = await commitImportBatch(parsed.itemType, chunk);
        collected.push(...chunkResults);
        setProcessed(i + chunk.length);
      }
      setResults(collected);
      setPhase("results");
    });
  }, [parseState.result]);

  if (phase === "upload") {
    return (
      <form action={parseAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-4 text-sm text-muted-foreground">
          <p>{t("help.goodreads")}</p>
          <p>{t("help.letterboxd")}</p>
          <p>{t("help.bookmory")}</p>
        </div>

        <input
          type="file"
          name="file"
          accept=".csv,.xlsx"
          required
          className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
        />

        {parseState.error && (
          <p className="text-sm text-status-dropped">{t(`errors.${parseState.error}`)}</p>
        )}

        <Button type="submit" disabled={parsePending} className="self-start">
          {parsePending ? t("uploading") : t("upload")}
        </Button>
      </form>
    );
  }

  if (phase === "processing") {
    const total = rows.length;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t("processing", { processed, total })}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  const imported = results.filter((r) => r.outcome === "imported").length;
  const duplicate = results.filter((r) => r.outcome === "duplicate").length;
  const unmatched = results.filter((r) => r.outcome === "unmatched");
  const errored = results.filter((r) => r.outcome === "error");
  const unknownStatusRows = results.filter((r) => r.unknownStatus);
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label={t("summary.imported")} value={imported} />
        <SummaryStat label={t("summary.duplicate")} value={duplicate} />
        <SummaryStat label={t("summary.unmatched")} value={unmatched.length} />
        <SummaryStat label={t("summary.errored")} value={errored.length} />
      </div>

      {unmatched.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("unmatchedTitle")}</h2>
          <ul className="flex flex-col gap-3">
            {unmatched.map((result) => {
              const row = rowByNumber.get(result.rowNumber);
              if (!row) return null;
              return (
                <li key={result.rowNumber} className="rounded-lg border border-border p-3">
                  <UnmatchedRowForm
                    itemType={itemType}
                    row={row}
                    canResolveManually={canResolveManually}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {unknownStatusRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("unknownStatusTitle")}</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {unknownStatusRows.map((r) => (
              <li key={r.rowNumber}>
                {r.title} — &ldquo;{r.unknownStatus}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      {errored.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("erroredTitle")}</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {errored.map((r) => (
              <li key={r.rowNumber}>
                {r.title} — {r.errorMessage}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-surface shadow-card p-3">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
