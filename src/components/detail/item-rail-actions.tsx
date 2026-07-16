"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { StarRating } from "@/components/ui/star-rating";
import { useItemStatus } from "@/components/detail/item-status-context";

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
  labels,
  progress,
  rating,
  ctaHref,
  ctaLabel,
  ratingLabel,
  goToLogLabel,
}: {
  itemType: ItemType;
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
  const { status } = useItemStatus();
  const pathname = usePathname();
  const accent = MEDIA_ACCENT[itemType];

  // Sin pase activo la obra no está en la biblioteca: el rail se queda con la
  // portada sola y "Seguir" sigue siendo cosa de Registro.
  if (!status) return null;

  return (
    <>
      <Link
        href={`${pathname}?tab=log`}
        title={goToLogLabel}
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

      {ctaHref && (
        <Link
          href={ctaHref}
          className={`flex items-center justify-center gap-2 rounded-[10px] ${accent.bg} px-4 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90`}
        >
          <span aria-hidden>+</span>
          {ctaLabel}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-3">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {ratingLabel}
        </span>
        <StarRating value={rating} />
      </div>
    </>
  );
}
