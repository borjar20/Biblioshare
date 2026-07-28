"use client";

import type { Node, NodeProps } from "@xyflow/react";
import type { TandemCapsule, WindowFrame } from "@/lib/sagas/map-overlays";

// Los dos adornos del frame D. Van DETRÁS de los nodos y de las aristas
// (`zIndex: -1`, en saga-graph-view.tsx): son fondo, no contenido, y no deben
// tapar una portada ni interceptar el tap que navega a la ficha — de ahí
// `pointer-events-none`.
//
// Colores fijos (`--map-tandem`, `--map-window`), no tokens que sigan al tema:
// el lienzo lleva un gradiente oscuro FIJO, así que un color que cambiara con
// el tema desaparecería en claro. Es lo mismo que ya hace la arista del
// itinerario, y por lo mismo. El fondo de las píldoras de rótulo sí es un color
// crudo del lienzo: tienen que tapar el trazo del adorno por debajo.

export type OverlayFlowNode =
  | Node<{ capsule: TandemCapsule; label: string }, "tandem-capsule">
  | Node<{ frame: WindowFrame; label: string }, "window-frame">;

export function TandemCapsuleNode({ data }: NodeProps<Extract<OverlayFlowNode, { type: "tandem-capsule" }>>) {
  const { capsule, label } = data;
  return (
    <div
      data-testid="graph-tandem-capsule"
      className="pointer-events-none relative rounded-[22px] border-2 border-map-tandem"
      style={{
        width: capsule.width,
        height: capsule.height,
        backgroundColor: "rgba(122,86,118,.14)",
      }}
    >
      <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-map-tandem bg-[#2a2027] px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#e2cfe0]">
        ∥ {label}
      </span>
      {/* La nota del hueco, si el curador la escribió. Abajo y no arriba: el
          rótulo de modo ya ocupa el borde superior, y son dos cosas distintas
          —qué clase de tándem es, y qué dijo el curador de él. */}
      {capsule.note && (
        <span className="absolute -bottom-[11px] left-1/2 max-w-[180px] -translate-x-1/2 truncate rounded-full border border-map-tandem bg-[#2a2027] px-2 py-px font-mono text-[9px] italic text-[#c8b3c5]">
          {capsule.note}
        </span>
      )}
    </div>
  );
}

export function WindowFrameNode({ data }: NodeProps<Extract<OverlayFlowNode, { type: "window-frame" }>>) {
  const { frame, label } = data;
  return (
    <div
      data-testid="graph-window-frame"
      className="pointer-events-none relative rounded-[18px] border-[1.5px] border-dashed border-map-window"
      style={{
        width: frame.width,
        height: frame.height,
        // La trama diagonal del mockup. En línea y no como clase: es un
        // `repeating-linear-gradient` con opacidad, que Tailwind no expresa.
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(91,152,156,.13) 0 10px, transparent 10px 20px)",
      }}
    >
      <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-map-window bg-[#1d2628] px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#bfe0e2]">
        ◇ {label}
      </span>
    </div>
  );
}
