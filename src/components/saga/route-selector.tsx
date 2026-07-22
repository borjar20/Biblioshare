import Link from "next/link";
import type { SagaRoute } from "@/lib/sagas/route-types";

// Selector de itinerario (spec 2026-07-22 §UI). Sustituye a OrderToggle.
// Con DOS rutas es exactamente el toggle de antes — el caso de todas las sagas
// que existen hoy, así que no hay regresión visual. Con tres o más pasa a tira
// de chips con scroll horizontal.
export function RouteSelector({
  base,
  routes,
  active,
}: {
  base: string;
  routes: SagaRoute[];
  active: string;
}) {
  const href = (slug: string) => `${base}?tab=mapa&ruta=${slug}`;

  if (routes.length <= 2) {
    const cls = (on: boolean) =>
      `flex-1 rounded-lg px-1 py-2 text-center text-xs font-semibold ${
        on ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
      }`;
    return (
      <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {routes.map((r) => (
          <Link key={r.slug} href={href(r.slug)} className={cls(r.slug === active)} replace scroll={false}>
            {r.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {routes.map((r) => (
        <Link
          key={r.slug}
          href={href(r.slug)}
          replace
          scroll={false}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            r.slug === active
              ? "border-transparent bg-foreground text-background"
              : "border-border text-muted-foreground"
          }`}
        >
          {r.name}
        </Link>
      ))}
    </div>
  );
}
