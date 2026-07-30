import { DesktopEditorialLayout } from "@/components/layout/desktop-editorial-layout";

// Esqueleto de la página de estadísticas completas mientras cargan las
// consultas del muro. La ruta redirige (no hace notFound()), así que loading.tsx
// es válido aquí (regla del plan 00).
export default function Loading() {
  return (
    <DesktopEditorialLayout
      className="pb-24"
      header={<>
        <header className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-6 w-32 animate-pulse rounded bg-surface-muted" />
        </header>
        <div className="mt-4 flex gap-2 lg:hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-surface-muted" />
          ))}
        </div>
      </>}
      main={<div className="columns-1 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-card border border-border bg-surface-muted"
          />
        ))}
      </div>}
      rail={<div className="h-24 w-full animate-pulse rounded bg-surface-muted" />}
    />
  );
}
