"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import {
  formatPosition,
  BOOK_FORMATS,
  type Position,
} from "@/lib/library/position";
import {
  updateProgress,
  type UpdateProgressState,
} from "@/lib/library/manage-actions";

const initialState: UpdateProgressState = {};

export function ProgressPanel({
  entryId,
  itemType,
  itemId,
  rating,
  position,
  notes,
}: {
  entryId: string;
  itemType: ItemType;
  itemId: string;
  rating: number | null;
  position: Position;
  notes: string | null;
}) {
  const t = useTranslations("library.progress");
  const [open, setOpen] = useState(false);

  const boundUpdateProgress = updateProgress.bind(null, entryId, itemType, itemId);
  const [state, formAction, pending] = useActionState(
    boundUpdateProgress,
    initialState
  );

  const summaryParts = [
    rating ? `${rating}/10` : null,
    formatPosition(itemType, position),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-left text-xs text-muted-foreground underline hover:text-foreground"
      >
        {open
          ? t("hide")
          : summaryParts.length > 0
            ? summaryParts.join(" · ")
            : t("show")}
      </button>

      {open && (
        <form
          action={formAction}
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-xs"
        >
          <Field label={t("rating")} htmlFor={`progress-rating-${entryId}`}>
            <Input
              id={`progress-rating-${entryId}`}
              name="rating"
              type="number"
              min={1}
              max={10}
              defaultValue={rating ?? ""}
              className="text-xs"
            />
          </Field>

          {itemType === "book" && (
            <>
              <Field label={t("page")} htmlFor={`progress-page-${entryId}`}>
                <Input
                  id={`progress-page-${entryId}`}
                  name="page"
                  type="number"
                  min={0}
                  defaultValue={"page" in position ? position.page : ""}
                  className="text-xs"
                />
              </Field>

              <Field label={t("format")} htmlFor={`progress-format-${entryId}`}>
                <select
                  id={`progress-format-${entryId}`}
                  name="format"
                  defaultValue={"format" in position ? position.format : ""}
                  className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                >
                  <option value="">{t("formatNone")}</option>
                  {BOOK_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {t(`formats.${format}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {itemType === "series" && (
            <div className="flex gap-2">
              <Field label={t("season")} htmlFor={`progress-season-${entryId}`}>
                <Input
                  id={`progress-season-${entryId}`}
                  name="season"
                  type="number"
                  min={0}
                  defaultValue={"season" in position ? position.season : ""}
                  className="text-xs"
                />
              </Field>
              <Field label={t("episode")} htmlFor={`progress-episode-${entryId}`}>
                <Input
                  id={`progress-episode-${entryId}`}
                  name="episode"
                  type="number"
                  min={0}
                  defaultValue={"episode" in position ? position.episode : ""}
                  className="text-xs"
                />
              </Field>
            </div>
          )}

          <Field label={t("notes")} htmlFor={`progress-notes-${entryId}`}>
            <textarea
              id={`progress-notes-${entryId}`}
              name="notes"
              rows={2}
              defaultValue={notes ?? ""}
              className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>

          {state.error && (
            <p className="text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}

          <Button type="submit" disabled={pending} variant="secondary">
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
