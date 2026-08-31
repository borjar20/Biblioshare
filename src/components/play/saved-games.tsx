"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { deleteSaved, listSaved, saveFinished, type SavedGameRecord } from "@/lib/play/core/db";
import { requestSavedSync, SAVED_CHANNEL_PREFIX } from "@/lib/play/core/sync";
import { playTools } from "@/lib/play/tools";
import { seatAccent } from "@/lib/play/ui/seats";
import { buttonVariants } from "@/components/ui/button";
import { PlaySheet, SheetGroup, SheetRow } from "./play-sheet";

type T = ReturnType<typeof useTranslations>;

type MtgSummaryTool = { mode: string; turns: number; commanders: (string | null)[] };
type ScoreSummaryTool = {
  rounds: number;
  direction: string;
  totals: number[];
  // M1: no es un número suelto -- es el mismo ScoreTarget de score/types.ts
  // (summarizeScore lo copia tal cual desde state.setup.target).
  target: { kind: "rounds" | "points"; value: number } | null;
  // Opcional: los summaries de partidas guardadas ANTES de esta feature no
  // traen la clave -- el cast igual las tipa, así que el campo se lee con
  // tolerancia (nunca asumir que está presente).
  gameName?: string | null;
};

// Horas y minutos, sin segundos (spec task 7): "1 h 38 min" / "12 min". Deliberadamente
// distinto de `formatElapsed` (mm:ss) de la consola en vivo — ahí importa el segundo,
// aquí una partida ya cerrada.
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function toolName(t: T, toolId: SavedGameRecord["summary"]["toolId"]): string {
  return t(`tools.${playTools[toolId].i18nKey}.name`);
}

// En la fila: una partida de puntuación etiquetada («UNO») muestra el juego
// en vez del nombre genérico de la herramienta; sin etiquetar, como siempre.
function rowName(t: T, record: SavedGameRecord): string {
  if (record.summary.toolId === "score") {
    const gameName = (record.summary.tool as ScoreSummaryTool).gameName;
    if (gameName) return gameName;
  }
  return toolName(t, record.summary.toolId);
}

