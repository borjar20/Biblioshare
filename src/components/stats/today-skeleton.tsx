import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

// Fantasma del bloque "¿Qué has disfrutado hoy?" (`TodayBlock`).
//
// Existe por el CLS de la home (issue #284): `TodayBlock` iba detrás de un
// `<Suspense fallback={null}>` y, como encabeza el Inicio, al llegar empujaba
// hacia abajo el feed entero — 0.51 de CLS en móvil, la peor métrica de la app.
//
// No se clava un alto a ojo: se copia la ESTRUCTURA del bloque real, que es lo
// que en este repo mantiene alineadas las dimensiones (ver el comentario de
// `ui/skeleton.tsx`). Las piezas de alto fijo —la portada de 87px, la de 48px
// de las mini, el pie de acciones— caen solas en su sitio; solo el cuerpo de
// texto puede desviarse una línea, según lleve o no barra de progreso y meta.
export function TodayBlockSkeleton() {
  return (
    <section aria-hidden className="flex flex-col gap-3">
      {/* Cabecera: fecha (font-mono 11px) + título serif de 26px. */}
      <div>
        <SkeletonLine className="h-3 w-32" />
        <Skeleton className="mt-1.5 h-[27px] w-64 max-w-full rounded-md" />
      </div>

      {/* Mismo reparto que `TodayPicker`: destacado a la izquierda, "Para más
          tarde" de rail a la derecha en escritorio. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-2">
          {/* Tarjeta destacada: el chrome real (radio 14 + borde + sombra) con
              el interior en pulso, igual que hace `SkeletonCard`. */}
          <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface shadow-card">
            <div className="flex gap-3.5 p-3.5">
              <Skeleton className="h-[87px] w-[58px] shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <SkeletonLine className="h-2.5 w-16" />
                <SkeletonLine className="w-3/4" />
                <SkeletonLine className="h-3 w-1/2" />
                <Skeleton className="mt-1 h-[5px] w-full rounded-full" />
              </div>
            </div>
            {/* Pie de acciones (`TodayActions`): borde superior + fila de
                botones de p-[11px] sobre texto de 12.5px. */}
            <div className="flex border-t border-border">
              <div className="flex flex-1 items-center justify-center p-[11px]">
                <SkeletonLine className="h-3.5 w-24" />
              </div>
            </div>
          </div>

          {/* Rótulo "En curso" + carrusel de mini. */}
          <div className="mt-1 flex flex-col gap-2">
            <SkeletonLine className="h-2.5 w-28" />
            <div className="-mx-5 flex gap-2.5 overflow-hidden px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <MiniCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Espejo de `MiniCard` (today-block.tsx): ancho 40 (160px), padding 11,
// portada de 48px, barra de progreso y pie de 9px.
function MiniCardSkeleton() {
  return (
    <div className="w-40 shrink-0 rounded-[12px] border border-border bg-surface p-[11px] shadow-card">
      <div className="flex items-start gap-[9px]">
        <Skeleton className="h-12 w-8 shrink-0 rounded-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine className="h-2 w-10" />
          <SkeletonLine className="h-2.5 w-full" />
          <SkeletonLine className="h-2.5 w-2/3" />
        </div>
      </div>
      <Skeleton className="mt-[9px] h-1 w-full rounded-full" />
      <SkeletonLine className="mt-1.5 h-2 w-16" />
    </div>
  );
}
