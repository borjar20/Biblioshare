"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { putPlayer, type PlayerRecord } from "@/lib/play/core/db";
import { requestPlayersSync } from "@/lib/play/core/players-sync";
import { PlaySheet, SheetGroup } from "./play-sheet";

type T = ReturnType<typeof useTranslations>;

/**
 * Sheet «Tus jugadores» del hub (fase 6, Task 7): gestión de habituales
 * (renombrar/eliminar) sobre el mismo espejo local-first que ya alimenta a
 * `RegularPicker` en el setup -- `usePlayers` es la única fuente.
 *
 * Visible también con 0 habituales (descubribilidad, spec §6): es la
 * entrada que le dice a quien nunca ha creado uno que existen y cómo se
 * crean (desde una mesa, con «Recordar como habitual» -- crear NO es cosa
 * de esta hoja en esta fase).
 *
 * `null` para anon: sin sesión no hay `play_players` que gestionar (mismo
 * criterio que `RegularPicker`).
 */
export function PlayersManager({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const { players, reload } = usePlayers(identity);
  const [open, setOpen] = useState(false);

  if (identity === "anon") return null;

  return (
    <section className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[14px] font-semibold">{t("players.title")}</span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {t("players.count", { count: players.length })}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[13px] text-muted-foreground">
          ›
        </span>
      </button>

      {open && (
        <PlayersSheet
          identity={identity}
          players={players}
          reload={reload}
          t={t}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function PlayersSheet({
  identity,
  players,
  reload,
  t,
  onClose,
}: {
  identity: string;
  players: PlayerRecord[];
  reload: () => void;
  t: T;
  onClose: () => void;
}) {
  // `editing` vive AQUÍ, no en el store: es puramente de la sesión de edición
  // de esta hoja, no algo que otra pestaña necesite conocer.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function startEditing(record: PlayerRecord) {
    setEditing(record.playerId);
    setDraft(record.name);
  }

  // `putPlayer`/`deletePlayer` escriben en IDB de forma síncrona (awaited);
  // `reload()` releyendo justo después basta para reflejar el cambio al
  // instante SIN esperar al canal de sync -- el canal solo reconcilia con lo
  // que el servidor confirme más tarde (Nota de estado, brief Task 7).
  async function confirmRename(record: PlayerRecord) {
    const name = draft.trim();
    if (!name) return;
    await putPlayer({ ...record, name, syncStatus: "pending" });
    setEditing(null);
    await reload();
    requestPlayersSync(identity);
  }

  async function handleDelete(record: PlayerRecord) {
    if (!window.confirm(t("players.deleteConfirm"))) return;
    // SIEMPRE tombstone: `pending` no significa «nunca subió» — un rename
    // devuelve a pending un registro que SÍ tiene copia remota, y borrarlo en
    // duro dejaría la fila huérfana en el servidor y el pull lo resucitaría.
    // El motor ya distingue solo: tombstone sin copia remota acaba en
    // dropLocal (borrado local sin red), con copia en deleteRemote.
    await putPlayer({ ...record, deletedAt: Date.now() });
    await reload();
    requestPlayersSync(identity);
  }

  return (
    <PlaySheet title={t("players.title")} onClose={onClose}>
      {players.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("players.empty")}</p>
      ) : (
        <SheetGroup>
          {players.map((record) => {
            const pending = record.syncStatus === "pending";
            const isEditing = editing === record.playerId;

            return (
              <div key={record.playerId} className="flex min-h-11 items-center gap-2 px-3 py-2.5">
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => confirmRename(record)}
                      disabled={!draft.trim()}
                      className="tap-44 shrink-0 px-1 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
                    >
                      {t("players.renameConfirm")}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px]">{record.name}</span>
                        {pending && (
                          <span className="shrink-0 rounded-chip bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                            {t("players.pending")}
                          </span>
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditing(record)}
                      className="tap-44 shrink-0 px-1 text-[13px] text-accent-ink"
                    >
                      {t("players.rename")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(record)}
                      className="tap-44 shrink-0 px-1 text-[13px] text-play-danger"
                    >
                      {t("players.delete")}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </SheetGroup>
      )}
    </PlaySheet>
  );
}
