"use client";
import { useTranslations } from "next-intl";

// Casilla «Contiene spoiler» de una reseña (pase o episodio). Marca la reseña
// ENTERA, igual que comments/notes/posts.is_spoiler: los demás la ven tapada
// (SpoilerGate) hasta el clic. Viaja al formulario como `reviewIsSpoiler`.
// Sin texto no se pinta: no hay nada que tapar, y la acción la apaga igual.
export function ReviewSpoilerField({
  review,
  checked,
  onChange,
  size = "md",
}: {
  review: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
}) {
  const t = useTranslations("passes");
  if (review.trim() === "") return null;
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
