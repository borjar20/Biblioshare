"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow } from "@/lib/import/types";
import { useImportRun } from "@/lib/import/use-import-run";
import { parseImportFile, type ParseImportState } from "./actions";
import { FORM_CARD_GRID_COLS } from "@/lib/ui/layout";
import { UnmatchedRowForm } from "./unmatched-row-form";

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
  // El bucle de lotes vive en useImportRun, compartido con el panel del
  // onboarding: aquí solo se decide cuándo arranca y qué se pinta.
  const run = useImportRun();
  // Se desestructura `start` porque es lo ÚNICO que usa el efecto: así la
  // dependencia es exactamente el valor usado (estable vía useCallback), en vez
  // del objeto `run`, que es nuevo en cada render y reevaluaría el efecto sin
  // parar.
  const { start } = run;
  const startedRef = useRef(false);

  useEffect(() => {
    const parsed = parseState.result;
    if (!parsed || startedRef.current) return;
    startedRef.current = true;

    setRows(parsed.rows);
    setItemType(parsed.itemType);
    setPhase("processing");

    void start(parsed.itemType, parsed.rows).then(() => setPhase("results"));
  }, [parseState.result, start]);

  // `max-w-2xl` propio en las dos primeras fases: la página se ensancha para la
  // de RESULTADOS, que es una pantalla de triaje y puede traer decenas de filas
  // sin emparejar. Un selector de fichero y una barra de progreso estirados a
  // 1200px solo quedan peor.
  if (phase === "upload") {
    return (
      <form action={parseAction} className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-4 text-sm text-muted-foreground">
          <p>{t("help.goodreads")}</p>
          <p>{t("help.letterboxd")}</p>
        </div>

        <input
          type="file"
          name="file"
          accept=".csv"
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
    const total = run.total;
    const percent = total > 0 ? Math.round((run.processed / total) * 100) : 0;
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t("processing", { processed: run.processed, total })}
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

  const imported = run.results.filter((r) => r.outcome === "imported").length;
  const duplicate = run.results.filter((r) => r.outcome === "duplicate").length;
  const unmatched = run.results.filter((r) => r.outcome === "unmatched");
  const errored = run.results.filter((r) => r.outcome === "error");
  const unknownStatusRows = run.results.filter((r) => r.unknownStatus);
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
          {/* Cada fila es un formulario de tres campos. A dos columnas dentro
              de SHELL_APP cada una conserva ~470px —de sobra para etiqueta e
              input— y se ven el doble de filas de una vez. */}
          <ul className={`grid items-start gap-3 ${FORM_CARD_GRID_COLS}`}>
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
