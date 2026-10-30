import Image from "next/image";
import { coverInitials } from "@/lib/profile/cover-initials";
import type { ProfileCover } from "@/lib/profile/types";

// Una portada del perfil. Sin imagen, bloque de acento con iniciales (solo
// letras). `decorative` la saca del árbol accesible (mosaico de la cabecera).
export function CoverTile({
  cover,
  sizes,
  className = "",
  decorative = false,
  initialsClassName = "text-lg",
}: {
  cover: Pick<ProfileCover, "title" | "coverUrl">;
  sizes: string;
  className?: string;
  decorative?: boolean;
  initialsClassName?: string;
}) {
  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-cover bg-surface-muted shadow-cover ${className}`}>
      {cover.coverUrl ? (
        <Image src={cover.coverUrl} alt={decorative ? "" : cover.title} fill sizes={sizes} className="object-cover" />
      ) : (
        <div
          className={`flex h-full items-center justify-center bg-[color-mix(in_oklab,var(--accent)_45%,var(--surface))] font-serif ${initialsClassName} font-semibold text-foreground`}
          aria-hidden={decorative || undefined}
        >
          {coverInitials(cover.title)}
        </div>
      )}
    </div>
  );
}
