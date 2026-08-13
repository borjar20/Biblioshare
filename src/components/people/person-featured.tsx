import { getTranslations } from "next-intl/server";
import { CoverCard } from "@/components/ui/cover-card";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";
import { strongestRole } from "@/lib/people/credit-noise";
import { ROLE_KEY, STATUS_KEY } from "./role-labels";

// Hasta 5 obras destacadas. Desde el 2026-08-12 SÍ vuelven a salir en la
// filmografía de abajo (petición del dueño): esta tira es un atajo —«por aquí se
// empieza»—, no un cajón donde meter cinco obras y sacarlas del recorrido
// cronológico. Antes se excluían, y el precio era una filmografía a la que le
// faltaban justo sus cinco títulos más importantes.
export async function PersonFeatured({ works }: { works: ProfileWork[] }) {
  const t = await getTranslations("person");

  return (
    <section className="flex flex-col gap-2.5" data-testid="person-featured">
      <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("featured")}
      </h3>
      {/* Móvil: CARRUSEL horizontal (mockup marco 2). Cinco destacadas en una
          rejilla de 2 columnas empujarían la lista de abajo fuera de la primera
          pantalla, que es justo lo que se quiere ver. Desde `sm` vuelve a ser
          rejilla y las tarjetas dejan de llevar ancho fijo. */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {works.map((work) => (
          // Todas las tarjetas MIDEN LO MISMO y su fila de estado queda a la
          // misma altura, porque el título reserva sus dos líneas ocupe una o
          // dos (`fixedTitleHeight`). Se alinea SUBIENDO lo de abajo, no
          // empujándolo al pie con `mt-auto`: anclar al pie alineaba igual pero
          // dejaba un vacío entre el «año · rol» y la nota, que es justo lo que
          // el dueño reportó al ver el primer arreglo.
          <div
            key={`${work.itemType}-${work.itemId}`}
            data-testid="featured-card"
            className="flex w-[132px] shrink-0 flex-col gap-1.5 sm:w-auto sm:shrink"
          >
            <CoverCard
              href={work.href}
              coverUrl={work.coverUrl}
              title={work.title}
              subtitle={[work.year, t(ROLE_KEY[strongestRole(work.roles)])]
                .filter(Boolean)
                .join(" · ")}
              fixedTitleHeight
            />
            {/* UNA sola señal por tarjeta, no dos.
                - ¿La has puntuado? La nota basta: puntuarla ya dice que la
                  terminaste, así que el punto verde de «Terminada» al lado era
                  redundante — y un punto de color suelto, sin texto, obliga a
                  aprender un código para leer lo que la nota ya cuenta.
                - ¿Sin nota pero con estado? Ahí sí hay algo que decir, y se
                  dice CON LETRAS («Pendiente», «En curso»): en una tira de
                  atajos, un dot mudo no informa a quien no lo tiene aprendido.
                El estado exacto de una obra puntuada no se pierde: la fila de
                la filmografía, abajo, lo pinta entero. */}
            {work.userRating != null ? (
              <RatingDots value={work.userRating} size="sm" itemType={work.itemType} />
            ) : (
              work.status && (
                // El envoltorio `flex` deja la pastilla a su ancho: como hija
                // directa de la columna se estiraría de borde a borde.
                <div className="flex">
                  <StatusBadge status={work.status} label={t(STATUS_KEY[work.status])} />
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
