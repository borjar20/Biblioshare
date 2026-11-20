"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { formatPosition, type Position } from "@/lib/library/position";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ProgressSession } from "@/lib/sessions/types";
import { deleteSession } from "@/lib/sessions/actions";
import { sessionDateLabel } from "@/lib/sessions/session-date";
import { ActionMenu } from "@/components/ui/action-menu";

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
  currentYear,
}: {
  /** Id del pase ACTIVO de la obra (§Tarea 7, hub): destino del enlace
   * "Añadir sesión". */
  passId: string;
  itemType: ItemType;
  itemId: string;
  sessions: ProgressSession[];
  /** Año en curso, del servidor: decide si la fecha lleva año. */
  currentYear: number;
}) {
  const t = useTranslations("item.sessions");
  const accent = MEDIA_ACCENT[itemType];
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col">
      <div className="mb-[11px] flex items-baseline justify-between gap-2 lg:mb-[15px]">
        {/* El `.h5` del frame: mono, versalitas y apagado — no un título en
            negrita. En PC la edición va en la MISMA línea ("Sesiones · Plaza
            & Janés (tapa dura)"), como hace el frame 10; en móvil no cabe y
            baja a su propia línea, como hace el frame 3. */}
        <h3 data-section-title className="label-section">
          {t("title")}
        </h3>
        <Link
          href={`/sesion/${passId}`}
          className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("add")}
        </Link>
      </div>

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
                  <time
                    dateTime={session.sessionDate}
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground lg:text-[11px]"
                  >
                    {sessionDateLabel(session.sessionDate, currentYear)}
                  </time>
                  {/* Borrar la sesión ya no es un text-link sembrado en cada
                      fila (F3-012): con diez sesiones había diez borrados
                      permanentes a un misclick del scroll. `confirm()` solo
                      cuando la sesión arrastra otros datos: si tiene un post
                      `progressed` propio, borrarla se lleva también ese post
                      y su hilo de comentarios (cleanup_source_posts,
                      2026-09-22) — irreversible y no solo tuyo. Una sesión
                      suelta sin post se vuelve a registrar en diez segundos,
                      así que esa sigue sin preguntar. */}
                  <div className="shrink-0">
                    <ActionMenu
                      label={t("actionsLabel")}
                      menuAlign="right"
                      triggerClassName="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                      items={[
                        {
                          key: "delete",
                          label: t("delete"),
                          danger: true,
                          disabled: isPending,
                          onSelect: () => {
                            if (session.hasPost && !window.confirm(t("deleteConfirmShared"))) {
                              return;
                            }
                            startTransition(() =>
                              deleteSession(session.id, itemType, itemId),
                            );
                          },
                        },
                      ]}
                    />
                  </div>
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
