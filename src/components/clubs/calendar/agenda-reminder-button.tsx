"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/components/ui/icons";
import { AgendaReminderSheet } from "./agenda-reminder-sheet";

// La campana de la fila de la agenda. Ya NO sigue el evento de un toque: abre la
// hoja donde se elige con cuánta antelación avisar (y desde donde se deja de
// seguir). Antes seguía en silencio con el predeterminado, y la única forma de
// cambiar el aviso era entrar a la ficha del evento.
//
// Se paga un toque de más para dejar de seguir. A cambio, la acción de seguir
// deja de tener un efecto invisible -- programar una notificación -- decidido
// por nosotros.
export function AgendaReminderButton({
  activityId,
  title,
  startsAt,
  timezone,
  following,
  remindMinutesBefore,
}: {
  activityId: string;
  title: string;
  startsAt: string | null;
  timezone: string | null;
  following: boolean;
  remindMinutesBefore: number | null;
}) {
  const t = useTranslations("activity");
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        // `haspopup`/`expanded`, no `aria-pressed`: esto abre un diálogo, no
        // conmuta un estado. Decir «pulsado» de un botón que abre una hoja es
        // anunciar algo que no ha pasado.
        aria-haspopup="dialog"
        aria-expanded={abierta}
        // El título va en el nombre accesible: en una agenda de cinco filas,
        // cinco campanas que solo dicen «Avisos» son indistinguibles.
        aria-label={`${following ? t("agendaReminderChange") : t("agendaReminderFollow")}: ${title}`}
        className={`grid w-12 shrink-0 place-items-center border-l border-border transition-colors hover:bg-surface-muted ${
          following ? "text-accent" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {/* Sólida cuando se sigue: el relleno sobrevive a la escala de grises,
            el color de acento a 16 px no siempre (§17). */}
        <BellIcon className="h-4 w-4" filled={following} aria-hidden />
      </button>

      <AgendaReminderSheet
        activityId={activityId}
        title={title}
        startsAt={startsAt}
        timezone={timezone}
        following={following}
        current={remindMinutesBefore}
        open={abierta}
        onClose={() => setAbierta(false)}
      />
    </>
  );
}
