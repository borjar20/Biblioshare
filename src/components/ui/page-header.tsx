import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cabecera de página: barrita de acento + título en Fraunces, y a la derecha
 * lo que la pantalla necesite (una acción, un recuento).
 *
 * Existe porque el título —lo primero que se lee en cada pantalla— tenía OCHO
 * tratamientos distintos: `text-xl`, `2xl`, `[26px]`, `[28px]`, `[30px]` y
 * `4xl`, unos en Fraunces y otros en sans (admin, importar, género y recuperar
 * se habían quedado en sans, contra la regla de que los titulares son serif), y
 * la barrita de acento solo la llevaba Colección. Se toma como buena la de
 * Colección: es la pantalla más vista y ya venía revisada.
 *
 * La barra es `aria-hidden`: es marca de página, no información. Quien navega
 * con lector de pantalla ya tiene el `<h1>`.
 */
export function PageHeader({
  title,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  /** Acción o dato a la derecha (botón de crear, recuento de resultados). */
  action?: ReactNode;
  /** Si la pantalla es un destino al que se entra desde otra, su vuelta. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {backHref && (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          ‹
        </Link>
      )}

      {!backHref && (
        <span
          aria-hidden
          className="h-[22px] w-2 shrink-0 rounded-full bg-accent"
        />
      )}

      <h1 className="font-serif text-2xl font-semibold text-foreground lg:text-[28px]">
        {title}
      </h1>

      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}