// Historial local-first (fase 5): lee SOLO IndexedDB — el sync de fondo la
// iguala al servidor y avisa por BroadcastChannel. Nunca espera a la red.
export function SavedGames({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const [records, setRecords] = useState<SavedGameRecord[] | null>(null);
  const [anonCount, setAnonCount] = useState(0);
  const [selected, setSelected] = useState<SavedGameRecord | null>(null);
  const [adoptDismissed, setAdoptDismissed] = useState(false);

  const reload = useCallback(async () => {
    const own = (await listSaved(identity)).filter((r) => r.deletedAt === null);
    own.sort((a, b) => b.savedAt - a.savedAt);
    setRecords(own);
    if (identity !== "anon") {
      const anon = await listSaved("anon");
      setAnonCount(anon.filter((r) => r.deletedAt === null).length);
    }
  }, [identity]);

  useEffect(() => {
    reload();
    requestSavedSync(identity);

    // El sync de fondo (Task 6) avisa por este canal en CADA pasada, tenga o no
    // cambios: reload() relee IDB y hace setState — barato e idempotente, así
    // que no hace falta diffing manual aquí.
    const channel = new BroadcastChannel(SAVED_CHANNEL_PREFIX + identity);
    channel.onmessage = () => reload();

    function onOnline() {
      requestSavedSync(identity);
    }
    window.addEventListener("online", onOnline);

    return () => {
      channel.close();
      window.removeEventListener("online", onOnline);
    };
  }, [identity, reload]);

  async function handleDelete(record: SavedGameRecord) {
    if (!window.confirm(t("saved.deleteConfirm"))) return;
    if (record.syncStatus === "pending") {
      // Nunca subió: no hay copia remota que tumbstonear.
      await deleteSaved(record.gameId);
    } else {
      await saveFinished({ ...record, deletedAt: Date.now() });
    }
    setSelected(null);
    await reload();
    requestSavedSync(identity);
  }

  async function handleAdopt() {
    const anon = (await listSaved("anon")).filter((r) => r.deletedAt === null);
    for (const record of anon) {
      // keyPath = gameId: re-etiquetar la identidad es un put, no un registro nuevo.
      await saveFinished({ ...record, identity, syncStatus: "pending" });
    }
    await reload();
    requestSavedSync(identity);
  }

  // null = cargando: no pintar nada (ni el banner) hasta que la primera
  // lectura de IDB resuelva.
  if (records === null) return null;

  const showAdopt = identity !== "anon" && anonCount > 0 && !adoptDismissed;

  return (
    <section className="mt-2">
      <h2 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {t("saved.title")}
      </h2>

      {showAdopt && (
        <div className="mt-3 rounded-card border border-border bg-surface p-3">
          <p className="font-serif text-[14px] font-semibold">
            {t("saved.adoptTitle", { count: anonCount })}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t("saved.adoptBody")}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleAdopt}
              className={buttonVariants("primary", "flex-1 justify-center py-2 text-[13px]")}
            >
              {t("saved.adopt")}
            </button>
            <button
              type="button"
              onClick={() => setAdoptDismissed(true)}
              className={buttonVariants("ghost", "flex-1 justify-center py-2 text-[13px]")}
            >
              {t("saved.adoptDismiss")}
            </button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("saved.empty")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {records.map((record) => {
            const { summary } = record;
            const winnerText =
              summary.winners.length === 1
                ? t("saved.winner", { name: summary.participants[summary.winners[0]]?.name ?? "" })
                : t("saved.winnerTie");
            const pending = record.syncStatus === "pending" && identity !== "anon";

            return (
              <li key={record.gameId}>
                <button
                  type="button"
                  onClick={() => setSelected(record)}
                  className="flex w-full items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold">
                        {rowName(t, record)}
                      </span>
                      {pending && (
                        <span className="shrink-0 rounded-chip bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                          {t("saved.pending")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {winnerText} · {t("saved.players", { count: summary.participants.length })}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                    <span className="block">{new Date(record.savedAt).toLocaleDateString()}</span>
                    <span className="block tabular-nums">{formatDuration(summary.durationMs)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <SavedGameDetail
          record={selected}
          t={t}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected)}
        />
      )}
    </section>
  );
}

function SavedGameDetail({
  record,
  t,
  onClose,
  onDelete,
}: {
  record: SavedGameRecord;
  t: T;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { summary } = record;
  const date = new Date(record.savedAt).toLocaleDateString();
  const ranking = [...summary.ranking].sort((a, b) => a.position - b.position);

  const mtgTool = summary.toolId === "mtg" ? (summary.tool as MtgSummaryTool) : null;
  const scoreTool = summary.toolId === "score" ? (summary.tool as ScoreSummaryTool) : null;
  const winnerCommander =
    mtgTool && summary.winners.length === 1 ? mtgTool.commanders[summary.winners[0]] : null;

  return (
    <PlaySheet
      title={t("saved.detailTitle")}
      caption={`${toolName(t, summary.toolId)} · ${date}`}
      onClose={onClose}
    >
      <ol className="flex flex-col gap-1">
        {ranking.map((entry) => {
          const participant = summary.participants[entry.seat];
          return (
            <li key={entry.seat} className="flex items-center gap-2.5">
              <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {t("summary.position", { position: entry.position })}
              </span>
              <span
                aria-hidden
                className={`${seatAccent(entry.seat).bar} h-5 w-1 shrink-0 rounded-full`}
              />
              <span className="min-w-0 flex-1 truncate text-[14px]">{participant?.name}</span>
              {scoreTool && (
                <span className="shrink-0 font-mono text-[13px] tabular-nums">
                  {scoreTool.totals[entry.seat]}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {mtgTool && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          {t(`tools.mtg.modes.${mtgTool.mode}.name`)}
          {winnerCommander ? ` · ${winnerCommander}` : ""}
        </p>
      )}

      {scoreTool && (scoreTool.gameName || scoreTool.target) && (
        <div className="mt-3 flex flex-col gap-1 text-[13px] text-muted-foreground">
          {scoreTool.gameName && (
            <p>
              {t("saved.game")}: {scoreTool.gameName}
            </p>
          )}
          {scoreTool.target && (
            <p>
              {scoreTool.target.kind === "rounds"
                ? t("saved.targetRounds", { value: scoreTool.target.value })
                : t("saved.targetPoints", { value: scoreTool.target.value })}
            </p>
          )}
        </div>
      )}

      <dl className="mt-4 flex gap-6 border-t border-border pt-3 font-mono text-[11px]">
        <div>
          <dt className="uppercase tracking-widest text-muted-foreground">{t("summary.duration")}</dt>
          <dd className="tabular-nums">{formatDuration(summary.durationMs)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <SheetGroup>
          <SheetRow label={t("saved.delete")} onClick={onDelete} danger />
        </SheetGroup>
      </div>
    </PlaySheet>
  );
}
