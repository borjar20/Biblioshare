"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { RatingDots } from "@/components/ui/rating-dots";
import { useItemStatus } from "@/components/detail/item-status-context";
import { useFollow } from "@/components/detail/use-follow";

const STATUS_DOT_CLASSES: Record<MediaStatus, string> = {
  planned: "bg-status-planned",
  in_progress: "bg-status-in-progress",
  completed: "bg-status-completed",
  dropped: "bg-status-dropped",
};

// El panel de control del rail en PC (.desk-actions de los frames 8-12), de
// momento en MODO LECTURA.
//
// Por qué solo lectura: en la maqueta el estado es un desplegable, pero
// cambiarlo no es escribir un campo — abandonar encadena la hoja de cierre y
// retomar pregunta si continúas o empiezas de cero. Esa máquina vive hoy en
// ManagedLog (log-panel.tsx), detrás del <Suspense> de las pestañas, y
// duplicarla aquí serían dos máquinas de estado contradiciéndose. Hasta que se
// levante a un sitio compartido, el rail ENSEÑA y el control sigue siendo el
// de Registro; por eso la pastilla no lleva el "▾" de la maqueta (prometería
// un desplegable que no hay) y en su lugar es un enlace a la pestaña.
//
// El estado se lee del contexto (no de una prop) para que siga al pill de
// Registro en el mismo commit optimista: son dos vistas del mismo estado (P7).
export function ItemRailActions({
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
}: {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  /** Verbo por tipo de medio, sin el prefijo del móvil ("Leyendo"). */
  labels: Record<MediaStatus, string>;
  /** Solo donde hay cursor: la película no lleva barra (frame 12). */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
  ctaHref: string | null;
  ctaLabel: string;
  ratingLabel: string;
  goToLogLabel: string;
}) {
  const t = useTranslations("item");
  const { status, isSaving } = useItemStatus();
  const pathname = usePathname();
  const { follow, isPending } = useFollow(itemType, itemId, isLoggedIn);

  // Sin pase activo la obra no está en la biblioteca: el rail enseña "Seguir",
  // la cara de PC del botón que el hero pinta en móvil (misma acción, useFollow).
  // El hero es lg:hidden, así que sin esto en PC no habría forma de seguir.
  if (!status) {
    return (
      <Button
        type="button"
        disabled={isPending}
        onClick={follow}
        className="w-full"
      >
        {isPending ? t("following") : t("follow")}
      </Button>
    );
  }

  return (
    <>
      <Link
        href={`${pathname}?tab=log`}
        title={goToLogLabel}
        // Mismo testid que la píldora del hero (status-badge.tsx): las dos son
        // "el estado en modo lectura", cada una en su vista. El e2e busca la
        // que esté VISIBLE, así no depende del breakpoint en que corra.
        data-testid="status-badge"
        // Misma señal que la píldora del hero: el estado es optimista y esto
        // dice si la escritura que lo publicó sigue en vuelo (issue #106).
        aria-busy={isSaving}
        className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-[15px] py-[13px] text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
      >
        <span
          aria-hidden
          className={`h-[9px] w-[9px] shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
        />
        {labels[status]}
      </Link>

      {progress && (
        <div className="px-0.5">
          <div className="h-2 overflow-hidden rounded-full border border-border bg-surface-muted">
            <div
              className="h-full rounded-full bg-status-in-progress"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{progress.left}</span>
            <span>{progress.right}</span>
          </div>
        </div>
      )}

      {/* La acción más importante de la app lleva SIEMPRE el naranja del
          primario (F3-006). Antes se pintaba con el color del tipo de medio
          (`MEDIA_ACCENT[itemType].bg`), y eso hacía que «Marcar episodio»
          fuese el único botón morado de la aplicación mientras el mismo gesto,
          desde la pestaña Episodios, salía naranja. El color de tipo sigue
          siendo del CONTENIDO (barras de progreso, chips, marcas del
          calendario); el del CTA es el del rol, no el del medio. */}
      {ctaHref && (
        <Link
          href={ctaHref}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-accent px-4 py-3.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          {/* Icono del set, no el carácter «+»: el sistema declara trazo 1.8 en
              currentColor y un glifo de texto ni hereda ese grosor ni renderiza
              igual entre plataformas. Es el mismo icono que el CTA del hero. */}
          <PlusIcon aria-hidden className="h-4 w-4" />
          {ctaLabel}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-3">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {ratingLabel}
        </span>
        <RatingDots value={rating} itemType={itemType} />
      </div>
    </>
  );
}
