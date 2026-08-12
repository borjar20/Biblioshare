import type { ActivityKind } from "./core";
import type { ActivityProgress } from "./progress";

// Qué mide cada tipo de actividad. Separado de la tarjeta porque es la parte con
// más reglas y la única testeable sin navegador: "0 participantes" en algo a lo
// que nadie se apunta no informa de nada, y una barra al 0% por falta de
// denominador se lee como "abandonada".
export type ProgressLabels = {
  collectiveLabel: string | null;
  viewerLabel: string | null;
  /** 0..100, o null si no hay denominador. */
  collectivePercent: number | null;
  viewerPercent: number | null;
};

/** El `t` de next-intl acepta solo claves válidas; quien llame envuelve. */
export type Translate = (key: string, values?: Record<string, unknown>) => string;

const VACIO: ProgressLabels = {
  collectiveLabel: null,
  viewerLabel: null,
  collectivePercent: null,
  viewerPercent: null,
};

// Una clave por tipo. `evento` no llega nunca aquí (groupActivities lo descarta),
// pero el Record obliga a decidirlo en vez de a olvidarlo.
const METRIC_KEY: Record<ActivityKind, string | null> = {
  buddy_read: "metricCheckpoints",
  list_challenge: "metricCompleted",
  criteria_challenge: "metricAchieved",
  tierlist: "metricVoted",
  evento: null,
};

function percent(part: { done: number; total: number } | null): number | null {
  if (!part || part.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((part.done / part.total) * 100)));
}

export function describeProgress(
  kind: ActivityKind,
  progress: ActivityProgress | undefined,
  t: Translate,
): ProgressLabels {
  const key = METRIC_KEY[kind];
  if (!key || !progress) return VACIO;

  // La fila del VIEWER en tierlist es un sí/no ("¿ya has votado?"), no una
  // fracción: la RPC fija viewer_total=1 SIEMPRE (incluso sin haber votado),
  // así que reusar metricVoted aquí produce "0 de 1 han votado" -- no es
  // castellano. La spec (§6.4) pide justo esto: "si el viewer ya votó", nunca
  // un ratio. Sin porcentaje tampoco: no hay barra que pintar de un booleano.
  const viewerLabel =
    kind === "tierlist"
      ? (progress.viewer
          ? t("metricVotedSelf", { voted: progress.viewer.done > 0 ? "yes" : "no" })
          : null)
      : progress.viewer
        ? t(key, { done: progress.viewer.done, total: progress.viewer.total })
        : null;

  return {
    collectiveLabel: progress.collective
      ? t(key, { done: progress.collective.done, total: progress.collective.total })
      : null,
    viewerLabel,
    collectivePercent: percent(progress.collective),
    viewerPercent: kind === "tierlist" ? null : percent(progress.viewer),
  };
}
