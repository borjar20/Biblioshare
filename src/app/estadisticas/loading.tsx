import { SHELL_APP } from "@/lib/ui/layout";

// Esqueleto de la página de estadísticas completas mientras cargan las
// consultas del muro. La ruta redirige (no hace notFound()), así que loading.tsx
// es válido aquí (regla del plan 00).
export default function Loading() {
  return (
    <main className={`mx-auto w-full ${SHELL_APP} px-4 py-4 pb-24 sm:px-6 lg:px-8`}>
      <header className="mb-4 flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-surface-muted" />
      </header>
      <div className="mb-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-surface-muted" />
        ))}
      </div>
      <div className="columns-1 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-card border border-border bg-surface-muted"
          />
        ))}
      </div>
    </main>
  );
}
