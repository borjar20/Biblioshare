import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function CoverCard({
  href,
  coverUrl,
  title,
  subtitle,
  badge,
  fixedTitleHeight = false,
}: {
  href: string;
  coverUrl: string | null;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /**
   * Reserva SIEMPRE las dos líneas del título, ocupe una o dos.
   *
   * Solo para tiras donde debajo de la tarjeta va algo más (una nota, un
   * estado) y esas piezas tienen que quedar a la misma altura entre tarjetas:
   * con el título libre, uno corto sube su fila y otro largo la baja, y la
   * tira se lee descuadrada. Fuera de ese caso NO se pone: reservar una línea
   * que no se usa es un hueco muerto bajo cada portada.
   */
  fixedTitleHeight?: boolean;
}) {
  return (
    <Link href={href} className="group flex flex-col gap-2">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {title}
          </div>
        )}
        {badge && <div className="absolute left-2 top-2">{badge}</div>}
      </div>
      <div className="flex flex-col">
        <span
          className={`line-clamp-2 font-serif text-sm font-semibold text-foreground${
            // 2 líneas de `text-sm` (line-height 1.25rem). `min-h`, no `h`:
            // si algún día el tipo crece, el título manda sobre el reservado.
            fixedTitleHeight ? " min-h-[2.5rem]" : ""
          }`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="line-clamp-1 font-serif text-xs italic text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
    </Link>
  );
}
