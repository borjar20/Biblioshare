import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function CoverCard({
  href,
  coverUrl,
  title,
  subtitle,
  badge,
}: {
  href: string;
  coverUrl: string | null;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
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
        <span className="line-clamp-2 font-serif text-sm font-semibold text-foreground">
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
