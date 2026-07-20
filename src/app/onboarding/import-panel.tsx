"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useImportRun } from "@/lib/import/use-import-run";
import {
  parseImportFile,
  saveUnmatchedBatch,
  type ParseImportState,
} from "@/app/importar/actions";
import type { ImportRow } from "@/lib/import/types";

const initialParseState: ParseImportState = {};

/**
 * Versión compacta del importador para el paso 2 del asistente: sube, procesa
 * con barra, y resume. Sin lista de filas sin match — esas se guardan solas en
 * la cola de revisión y aquí solo se cuentan, porque quien acaba de registrarse
 * nunca es colaborador y no podría resolverlas.
 */
export function ImportPanel({
  onDone,
  onCancel,
}: {
  onDone: (added: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("onboarding.wizard");
  const tImport = useTranslations("import");
  const [parseState, parseAction, parsePending] = useActionState(
    parseImportFile,
    initialParseState,
  );
  const run = useImportRun();
  const { start } = run;
  const startedRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const parsed = parseState.result;
    if (!parsed || startedRef.current) return;
    startedRef.current = true;

    void start(parsed.itemType, parsed.rows).then(async (results) => {
      // Las filas sin match se guardan TODAS de golpe, sin pedirle nada al
      // usuario. `outcome` viene por número de fila, así que hay que volver a
      // casarlo con la fila original para tener el payload completo.
      const unmatched = results
        .filter((r) => r.outcome === "unmatched")
        .map((r) => parsed.rows.find((row) => row.rowNumber === r.rowNumber))
        .filter((row): row is ImportRow => row !== undefined);

      if (unmatched.length > 0) {
        await saveUnmatchedBatch(parsed.itemType, unmatched);
        setPendingCount(unmatched.length);
      }
      onDone(results.filter((r) => r.outcome === "imported").length);
    });
  }, [parseState.result, start, onDone]);

  if (run.phase === "processing") {
    const percent =
      run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {tImport("processing", { processed: run.processed, total: run.total })}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("importWarning")}</p>
      </div>
    );
  }

  if (run.phase === "done") {
    const added = run.results.filter((r) => r.outcome === "imported").length;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          {added > 0 ? t("importDone", { added }) : t("importNothing")}
        </p>
        {pendingCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("importPending", { count: pendingCount })}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={parseAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>{tImport("help.goodreads")}</p>
        <p>{tImport("help.letterboxd")}</p>
      </div>

      <input
        type="file"
        name="file"
        accept=".csv"
        required
        className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
      />

      {parseState.error && (
        <p className="text-sm text-status-dropped">
          {tImport(`errors.${parseState.error}`)}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={parsePending}>
          {parsePending ? tImport("uploading") : tImport("upload")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("importBack")}
        </Button>
      </div>
    </form>
  );
}
