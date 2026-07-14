"use client";

import { useTransition } from "react";
import type { ReactNode } from "react";
import type { SearchResult } from "@/lib/catalog/types";
import { openCatalogItem } from "./actions";

// Un resultado que aún no está en el catálogo no tiene ficha a la que enlazar
// (la búsqueda ya no crea filas, §7.32), así que en vez de un <Link> se pinta un
// botón: al pulsarlo, la obra se crea y se redirige a su ficha recién nacida.
// Visualmente es la misma tarjeta; la diferencia es que no se puede abrir en una
// pestaña nueva, cosa que para un ítem que todavía no existe tampoco tendría
// mucho sentido.
export function OpenResultButton({
  result,
  children,
}: {
  result: SearchResult;
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => openCatalogItem(result))}
      disabled={isPending}
      className="group flex w-full flex-col gap-2 rounded-lg text-left transition hover:-translate-y-0.5 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
