import Image from "next/image";

// Portada real o, si falta, un "lomo" tipográfico (título en serif sobre surface-muted)
// — el mockup exige que las portadas nunca queden vacías.
export function SpineCover({
  coverUrl,
  title,
  className = "",
  sizes = "60px",
}: {
  coverUrl: string | null;
  title: string;
  className?: string;
  sizes?: string;
}) {
  if (coverUrl) {
    return (
      <div className={`relative overflow-hidden rounded bg-surface-muted shadow-cover ${className}`}>
        <Image src={coverUrl} alt={title} fill sizes={sizes} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`grid place-content-center overflow-hidden rounded border border-border bg-surface-muted p-1.5 text-center ${className}`}
    >
      <span className="line-clamp-4 font-serif text-[10px] leading-tight font-semibold text-foreground">
        {title}
      </span>
    </div>
  );
}
