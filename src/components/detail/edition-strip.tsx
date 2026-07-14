"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import { formatEdition } from "@/lib/editions/edition-label";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { createEdition, type CreateEditionState } from "@/lib/editions/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";

const initialState: CreateEditionState = {};

// Horizontal edition/version rail for the detail "Info" tab (same family as
// SagaStrip): cada tarjeta muestra la etiqueta, el nombre y el resumen de
// formatEdition; la del pase abierto (selectedEditionId, Tarea 12) lleva ✓ y
// el acento de tipo de medio. El alta inline solo se pinta a colaborador+.
export function EditionStrip({
  itemType,
  itemId,
  editions,
  selectedEditionId,
  canContribute,
}: {
  itemType: ItemType;
  itemId: string;
  editions: Edition[];
  /** La edición del pase abierto del que mira, si tiene. */
  selectedEditionId: string | null;
  canContribute: boolean;
}) {
  const t = useTranslations("editions");
  const accent = MEDIA_ACCENT[itemType];
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(
    createEdition.bind(null, itemType, itemId),
    initialState
  );

  if (editions.length === 0 && !canContribute) return null;

  const isMovie = itemType === "movie";

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[10px] tracking-wider ${accent.text} uppercase`}
        >
          {isMovie ? t("titleMovie") : t("titleBook")}
        </span>
        {editions.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("count", { count: editions.length })}
          </span>
        )}
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {editions.map((edition) => {
          const isSelected = edition.id === selectedEditionId;
          const name = edition.publisher ?? edition.label;

          return (
            <div
              key={edition.id}
              className={`relative w-[150px] shrink-0 rounded-lg border bg-surface p-3 ${
                isSelected ? `${accent.border} ${accent.bgSoft}` : "border-border"
              }`}
            >
              {isSelected && (
                <span
                  className={`absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center ${accent.text}`}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              )}
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase ${
                    isSelected
                      ? `${accent.bg} text-accent-foreground`
                      : "bg-surface-muted text-muted-foreground"
                  }`}
                >
                  {edition.label}
                </span>
                {isSelected && (
                  <span className={`font-mono text-[9px] ${accent.text}`}>
                    {t("yours")}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-xs font-semibold text-foreground">
                {name}
              </p>
              <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-muted-foreground">
                {formatEdition(edition, itemType)}
              </p>
            </div>
          );
        })}

        {canContribute && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className={`flex w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 text-center font-mono text-[11px] font-medium ${accent.border} ${accent.text}`}
          >
            <PlusIcon className="h-4 w-4" />
            {isMovie ? t("addMovie") : t("add")}
          </button>
        )}
      </div>

      {canContribute && adding && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {t("label")}
              </span>
              <Input name="label" placeholder={t("labelHint")} required maxLength={60} />
            </label>
            {!isMovie && (
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("publisher")}
                </span>
                <Input name="publisher" />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {t("year")}
              </span>
              <Input name="year" type="number" inputMode="numeric" />
            </label>
            {!isMovie && (
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("language")}
                </span>
                <Input name="language" />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {isMovie ? t("duration") : t("pages")}
              </span>
              <Input name="totalUnits" type="number" inputMode="numeric" />
            </label>
            {!isMovie && (
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("isbn")}
                </span>
                <Input name="isbn" />
              </label>
            )}
          </div>

          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            className="self-start"
          >
            {pending ? t("submitting") : t("submit")}
          </Button>

          {state.error && (
            <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}
        </form>
      )}
    </section>
  );
}
