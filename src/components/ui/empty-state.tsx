import type { ReactNode } from "react";

// Patrón único de estado vacío / de error (Paper - Estados.html): glifo sobrio
// en caja, título en Fraunces, mensaje tenue y una acción. Lo comparten el
// perfil privado, la colección vacía, el feed vacío, la búsqueda sin
// resultados, el error de carga y el offline.
export function EmptyState({
  glyph,
  title,
  message,
  action,
  secondary,
}: {
  glyph: ReactNode;
  title: string;
  message?: string;
  /** Acción principal (normalmente un Link con buttonVariants("primary")). */
  action?: ReactNode;
  /** Enlace secundario, en tenue y subrayado. */
  secondary?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
      <div className="mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-border bg-surface text-accent">
        {glyph}
      </div>

      <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>

      {message && (
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
      {secondary && <div className="mt-3 text-xs">{secondary}</div>}
    </div>
  );
}
