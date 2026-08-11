"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

// Rejilla de campos de una edición/versión (etiqueta, editorial, año, idioma,
// páginas/duración, ISBN), compartida entre el alta rápida de la tira
// (EditionStrip) y el editor de ficha (CatalogEditor: alta y edición de una
// existente). Los `name` de cada <input> son los que leen createEdition /
// updateEdition directamente de la FormData — no cambiarlos sin tocar esas
// acciones. NO duplicar esta rejilla en otro sitio: si hace falta un campo
// más, se añade aquí.
export function EditionFields({
  isMovie,
  defaultValues,
}: {
  isMovie: boolean;
  defaultValues?: {
    label?: string;
    publisher?: string | null;
    year?: number | null;
    language?: string | null;
    totalUnits?: number | null;
    isbn?: string | null;
  };
}) {
  const t = useTranslations("editions");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="label-section">
          {t("label")}
        </span>
        <Input
          name="label"
          placeholder={t("labelHint")}
          defaultValue={defaultValues?.label}
          required
          maxLength={60}
        />
      </label>
      {!isMovie && (
        <label className="flex flex-col gap-1">
          <span className="label-section">
            {t("publisher")}
          </span>
          <Input name="publisher" defaultValue={defaultValues?.publisher ?? ""} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="label-section">
          {t("year")}
        </span>
        <Input
          name="year"
          type="number"
          inputMode="numeric"
          defaultValue={defaultValues?.year ?? undefined}
        />
      </label>
      {!isMovie && (
        <label className="flex flex-col gap-1">
          <span className="label-section">
            {t("language")}
          </span>
          <Input name="language" defaultValue={defaultValues?.language ?? ""} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="label-section">
          {isMovie ? t("duration") : t("pages")}
        </span>
        <Input
          name="totalUnits"
          type="number"
          inputMode="numeric"
          defaultValue={defaultValues?.totalUnits ?? undefined}
        />
      </label>
      {!isMovie && (
        <label className="flex flex-col gap-1">
          <span className="label-section">
            {t("isbn")}
          </span>
          <Input name="isbn" defaultValue={defaultValues?.isbn ?? ""} />
        </label>
      )}
    </div>
  );
}
