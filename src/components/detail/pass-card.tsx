"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { RatingDots } from "@/components/ui/rating-dots";
import { useItemStatus } from "./item-status-context";
import { useFollow } from "./use-follow";

const STATUS_DOT_CLASSES: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

export type PassCardProps = {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  /** Verbo por tipo de medio («Leyendo», «Viendo»…); `statusVerbs()` del servidor. */
  labels: Record<MediaStatus, string>;
  /** Solo donde hay cursor (libro, serie). La película no lleva barra. */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
  /** null = sin pase activo, o el tipo no ofrece acción. */
  ctaHref: string | null;
  ctaLabel: string;
  ratingLabel: string;
  goToLogLabel: string;
};

// «Tu pase» en la cabecera cinemática (spec 2026-09-23 §1): la fusión del panel
// del raíl de PC (ItemRailActions) y de la píldora + CTA del hero móvil
// (HeroStatusOrFollow). Una sola instancia en el DOM; ItemHero la recoloca por
// CSS (bajo el título en móvil y lg, tercera columna en xl).
//
// El CTA es SIEMPRE el naranja del rol (`bg-accent`, F3-006), no el color del
// tipo de medio: el color de tipo es del CONTENIDO, el del CTA es de la acción.
export function PassCard({
  itemType,
  itemId,
  isLoggedIn,
  labels,
  progress,
  rating,
  ctaHref,
  ctaLabel,
  ratingLabel,
  goToLogLabel,
}: PassCardProps) {
  const t = useTranslations("item");
  const { status, isSaving } = useItemStatus();
  const pathname = usePathname();
  const { follow, isPending } = useFollow(itemType, itemId, isLoggedIn);

  const shell =
    "flex flex-col gap-3 rounded-[14px] border border-border bg-surface/90 p-3.5 shadow-[0_18px_40px_-22px_rgba(60,35,15,0.55)] backdrop-blur-md";

  if (!status) {
    return (
      <div className={shell}>
        <Button type="button" disabled={isPending} onClick={follow} className="w-full">
          {isPending ? t("following") : t("follow")}
        </Button>
      </div>
    );
  }

  return (
    <div className={shell}>
      {/* data-testid: lo localiza pase-hub.spec.ts. */}
      <Link
        href={`${pathname}?tab=log`}
        title={goToLogLabel}
        data-testid="status-badge"
        aria-busy={isSaving}
        className="flex items-center gap-2.5 rounded-[10px] px-1 py-0.5 text-sm font-semibold text-foreground transition-colors hover:text-foreground-soft"
      >
        <span
          aria-hidden
          className={`h-[9px] w-[9px] shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
        />
        {labels[status]}
      </Link>

      {progress && (
        <div className="px-0.5">
          <div
            role="progressbar"
            aria-label={progress.left}
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 overflow-hidden rounded-full border border-border bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-status-in-progress"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{progress.left}</span>
            <span>{progress.right}</span>
          </div>
        </div>
      )}

      {ctaHref && (
        <Link
          href={ctaHref}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <PlusIcon aria-hidden className="h-4 w-4" />
          {ctaLabel}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2.5 px-1">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {ratingLabel}
        </span>
        <RatingDots value={rating} itemType={itemType} />
      </div>
    </div>
  );
}
