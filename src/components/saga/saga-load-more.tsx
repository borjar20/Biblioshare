"use client";

import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent } from "react";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

// Pie del índice de sagas: recuento + «Cargar más».
//
// Dos cosas que un <Link> pelado no daba y por las que esto es cliente:
//
// 1. `scroll: false`. «Cargar más» navega a la MISMA página con un `n` mayor,
//    así que la rejilla crece por abajo; con el scroll por defecto Next salta
//    al principio del listado y el lector pierde el sitio donde estaba.
// 2. El pendiente. La página es dinámica (sesión + consultas), así que entre
//    el clic y las tarjetas nuevas hay una espera real y sin señal parecía
//    que el botón no hacía nada. `useTransition` deja ese estado AQUÍ, fuera
//    del <Link>, que es lo que permite pintar las tarjetas fantasma —
//    `useLinkStatus` solo lo expone a descendientes del propio enlace.
//
// Sigue siendo un <a> con href real: el clic con modificador (nueva pestaña,
// nueva ventana) no se intercepta y navega como cualquier enlace.
export function SagaLoadMore({
  href,
  label,
  showingLabel,
  skeletonCount,
}: {
  href: string;
  label: string;
  showingLabel: string;
  /** Cuántas tarjetas fantasma pintar: lo que de verdad falta por traer. */
  skeletonCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    startTransition(() => router.push(href, { scroll: false }));
  }

  return (
    <>
      {pending && skeletonCount > 0 && (
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
              <Skeleton className="h-[78px] w-[52px] shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                <SkeletonLine className="w-2/3" />
                <SkeletonLine className="h-2.5 w-1/2" />
                <SkeletonLine className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <p className="text-[12.5px] text-muted-foreground">{showingLabel}</p>
        <a
          href={href}
          onClick={onClick}
          aria-busy={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground aria-busy:opacity-70"
        >
          {label}
          {/* Hueco de tamaño fijo, siempre presente: el spinner aparece sin
              mover el texto del botón. */}
          <span
            aria-hidden
            className={`size-3 rounded-full border-[1.5px] border-current border-t-transparent transition-opacity ${
              pending ? "animate-spin opacity-100" : "opacity-0"
            }`}
          />
        </a>
      </div>
    </>
  );
}
