import { useTranslations } from "next-intl";
import type { EventState } from "@/lib/clubs/activities/event-state";

// Chip de estado. El color acompaña, no informa por sí solo: el estado va
// escrito, así que en escala de grises o con daltonismo sigue leyéndose.
const ESTILO: Record<EventState, { bg: string; text: string; dot: string }> = {
  programado: { bg: "bg-green/14", text: "text-green", dot: "bg-green" },
  en_curso: { bg: "bg-green/16", text: "text-green", dot: "bg-green" },
  finalizado: {
    bg: "bg-surface-muted",
    text: "text-muted-foreground",
    dot: "bg-foreground-faint",
  },
  cancelado: {
    bg: "bg-status-dropped/14",
    text: "text-status-dropped",
    dot: "bg-status-dropped",
  },
  pospuesto: { bg: "bg-gold/16", text: "text-gold", dot: "bg-gold" },
};

export function EventStateBadge({ state }: { state: EventState }) {
  const t = useTranslations("activity");
  const estilo = ESTILO[state];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9.5px] tracking-wide uppercase ${estilo.bg} ${estilo.text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${estilo.dot}`} />
      {t(`eventState_${state}`)}
    </span>
  );
}
