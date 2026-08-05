// Esqueleto del muro de paneles: la misma rejilla masonry que la página real
// (`columns-*` + `break-inside-avoid`) con tarjetas fantasma que reservan altura.
// Lo comparten el <Suspense> de `/estadisticas` (entrada directa: el shell ya
// está, el muro llega detrás) y `loading.tsx` (navegación). Reservar altura es
// obligatorio aquí: un fallback que no lo hace mueve las columnas al resolverse
// —la lección de CLS de #284/#440.
export function StatsWallSkeleton() {
  return (
    <div className="columns-1 gap-4 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}
