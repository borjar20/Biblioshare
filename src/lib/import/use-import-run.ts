"use client";

import { useCallback, useState } from "react";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow, ImportRowResult } from "./types";
import { commitImportBatch } from "@/app/importar/actions";
import { runImportBatches, type CommitBatch } from "./run-batches";

export type ImportRunPhase = "idle" | "processing" | "done";

/**
 * Estado de React alrededor de `runImportBatches`. Aquí NO hay lógica: todo lo
 * decidible vive en run-batches.ts, que sí tiene tests.
 */
export function useImportRun(commit: CommitBatch = commitImportBatch) {
  const [phase, setPhase] = useState<ImportRunPhase>("idle");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<ImportRowResult[]>([]);

  const start = useCallback(
    async (itemType: ItemType, rows: ImportRow[]) => {
      setPhase("processing");
      setTotal(rows.length);
      setProcessed(0);
      setResults([]);

      const collected = await runImportBatches(
        itemType,
        rows,
        commit,
        setProcessed,
      );

      setResults(collected);
      setPhase("done");
      return collected;
    },
    [commit],
  );

  return { phase, processed, total, results, start };
}
