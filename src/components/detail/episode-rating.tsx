"use client";

import { RatingDots } from "@/components/ui/rating-dots";

// La nota de un episodio es una nota como cualquier otra (§7.36): RatingDots
// con el tamaño que pide la rejilla. Este componente ya no tiene lógica propia
// — era el único sitio que dibujaba bien los dots a medias, y esa técnica vive
// ahora en RatingDots, que usa toda la app. Se conserva el nombre porque es el
// vocabulario de la pestaña de episodios y fija su tamaño en un solo sitio.
export function EpisodeRating({
  rating,
  onRate,
  disabled = false,
  size = 12,
}: {
  rating: number | null;
  onRate?: (rating: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <RatingDots
      value={rating}
      onChange={onRate}
      disabled={disabled}
      size={size}
    />
  );
}
