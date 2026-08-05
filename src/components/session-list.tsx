"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { formatPosition, type Position } from "@/lib/library/position";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ProgressSession } from "@/lib/sessions/types";
import { deleteSession } from "@/lib/sessions/actions";
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";

// El tramo leído en una sesión ("p. 180 → 240" del frame 3).
//
// El dato NO existe: `progress_sessions.position` guarda solo la página
// ALCANZADA, no de dónde se partió. Se deriva del vecino, igual que el delta
// del diario deriva su "vs. anterior": las sesiones llegan de la más reciente
// a la más antigua, así que la anterior EN EL TIEMPO es la siguiente del
// array y su página es el inicio de esta.
//
// Sin vecino NO se inventa un "p. 0 →": la lista viene con `limit(20)`, así
// que la última cargada puede ser la primera del pase... o puede que no y solo
// esté cortada, y desde aquí no hay forma de distinguirlo. En ese caso se
// enseña solo la página alcanzada — que es lo que ya se hacía y nunca miente.
function rangeLabel(
  itemType: ItemType,
  position: Position,
  previous: Position | undefined,
): string | null {
  const reached = formatPosition(itemType, position);
  if (itemType !== "book" || !previous) return reached;

  const from = "page" in previous ? previous.page : undefined;
  const to = "page" in position ? position.page : undefined;
  if (from === undefined || to === undefined) return reached;

  return `p. ${from} → ${to}`;
}

export function SessionList({
  passId,
  itemType,
  itemId,
  sessions,
  editionLabel = null,
}: {
  /** Id del pase ACTIVO de la obra (§Tarea 7, hub): destino del enlace
   * "Añadir sesión". */
  passId: string;
  itemType: ItemType;
  itemId: string;
  sessions: ProgressSession[];
  /** Edición del pase abierto, rotulada encima de la lista (mockup pantalla
   * 3, "Edición: Plaza & Janés · tapa dura"). Solo libro tiene ediciones. */
  editionLabel?: string | null;
}) {
  const t = useTranslations("item.sessions");
  const format = useFormatter();
  const accent = MEDIA_ACCENT[itemType];
  const [isPending, startTransition] = useTransition();

  // "Ahora" del CLIENTE, fijado tras montar (#475). La fecha relativa depende
  // del reloj, así que NO puede vivir en el shell estático de Cache Components
  // (#448): en SSR/primer render se pinta la fecha ABSOLUTA —determinista,
  // idéntica en servidor y cliente, sin desajuste de hidratación— y al montar
  // se cambia a relativa con el reloj del cliente. Antes esto se pineaba con un
  // `now` global en i18n/request.ts que bloqueaba el prerender de TODA ruta.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  return (
    <div className="flex flex-col">
      <div className="mb-[11px] flex items-baseline justify-between gap-2 lg:mb-[15px]">
        {/* El `.h5` del frame: mono, versalitas y apagado — no un título en
            negrita. En PC la edición va en la MISMA línea ("Sesiones · Plaza
            & Janés (tapa dura)"), como hace el frame 10; en móvil no cabe y
            baja a su propia línea, como hace el frame 3. */}
        <h3 className="label-section">
          {t("title")}
          {editionLabel && (
            <span className="hidden lg:inline"> · {editionLabel}</span>
          )}
        </h3>
        <Link
          href={`/sesion/${passId}`}
          className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("add")}
        </Link>
      </div>

      {editionLabel && (
        <p className="mb-2 font-mono text-[10px] text-muted-foreground lg:hidden">
          {t("edition", { label: editionLabel })}
        </p>
      )}

      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {sessions.map((session, i) => {
            // La sesión ANTERIOR en el tiempo es la SIGUIENTE del array.
            const previous = sessions[i + 1];
            const range = rangeLabel(
              itemType,
              session.position,
              previous?.position,
            );
            const meta = [
              range,
              session.durationMinutes != null
                ? t("duration", { count: session.durationMinutes })
                : null,
            ].filter(Boolean);
            const relativeBasis = sessionRelativeBasis(
              session.sessionDate,
              session.createdAt,
            );

            return (
              <li
                key={session.id}
                className="flex flex-col border-t border-border py-2.5 text-[12.5px] lg:py-3.5 lg:text-sm"
              >
                <div className="flex items-center gap-2.5 lg:gap-3">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full lg:h-[9px] lg:w-[9px] ${accent.bg}`}
                  />
                  <span className="text-foreground">{meta.join(" · ")}</span>
                  {/* Fecha en mono y a la derecha (el `margin-left:auto` del
                      frame). Relativa ("ayer", "hace 3 días") como la maqueta:
                      en una lista de sesiones seguidas sitúa mejor que un ISO
                      que hay que restar mentalmente. El `dateTime` conserva la
                      fecha exacta para quien la necesite. */}
                  <time
                    dateTime={relativeBasis}
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground lg:text-[11px]"
                  >
                    {now
                      ? format.relativeTime(new Date(relativeBasis), now)
                      : format.dateTime(new Date(relativeBasis), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                  </time>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(() =>
                        deleteSession(session.id, itemType, itemId),
                      )
                    }
                    className="shrink-0 text-[11px] text-muted-foreground underline hover:text-status-dropped disabled:opacity-60"
                  >
                    {t("delete")}
                  </button>
                </div>
                {/* Aquí NO va el texto de la nota (issue #109): su hogar es la
                    tabla `notes` y lo pinta «Mis notas y citas», con su tipo,
                    anclaje y acciones. Pintarlo también aquí duplicaba la misma
                    frase en esta pestaña. */}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
