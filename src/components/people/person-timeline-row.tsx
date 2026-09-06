import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CreditRole } from "@/lib/people/types";
import type { ProfileWork } from "@/lib/people/profile-types";
import { WorkStatusControl } from "./work-status-control";
import { ROLE_KEY, STATUS_KEY, TYPE_KEY } from "./role-labels";

// Cada categoría con su color, que es lo que permite barrer cuarenta filas y ver
// «aquí dirige, aquí escribe» sin leer una palabra. Tres familias, las mismas
// que ordena `workRoleWeight`: autoría de la obra (dirección/creación), texto
// (guion/autoría) e interpretación (reparto).
const ROLE_TAG: Record<CreditRole, string> = {
  director: "border-accent/40 bg-accent/10 text-accent",
  creator: "border-accent/40 bg-accent/10 text-accent",
  writer: "border-status-in-progress/40 bg-status-in-progress/10 text-status-in-progress-ink",
  author: "border-status-in-progress/40 bg-status-in-progress/10 text-status-in-progress-ink",
  cast: "border-border bg-surface-muted text-muted-foreground",
};

/**
 * Una fila de la filmografía cronológica.
 *
 * **La línea vertical del timeline es el `border-l` de esta fila**, no un
 * elemento aparte: las filas se apilan sin hueco entre ellas, así que sus
 * bordes se sueldan en una sola línea continua que recorre la lista entera. Un
 * pseudo-elemento absoluto habría necesitado saber el alto del grupo; así no
 * hay nada que medir y el año que abre cada tramo solo tiene que poner su punto.
 *
 * **La fila entera es clicable con un enlace en OVERLAY** (`absolute inset-0`),
 * no envolviendo el contenido: dentro hay botones y un menú, y anidar controles
 * dentro de un `<a>` es HTML inválido —y en la práctica se traga los clics del
 * menú—. El overlay va por debajo (`z-0`) y los controles después en el DOM,
 * que ya basta para quedar encima: NO llevan z-index propio, porque eso les
 * abría un contexto de apilamiento que dejaba el menú preso en su fila.
 */
export async function PersonTimelineRow({
  work,
  yearLabel,
  loggedIn,
}: {
  work: ProfileWork;
  /** El año a pintar en el canal, o null si esta fila NO abre tramo. */
  yearLabel: string | null;
  loggedIn: boolean;
}) {
  const t = await getTranslations("person");

  const meta = [
    t(TYPE_KEY[work.itemType]),
    work.durationMinutes ? t("minutes", { count: work.durationMinutes }) : null,
    // Con crédito de reparto manda el PERSONAJE: en la ficha de un intérprete lo
    // que se busca es «¿a quién hacía?».
    work.character,
  ].filter(Boolean) as string[];

  return (
    <div className="grid grid-cols-[38px_1fr] sm:grid-cols-[52px_1fr]">
      {/* `min-w-0` + `break-words`: la columna del canal es de ancho FIJO, así
          que sin esto una etiqueta que no quepa —«Sin año» en los 38px de
          móvil— ensancha la pista de la rejilla y saca la página de la
          ventana. Un año de cuatro cifras siempre cabe; el caso raro es el que
          rompía. */}
      <div className="flex min-w-0 justify-end pr-2 pt-3 sm:pr-3">
        {yearLabel && (
          <span className="break-words text-right font-mono text-[10.5px] leading-tight text-muted-foreground sm:text-[11px]">
            {yearLabel}
          </span>
        )}
      </div>

      {/* `min-w-0` otra vez, y por la misma razón que en el canal: una pista de
          rejilla `1fr` NO baja de su contenido si no se le dice, así que un
          título largo estiraba la fila —y con ella la página— en vez de
          truncarse. El `truncate` del título solo funciona si sus ancestros
          pueden encoger. */}
      <div className="relative min-w-0 border-l border-border pl-3 sm:pl-4">
        {yearLabel && (
          <span
            aria-hidden
            className="absolute -left-[3.5px] top-[13px] h-[7px] w-[7px] rounded-full border-2 border-background bg-border"
          />
        )}

        <div
          data-testid="work-row"
          className="relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
        >
          <Link
            href={work.href}
            className="absolute inset-0 z-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="sr-only">{work.title}</span>
          </Link>

          <div className="relative h-[62px] w-[42px] shrink-0 overflow-hidden rounded bg-surface-muted">
            {work.coverUrl && (
              <Image src={work.coverUrl} alt="" fill sizes="42px" className="object-cover" />
            )}
          </div>

          {/* Título, ficha técnica y roles JUNTOS: los roles describen el título,
              así que van pegados a él y no en una columna a media pantalla de
              distancia, donde había que barrer la fila para emparejarlos. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-serif text-[14.5px] font-medium text-foreground">
              {work.title}
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {meta.length > 0 && (
                <span className="truncate text-[11.5px] text-muted-foreground">
                  {meta.join(" · ")}
                </span>
              )}
              <span className="flex flex-wrap gap-1">
                {work.roles.map((role) => (
                  <span
                    key={role}
                    className={`rounded-full border px-1.5 py-[1px] font-mono text-[9.5px] uppercase tracking-wide ${ROLE_TAG[role]}`}
                  >
                    {t(ROLE_KEY[role])}
                  </span>
                ))}
              </span>
            </div>
          </div>

          {/* `relative` A SECAS, sin `z-10`: basta para quedar sobre el overlay
              (va después en el DOM y los dos son positioned), y un z-index aquí
              ENCERRABA el menú en la fila. Un elemento posicionado con z-index
              abre contexto de apilamiento propio, y entre contextos hermanos
              con el mismo z-index gana el último del DOM — así que el `z-50`
              del desplegable no podía salir por encima de la fila de abajo y
              quedaba tapado por sus botones (reportado por el dueño). */}
          <div className="relative">
            <WorkStatusControl
              itemType={work.itemType}
              itemId={work.itemId}
              href={work.href}
              status={work.status}
              rating={work.userRating}
              progressLabel={work.progressLabel}
              progressPercent={work.progressPercent}
              loggedIn={loggedIn}
              labels={{
                add: t("addToPending"),
                planned: t(STATUS_KEY.planned),
                inProgress: t(STATUS_KEY.in_progress),
                completed: t(STATUS_KEY.completed),
                dropped: t(STATUS_KEY.dropped),
                menu: t("workMenu"),
                addToCollection: t("actionAddToCollection"),
                start: t("actionStart"),
                markDone: t("actionMarkDone"),
                rate: t("rate"),
                remove: t("actionRemove"),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
