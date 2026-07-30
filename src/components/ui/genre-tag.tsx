import Link from "next/link";
import { slugForLabel } from "@/lib/catalog/genre-vocab";

// Small monospace genre chip (reel+shelf-style), neutral by default. Cuando la
// label pertenece al vocabulario canónico, el chip enlaza a su página de género;
// si es un dato viejo fuera del registro, queda como span muerto (sin enlaces
// rotos).
export function GenreTag({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  const chip = `inline-flex items-center rounded-chip border border-border bg-surface-muted px-2 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap text-muted-foreground uppercase ${className}`;
  const slug = slugForLabel(label);
  if (slug) {
    return (
      <Link href={`/genero/${slug}`} className={`${chip} hover:text-foreground`}>
        {label}
      </Link>
    );
  }
  return <span className={chip}>{label}</span>;
}
