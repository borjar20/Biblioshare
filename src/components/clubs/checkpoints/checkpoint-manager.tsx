"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createCheckpoint,
  deleteCheckpoint,
  reorderCheckpoints,
  updateCheckpoint,
  type CheckpointViewModel,
} from "@/lib/clubs/activities/checkpoints";
import type { Position } from "@/lib/library/position";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Alta/edición/reorden de checkpoints, solo moderator+ (EPIC-05, Bloque H1,
// decisión 2 del diseño). El formulario cambia entre "libro" (página) y
// "serie" (temporada+episodio) según el ítem del pool -- misma interpretación
// de posición que src/lib/library/position.ts. Deshabilitado por completo
// mientras la actividad no esté `active` (nicety de UX; la RLS ya lo bloquea
// de fondo).
export function CheckpointManager({
  activityId,
  itemType,
  checkpoints,
  disabled,
  onChanged,
}: {
  activityId: string;
  itemType: ItemType;
  checkpoints: CheckpointViewModel[];
  disabled: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [page, setPage] = useState("");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setLabel("");
    setPage("");
    setSeason("");
    setEpisode("");
    setDueOn("");
  }

  function startEdit(c: CheckpointViewModel) {
    setEditingId(c.id);
    setLabel(c.label);
    setPage("page" in c.position && c.position.page !== undefined ? String(c.position.page) : "");
    setSeason("season" in c.position ? String(c.position.season) : "");
    setEpisode("episode" in c.position ? String(c.position.episode) : "");
    setDueOn(c.dueOn ?? "");
    setError(null);
  }

  function buildPosition(): Position | null {
    if (itemType === "book") {
      const p = Number(page);
      return Number.isFinite(p) && p >= 0 ? { page: p } : null;
    }
    const s = Number(season);
    const e = Number(episode);
    return Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e >= 0 ? { season: s, episode: e } : null;
  }

  function handleSubmit() {
    const trimmed = label.trim();
    const position = buildPosition();
    if (!trimmed || !position) {
      setError(t("checkpointError"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (editingId) {
          await updateCheckpoint(editingId, { label: trimmed, position, dueOn });
        } else {
          await createCheckpoint(activityId, trimmed, position, dueOn);
        }
        resetForm();
        onChanged();
      } catch {
        setError(t("checkpointError"));
      }
    });
  }

  function handleDelete(checkpointId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCheckpoint(checkpointId);
        if (editingId === checkpointId) resetForm();
        onChanged();
      } catch {
        setError(t("checkpointError"));
      }
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= checkpoints.length) return;
    const orderedIds = checkpoints.map((c) => c.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    setError(null);
    startTransition(async () => {
      try {
        await reorderCheckpoints(activityId, orderedIds);
        onChanged();
      } catch {
        setError(t("checkpointError"));
      }
    });
  }

  if (disabled) return null;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-3">
      <span className="text-sm font-medium text-foreground">{t("checkpoints")}</span>

      {checkpoints.length > 0 && (
        <div className="flex flex-col gap-2">
          {checkpoints.map((c, index) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={isPending || index === 0}
                  onClick={() => move(index, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  {t("moveUp")}
                </button>
                <button
                  type="button"
                  disabled={isPending || index === checkpoints.length - 1}
                  onClick={() => move(index, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  {t("moveDown")}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startEdit(c)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t("editCheckpoint")}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(c.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t("deleteCheckpoint")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("checkpointLabelPlaceholder")}
        />
        {itemType === "book" ? (
          <Input
            type="number"
            min={0}
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder={t("checkpointPositionPage")}
          />
        ) : (
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder={t("checkpointPositionSeason")}
            />
            <Input
              type="number"
              min={0}
              value={episode}
              onChange={(e) => setEpisode(e.target.value)}
              placeholder={t("checkpointPositionEpisode")}
            />
          </div>
        )}
        {/* La posición dice DÓNDE está el hito en la obra; la fecha, CUÁNDO se
            espera llegar. Opcional: una lectura puede ir a ritmo libre, sin
            calendario. Las que sí la tienen alimentan "Próximos hitos". */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("checkpointDueOn")}
          <Input
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={isPending || !label.trim()} onClick={handleSubmit}>
            {editingId ? t("editCheckpoint") : t("addCheckpoint")}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" disabled={isPending} onClick={resetForm}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
