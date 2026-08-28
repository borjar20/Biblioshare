"use client";

import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent, type ReactNode } from "react";

// Pie de una lista paginada por URL: recuento + «Cargar más».
//
// Nació en el índice de sagas (`saga-load-more`) y se subió aquí cuando la
// rejilla de Colección necesitó lo mismo: lo único que cambiaba entre las dos
// era el dibujo de las filas fantasma, y duplicar el resto habría duplicado
// justo la parte razonada.
//
// Dos cosas que un <Link> pelado no daba y por las que esto es cliente:
//
// 1. `scroll: false`. «Cargar más» navega a la MISMA página con un tope mayor,
//    así que la lista crece por abajo; con el scroll por defecto Next salta
//    al principio del listado y el lector pierde el sitio donde estaba.
// 2. El pendiente. La página es dinámica (sesión + consultas), así que entre
//    el clic y las filas nuevas hay una espera real y sin señal parecía que el
//    botón no hacía nada. `useTransition` deja ese estado AQUÍ, fuera del
//    <Link>, que es lo que permite pintar las filas fantasma —
//    `useLinkStatus` solo lo expone a descendientes del propio enlace.
//
// Sigue siendo un <a> con href real: el clic con modificador (nueva pestaña,
// nueva ventana) no se intercepta y navega como cualquier enlace.
export function LoadMore({
  href,
  label,
  showingLabel,
  pendingPreview,
}: {
  href: string;
  label: string;
  showingLabel: string;
  /** Filas fantasma a pintar mientras la navegación está en vuelo. Las monta
   *  quien llama, porque la forma de una fila la sabe la lista, no el pie. */
  pendingPreview?: ReactNode;
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
      {pending && pendingPreview}

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
