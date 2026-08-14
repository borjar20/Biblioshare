// Chips de la cabecera: navegación interna por ancla, NO filtro. Cero estado de
// cliente -- por eso este componente no lleva "use client".
export function ActivitySectionNav({
  sections,
}: {
  /** Solo las secciones que existen en esta página, en orden. */
  sections: { id: string; label: string }[];
}) {
  if (sections.length === 0) return null;

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase hover:border-accent/40 hover:text-accent"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
