"use client";

import { useMemo } from "react";
import { ViewportPortal } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { deriveMapOverlays } from "@/lib/sagas/map-overlays";
import type { SagaGraph } from "@/lib/sagas/map-types";

// Los dos adornos del frame D: la cápsula que envuelve un tándem y el marco del
// sujeto de una ventana.
//
// Van en un `ViewportPortal`, NO como nodos de React Flow. Son el mismo sistema
// de coordenadas —se mueven con el pan y el zoom, que es todo lo que hacía
// falta— pero no son nodos, y eso importa por dos razones concretas:
//
//  · `.react-flow__node` es el localizador con el que dos e2e cuentan las obras
//    del mapa (`sagas-v2-mapa`, `sagas-mapa-derivado`). Un adorno que se cuela
//    en ese recuento convierte «este mapa tiene 7 obras» en una afirmación
//    falsa, y el test que la protege pasaría a proteger otra cosa.
//  · un nodo recibe el `onNodeClick` que navega a una ficha, y estos no llevan
//    a ninguna parte.
//
// Colores fijos (`--map-tandem`, `--map-window`) y no tokens que sigan al tema:
// el lienzo lleva un gradiente oscuro FIJO, así que un color que cambiara con
// el tema desaparecería en claro. Es lo mismo que ya hace la arista del
// itinerario, y por lo mismo. El fondo de las píldoras de rótulo sí es un color
// crudo del lienzo: tienen que tapar el trazo que pasa por debajo.
export function MapOverlayLayer({ graph }: { graph: SagaGraph }) {
  const t = useTranslations("saga");
  const { tandems, windows } = useMemo(() => deriveMapOverlays(graph), [graph]);

  if (tandems.length === 0 && windows.length === 0) return null;

  return (
    <ViewportPortal>
      {tandems.map((capsule) => (
        <div
          key={capsule.id}
          data-testid="graph-tandem-capsule"
          className="pointer-events-none absolute rounded-[22px] border-2 border-map-tandem"
          style={{
            transform: `translate(${capsule.x}px, ${capsule.y}px)`,
            width: capsule.width,
            height: capsule.height,
            backgroundColor: "rgba(122,86,118,.14)",
            // Detrás de nodos y aristas: es fondo, no contenido.
            zIndex: -1,
          }}
        >
          <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-map-tandem bg-[#2a2027] px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#e2cfe0]">
            {/* Un hueco compartido sin modo curado dice «sin declarar», no «a la
                vez»: afirmar un orden que nadie declaró es justo lo que esta
                feature vino a quitar. */}
            ∥{" "}
            {capsule.mode === "simultaneo"
              ? t("timelineTandemSimultaneo")
              : capsule.mode === "indistinto"
                ? t("timelineTandemIndistinto")
                : t("timelineTandemUndeclared")}
          </span>
          {/* La nota del hueco, si el curador la escribió. Abajo y no arriba:
              son dos cosas distintas —qué clase de tándem es, y qué dijo el
              curador de él— y el borde de arriba ya está ocupado. */}
          {capsule.note && (
            <span className="absolute -bottom-[11px] left-1/2 max-w-[180px] -translate-x-1/2 truncate rounded-full border border-map-tandem bg-[#2a2027] px-2 py-px font-mono text-[9px] italic text-[#c8b3c5]">
              {capsule.note}
            </span>
          )}
        </div>
      ))}

      {windows.map((frame) => (
        <div
          key={frame.id}
          data-testid="graph-window-frame"
          className="pointer-events-none absolute rounded-[18px] border-[1.5px] border-dashed border-map-window"
          style={{
            transform: `translate(${frame.x}px, ${frame.y}px)`,
            width: frame.width,
            height: frame.height,
            // La trama diagonal del mockup. En línea y no como clase: es un
            // `repeating-linear-gradient` con opacidad, que Tailwind no expresa.
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(91,152,156,.13) 0 10px, transparent 10px 20px)",
            zIndex: -1,
          }}
        >
          <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-map-window bg-[#1d2628] px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#bfe0e2]">
            {/* Las MISMAS palabras que la fila del timeline sobre la misma obra:
                la cabecera, más los lados que existan. Un lado abierto no se
                nombra. */}
            ◇{" "}
            {[
              t("timelineWindowTitle"),
              frame.afterLabel === null ? null : t("timelineWindowAfter", { title: frame.afterLabel }),
              frame.beforeLabel === null ? null : t("timelineWindowBefore", { title: frame.beforeLabel }),
            ]
              .filter((parte): parte is string => parte !== null)
              .join(" · ")}
          </span>
        </div>
      ))}
    </ViewportPortal>
  );
}
