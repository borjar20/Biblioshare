"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { LibraryItem } from "@/lib/library/types";
import { formatPosition } from "@/lib/library/position";
import { updateProgress, type UpdateProgressState } from "./actions";

const initialState: UpdateProgressState = {};

export function ProgressPanel({ item }: { item: LibraryItem }) {
  const t = useTranslations("library.progress");
  const [open, setOpen] = useState(false);

  const boundUpdateProgress = updateProgress.bind(
    null,
    item.entryId,
    item.itemType
  );
  const [state, formAction, pending] = useActionState(
    boundUpdateProgress,
    initialState
  );

  const summaryParts = [
    item.rating ? `${item.rating}/10` : null,
    formatPosition(item.itemType, item.position),
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
          <Field label={t("rating")} htmlFor={`progress-rating-${item.entryId}`}>
            <Input
              id={`progress-rating-${item.entryId}`}
              name="rating"
              type="number"
              min={1}
              max={10}
              defaultValue={item.rating ?? ""}
              className="text-xs"
            />
          </Field>

          {item.itemType === "book" && (
            <Field label={t("page")} htmlFor={`progress-page-${item.entryId}`}>
              <Input
                id={`progress-page-${item.entryId}`}
                name="page"
                type="number"
                min={0}
                defaultValue={"page" in item.position ? item.position.page : ""}
                className="text-xs"
              />
            </Field>
          )}

          {item.itemType === "series" && (
            <div className="flex gap-2">
              <Field label={t("season")} htmlFor={`progress-season-${item.entryId}`}>
                <Input
                  id={`progress-season-${item.entryId}`}
                  name="season"
                  type="number"
                  min={0}
                  defaultValue={"season" in item.position ? item.position.season : ""}
                  className="text-xs"
                />
              </Field>
              <Field label={t("episode")} htmlFor={`progress-episode-${item.entryId}`}>
                <Input
                  id={`progress-episode-${item.entryId}`}
                  name="episode"
                  type="number"
                  min={0}
                  defaultValue={"episode" in item.position ? item.position.episode : ""}
                  className="text-xs"
                />
              </Field>
            </div>
          )}

          <Field label={t("notes")} htmlFor={`progress-notes-${item.entryId}`}>
            <textarea
              id={`progress-notes-${item.entryId}`}
              name="notes"
              rows={2}
              defaultValue={item.notes ?? ""}
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
