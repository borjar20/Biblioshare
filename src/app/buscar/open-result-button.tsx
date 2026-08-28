"use client";

import { useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("search");
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => openCatalogItem(result))}
      disabled={isPending}
      aria-busy={isPending}
      data-testid="search-result-card"
      className="group relative flex w-full flex-col gap-2 rounded-lg text-left transition hover:-translate-y-0.5"
    >
      {children}
      {/* Abrir un resultado nuevo crea la obra en el catálogo: hay ida y vuelta
          al servidor de por medio, y con la tarjeta apenas atenuada el clic
          parecía no hacer nada. El overlay va por encima de la tarjeta entera
          (nada de un hueco nuevo) para no mover la rejilla de resultados. */}
      {isPending && (
        <span className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[2px]">
          <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            {t("opening")}
          </span>
        </span>
      )}
    </button>
  );
}
