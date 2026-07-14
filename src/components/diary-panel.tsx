"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import type { DiaryEntry } from "@/lib/diary/types";
import {
  listDiaryEntries,
  addDiaryEntry,
  deleteDiaryEntry,
  type AddDiaryEntryState,
} from "@/lib/diary/actions";

const initialState: AddDiaryEntryState = {};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function DiaryPanel({
  libraryEntryId,
  itemType,
  itemId,
}: {
  libraryEntryId: string;
  itemType: ItemType;
  itemId: string;
}) {
  const t = useTranslations("diary");
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const boundAddDiaryEntry = addDiaryEntry.bind(null, libraryEntryId, itemType, itemId);
  const [state, formAction, formPending] = useActionState(
    boundAddDiaryEntry,
    initialState
  );

  function refresh() {
    startTransition(async () => {
      setEntries(await listDiaryEntries(libraryEntryId));
    });
  }

  useEffect(() => {
    if (state !== initialState && !state.error) {
      refresh();
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh should only re-run when the action state changes, not on every render
  }, [state]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && entries === null) refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        className="text-left text-xs text-muted-foreground underline hover:text-foreground"
      >
        {open ? t("hide") : t("show")}
      </button>

      {open && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 text-xs">
          {isPending && entries === null && (
            <p className="text-muted-foreground">{t("loading")}</p>
          )}

          {entries !== null && entries.length === 0 && (
            <p className="text-muted-foreground">{t("empty")}</p>
          )}

          {entries !== null && entries.length > 0 && (
            <ul className="flex flex-col gap-2">
              {entries.map((entry, i) => {
                // Entries are ordered most-recent-first, so the previous
                // pass is the next one in the array. See docs/REQUIREMENTS.md §7.13.
                const previous = entries[i + 1];
                return (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {entry.finishedOn}
                        {entry.rating ? ` · ${entry.rating}/10` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            await deleteDiaryEntry(entry.id, itemType, itemId);
                            refresh();
                          })
                        }
                        className="text-muted-foreground underline hover:text-status-dropped"
                      >
                        {t("delete")}
                      </button>
                    </div>
                    {entry.rating != null &&
                      previous?.rating != null &&
                      // El pase anterior puede seguir abierto (sin terminar);
                      // en ese caso no hay año que comparar.
                      previous.finishedOn != null && (
                      <p className="text-muted-foreground">
                        {t("comparison", {
                          previousYear: previous.finishedOn.slice(0, 4),
                          previousRating: previous.rating,
                          currentRating: entry.rating,
                        })}
                      </p>
                    )}
                    {entry.review && (
                      <p className="text-muted-foreground">{entry.review}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form
            ref={formRef}
            action={formAction}
            className="flex flex-col gap-2 border-t border-border pt-2"
          >
            <Field label={t("finishedOn")} htmlFor={`finishedOn-${libraryEntryId}`}>
              <Input
                id={`finishedOn-${libraryEntryId}`}
                name="finishedOn"
                type="date"
                required
                defaultValue={todayISO()}
                className="text-xs"
              />
            </Field>

            <Field label={t("rating")} htmlFor={`rating-${libraryEntryId}`}>
              <Input
                id={`rating-${libraryEntryId}`}
                name="rating"
                type="number"
                min={1}
                max={10}
                className="text-xs"
              />
            </Field>

            <Field label={t("review")} htmlFor={`review-${libraryEntryId}`}>
              <textarea
                id={`review-${libraryEntryId}`}
                name="review"
                rows={2}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </Field>

            {state.error && (
              <p className="text-status-dropped">{t(`errors.${state.error}`)}</p>
            )}

            <Button type="submit" disabled={formPending} variant="secondary">
              {formPending ? t("submitting") : t("submit")}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
