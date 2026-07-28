import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { deriveMapOverlays } from "@/lib/sagas/map-overlays";
import type { SagaGraph } from "@/lib/sagas/map-types";

// Leyenda del mapa (frames B/C/E): tipos de línea + subsagas presentes en el
// grafo (deducidas de los propios nodos, sin prop extra).
export async function GraphLegend({ graph }: { graph: SagaGraph }) {
  const t = await getTranslations("saga");
  const groups = new Map<string, { name: string; accent: keyof typeof SAGA_ACCENT }>();
  for (const n of graph.nodes) {
    if (n.groupSagaId && n.groupName && !groups.has(n.groupSagaId)) {
      groups.set(n.groupSagaId, { name: n.groupName, accent: n.accent });
    }
  }
  // Condicional, a diferencia de las tres de arriba: el salto solo existe con
  // un itinerario activo, así que anunciarlo siempre pondría en la leyenda de
  // casi todos los mapas una línea que ese mapa no dibuja.
  const hasItineraryJump = graph.edges.some((e) => e.type === "itinerario");
  // Condicionales por el mismo motivo, y calculadas con la MISMA función que
  // las dibuja (fase 6): si la leyenda decidiera por su cuenta cuándo hay
  // cápsula, acabaría anunciando una forma que el lienzo no pinta.
  const overlays = deriveMapOverlays(graph);
  const hasTandem = overlays.tandems.length > 0;
  const hasWindowFrame = overlays.windows.length > 0;
  const hasNexus = graph.nodes.some((n) => n.kind === "item" && n.groupSagaId === null);
  const hasReading = graph.nodes.some((n) => n.status === "in_progress");

  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3">
      <h3 className="sr-only">{t("legend")}</h3>
      <span className="flex items-center gap-2 text-[11.5px] text-foreground">
        <i className="w-[26px] border-t-[2.5px] border-foreground" /> {t("legendMain")}
      </span>
      <span className="flex items-center gap-2 text-[11.5px] text-foreground">
        <i className="w-[26px] border-t-[2.5px] border-dashed border-gold" /> {t("legendOptional")}
      </span>
      <span className="flex items-center gap-2 text-[11.5px] text-foreground">
        <i className="w-[26px] border-t-[3px] border-dotted border-spine" /> {t("legendRequisite")}
      </span>
      {hasItineraryJump && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          {/* El MISMO color que el trazo del lienzo (`--map-itinerary-jump`),
              no `border-foreground` como las de arriba: aquí la muestra sí
              puede coincidir con lo que se dibuja, porque ese token no cambia
              con el tema y contrasta también sobre `--surface`. */}
          <i className="w-[26px] border-t-[2.5px] border-dashed border-map-itinerary-jump" />{" "}
          {t("legendItineraryJump")}
        </span>
      )}
      {hasTandem && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i className="h-[13px] w-[26px] shrink-0 rounded-md border-2 border-map-tandem bg-map-tandem/20" />{" "}
          {t("legendTandemCapsule")}
        </span>
      )}
      {hasWindowFrame && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i
            className="h-[13px] w-[26px] shrink-0 rounded border-[1.5px] border-dashed border-map-window"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(91,152,156,.35) 0 4px, transparent 4px 8px)",
            }}
          />{" "}
          {t("legendWindowFrame")}
        </span>
      )}
      {hasNexus && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i className="h-[13px] w-[13px] shrink-0 rounded-full bg-spine" /> {t("nexusGroup")}
        </span>
      )}
      {[...groups.entries()].map(([sagaId, g]) => (
        <span key={sagaId} className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i className={`h-[13px] w-[13px] shrink-0 rounded-full ${SAGA_ACCENT[g.accent].bg}`} /> {g.name}
        </span>
      ))}
      {hasReading && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i className="h-[13px] w-[13px] shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_rgba(176,84,47,0.25)]" />{" "}
          {t("legendReading")}
        </span>
      )}
    </div>
  );
}
