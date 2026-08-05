"use client";

import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { ProposedCheckpoint } from "@/lib/clubs/activities/propose";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { XIcon } from "@/components/ui/icons";

export type CheckpointDraft = {
  label: string;
  /** Página (libro) o temporada+episodio (serie), como texto del formulario. */
  page: string;
  season: string;
  episode: string;
  dueOn: string;
};

export const EMPTY_CHECKPOINT: CheckpointDraft = {
  label: "",
  page: "",
  season: "",
  episode: "",
  dueOn: "",
};

// Convierte los borradores del formulario a lo que espera el servidor. Descarta
// los que no tienen etiqueta: el hito ES su etiqueta ("fin del cap. 12"). La
// posición es una pista opcional desde #471 (autodeclarado: la página depende de
// la edición de cada participante) -- si no hay un número válido, va sin pista.
export function toProposedCheckpoints(
  drafts: CheckpointDraft[],
  itemType: ItemType | null,
): ProposedCheckpoint[] {
  const result: ProposedCheckpoint[] = [];

  for (const draft of drafts) {
    const label = draft.label.trim();
    if (!label) continue;

    if (itemType === "book") {
      const page = Number(draft.page);
      const position = Number.isFinite(page) && page > 0 && draft.page.trim() !== "" ? { page } : {};
      result.push({ label, position, dueOn: draft.dueOn || null });
      continue;
    }

    const season = Number(draft.season);
    const episode = Number(draft.episode);
    const validSeries =
      Number.isFinite(season) && Number.isFinite(episode) && season > 0 && episode > 0;
    result.push({
      label,
      position: validSeries ? { season, episode } : {},
      dueOn: draft.dueOn || null,
    });
  }

  return result;
}

// Los hitos de una lectura conjunta se definen AL PROPONERLA, no después: son
// parte del enunciado ("leemos por tramos, y cada tramo abre su chat"), no un
// añadido posterior.
export function CheckpointDraftEditor({
  itemType,
  drafts,
  onChange,
}: {
  /** null si aún no se ha elegido el ítem: sin saber si es libro o serie, no se
      puede pedir una posición. */
  itemType: ItemType | null;
  drafts: CheckpointDraft[];
  onChange: (drafts: CheckpointDraft[]) => void;
}) {
  const t = useTranslations("activity");

  function patch(index: number, next: Partial<CheckpointDraft>) {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...next } : d)));
  }

  if (!itemType) {
    return (
      <p className="text-xs text-muted-foreground">{t("checkpointsPickItemFirst")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="label-section">
        {t("checkpoints")}
      </span>

      {drafts.map((draft, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-card border border-border p-3"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-muted font-mono text-[10px] text-muted-foreground">
              {index + 1}
            </span>
            <Input
              value={draft.label}
              onChange={(e) => patch(index, { label: e.target.value })}
              placeholder={t("checkpointLabelPlaceholder")}
              className="w-full"
            />
            <button
              type="button"
              aria-label={t("deleteCheckpoint")}
              onClick={() => onChange(drafts.filter((_, i) => i !== index))}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-status-dropped"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            {itemType === "book" ? (
              <Input
                type="number"
                min={1}
                value={draft.page}
                onChange={(e) => patch(index, { page: e.target.value })}
                placeholder={t("checkpointPositionPage")}
                className="w-full"
              />
            ) : (
              <>
                <Input
                  type="number"
                  min={1}
                  value={draft.season}
                  onChange={(e) => patch(index, { season: e.target.value })}
                  placeholder={t("checkpointPositionSeason")}
                  className="w-full"
                />
                <Input
                  type="number"
                  min={1}
                  value={draft.episode}
                  onChange={(e) => patch(index, { episode: e.target.value })}
                  placeholder={t("checkpointPositionEpisode")}
                  className="w-full"
                />
              </>
            )}
            <Input
              type="date"
              value={draft.dueOn}
              onChange={(e) => patch(index, { dueOn: e.target.value })}
              className="w-full"
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => onChange([...drafts, { ...EMPTY_CHECKPOINT }])}
      >
        {t("addCheckpoint")}
      </Button>

      <p className="text-xs text-muted-foreground">{t("checkpointsHint")}</p>
    </div>
  );
}
