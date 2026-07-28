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
          {/* Modo y nota en la MISMA píldora. La nota tuvo su propia píldora
              abajo y chocaba con el rótulo del segundo miembro, que cuelga
              justo ahí: el borde inferior de la cápsula no está libre, lo ocupa
              la etiqueta del nodo que envuelve. Se trunca porque la nota es
              prosa del curador y el timeline ya la enseña entera; aquí es una
              pista, no el texto. */}
          <span
            className="absolute -top-[11px] left-1/2 max-w-[240px] -translate-x-1/2 truncate rounded-full border border-map-tandem bg-[#2a2027] px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#e2cfe0]"
            title={capsule.note ?? undefined}
          >
            {/* Un hueco compartido sin modo curado dice «sin declarar», no «a la
                vez»: afirmar un orden que nadie declaró es justo lo que esta
                feature vino a quitar. */}
            ∥{" "}
            {capsule.mode === "simultaneo"
              ? t("timelineTandemSimultaneo")
              : capsule.mode === "indistinto"
                ? t("timelineTandemIndistinto")
                : t("timelineTandemUndeclared")}
            {capsule.note && <span className="normal-case italic text-[#c8b3c5]"> · {capsule.note}</span>}
          </span>
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
          {/* El rótulo nombra la FORMA, no el tramo. Con títulos reales
              («después de El Ritmo de la Guerra · antes de Viento y Verdad»)
              el texto completo salía cuatro veces más ancho que el marco, y
              recortarlo dejaba «· después de L…», que dice menos que la
              leyenda. Las dos anclas ya están dibujadas: son las dos aristas
              que entran y salen del sujeto, que es el idioma propio del mapa
              —y el mismo argumento por el que la ventana no se pinta como zona
              (spec de la fase 6, D3)—. El texto entero, con los dos títulos,
              sigue en la fila del timeline y aquí en el `title`. */}
          <span
            className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-map-window bg-[#1d2628] px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#bfe0e2]"
            title={[
              t("timelineWindowTitle"),
              frame.afterLabel === null ? null : t("timelineWindowAfter", { title: frame.afterLabel }),
              frame.beforeLabel === null ? null : t("timelineWindowBefore", { title: frame.beforeLabel }),
            ]
              .filter((parte): parte is string => parte !== null)
              .join(" · ")}
          >
            ◇ {t("timelineWindowTitle")}
          </span>
        </div>
      ))}
    </ViewportPortal>
  );
}
