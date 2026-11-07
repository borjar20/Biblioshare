"use client";
import { useTranslations } from "next-intl";

// Casilla «Contiene spoiler» de una reseña (pase o episodio). Marca la reseña
// ENTERA, igual que comments/notes/posts.is_spoiler: los demás la ven tapada
// (SpoilerGate) hasta el clic. Viaja al formulario como `reviewIsSpoiler`.
// Sin texto no se pinta: no hay nada que tapar, y la acción la apaga igual.
//
// `chipClassName` (opcional) la presenta como chapa: la casilla pasa a
// `sr-only` dentro de la chapa, que marca su estado con `:has(input:checked)`
// (p. ej. `materials.brass` en el cierre). Mismo input, nombre y semántica.
export function ReviewSpoilerField({
  review,
  checked,
  onChange,
  size = "md",
  chipClassName,
}: {
  review: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
  chipClassName?: string;
}) {
  const t = useTranslations("passes");
  if (review.trim() === "") return null;
  if (chipClassName) {
    return (
      <div className="flex flex-col items-start gap-1">
        <label className={`${chipClassName} inline-flex w-fit items-center gap-2`}>
          <input
            type="checkbox"
            name="reviewIsSpoiler"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only"
          />
          {t("reviewSpoiler")}
        </label>
        <span className="text-[10.5px] text-muted-foreground">{t("reviewSpoilerHint")}</span>
      </div>
    );
  }
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 text-muted-foreground ${
        size === "sm" ? "text-xs" : "text-[12.5px]"
      }`}
    >
      <input
        type="checkbox"
        name="reviewIsSpoiler"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
      />
      <span>
        {t("reviewSpoiler")}
        <span className="block text-[10.5px]">{t("reviewSpoilerHint")}</span>
      </span>
    </label>
  );
}
