import Link from "next/link";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaItemRole } from "@/lib/sagas/types";

// Barra de filtro por rol (fase 5, mockup frame C `.rolefilter`).
//
// Enlaces, no botones ni estado de cliente: filtrar es una LENTE momentánea, no
// una preferencia —al revés que el interruptor de opcionales de la fase 4, que
// sí vive en `profiles`—. En la URL se comparte, vuelve con el botón atrás del
// navegador y no cuesta ni una línea de JS.
//
// Se pinta CON y SIN sesión, también al revés que el interruptor: filtrar no
// guarda nada, así que no hace falta a quién guardárselo, y la ficha es pública.
//
// `counts` viene de `countRoles(graph)` — contado sobre el GRAFO, nunca sobre
// las filas visibles: contado sobre lo visible, filtrar dejaría la barra con un
// solo chip y no habría forma de volver.
//
// El mockup ofrece además un chip «Principal». Aquí no: `principal` no llegó a
// ser un valor del enum (es `role = null`), y un chip que filtrara por «lo que
// no tiene rol» le pondría nombre a un estado que la spec decidió no nombrar.
export function RoleFilterBar({
  counts,
  active,
  baseHref,
  labels,
}: {
  counts: Array<{ role: SagaItemRole; count: number }>;
  active: SagaItemRole | null;
  /** URL de la ficha CON sus parámetros ya puestos (`?tab=mapa&ruta=…`): la
   *  lente no puede sacarte del mapa ni cambiarte de itinerario. */
  baseHref: string;
  labels: {
    title: string;
    all: string;
    name: (role: SagaItemRole) => string;
    aria: (role: string) => string;
  };
}) {
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wide ${
      on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
    }`;
  return (
    <div data-testid="role-filter-bar" className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
        {labels.title}
      </span>
      <Link href={baseHref} data-testid="role-filter-all" className={chip(active === null)}>
        {labels.all}
      </Link>
      {counts.map(({ role, count }) => (
        <Link
          key={role}
          href={`${baseHref}&rol=${role}`}
          data-testid={`role-filter-${role}`}
          aria-label={labels.aria(labels.name(role))}
          aria-current={active === role ? "true" : undefined}
          className={chip(active === role)}
        >
          <span aria-hidden>{ROLE_GLYPH[role]} </span>
          {labels.name(role)} · {count}
        </Link>
      ))}
    </div>
  );
}
