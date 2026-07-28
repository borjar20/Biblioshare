"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { deriveMapOverlays } from "@/lib/sagas/map-overlays";
import type { SagaGraph } from "@/lib/sagas/map-types";
import type { SagaItemRole } from "@/lib/sagas/types";
import { FloatingEdge } from "./floating-edge";
import { CoverNode, MedallionNode, SagaNodeCard, type GraphFlowNode } from "./graph-nodes";
import { TandemCapsuleNode, WindowFrameNode, type OverlayFlowNode } from "./overlay-nodes";

// Viewer read-only del grafo (frames C/E): pan + zoom (rueda/pellizco), tap en
// nodo navega a su ficha. El mismo componente sirve embebido en PC y a
// pantalla completa en móvil; el editor de fase 3 reutilizará los node types.
//
// Limitación conocida (a11y): la navegación al tocar un nodo es solo de
// puntero — con elementsSelectable=false, React Flow no dispara onNodeClick
// desde teclado (Enter/Espacio). Las mismas obras son alcanzables por la
// pestaña Info y las listas; se revisará con las interacciones del editor
// (fase 3).

const NODE_TYPES = {
  cover: CoverNode,
  medallion: MedallionNode,
  saga: SagaNodeCard,
  "tandem-capsule": TandemCapsuleNode,
  "window-frame": WindowFrameNode,
};
const EDGE_TYPES = { floating: FloatingEdge };

const EDGE_DASH: Record<string, string | undefined> = {
  principal: undefined,
  opcional: "2 7",
  requisito: "1 6",
  // Raya larga: la más distinta de las otras dos discontinuas, que son punto
  // corto («opcional») y punteado fino («requisito»).
  itinerario: "10 6",
};

// El salto del itinerario NO se pinta con el acento de ninguna saga: no
// pertenece a ninguna, es de la capa del itinerario. Con el acento del bloque
// de destino se confundiría con las aristas de cadena de esa misma fila, que es
// justo lo que hay que poder distinguir.
//
// Token propio y no `--foreground`: el lienzo lleva un gradiente oscuro FIJO
// (más abajo, en `style`), así que en tema CLARO `--foreground` es casi negro
// sobre fondo casi negro y el trazo desaparecía.
const ITINERARY_EDGE_COLOR = "var(--map-itinerary-jump)";

export function SagaGraphView({
  graph,
  className,
  showZoomControls = false,
  activeRole = null,
}: {
  graph: SagaGraph;
  className?: string;
  /** Botones ＋/− (frame C, mapa fullscreen móvil, donde no hay rueda). */
  showZoomControls?: boolean;
  /** Lente por rol (`?rol=`, fase 5). ATENÚA los nodos que no son de ese rol;
   *  no los quita. Quitarlos dejaría aristas huérfanas y partiría la cadena —
   *  el fallo que la issue #238 documenta en el timeline. La lente cambia el
   *  énfasis, no la estructura. */
  activeRole?: SagaItemRole | null;
}) {
  const router = useRouter();
  const t = useTranslations("saga");

  const nodes = useMemo<Array<GraphFlowNode | OverlayFlowNode>>(() => {
    // Los adornos del frame D: se derivan de las coordenadas que el grafo ya
    // trae (map-overlays.ts) en vez de viajar en `SagaGraph`, que lo comparten
    // tres consumidores. Van los primeros del array y con `zIndex: -1`: son
    // fondo, detrás de nodos y aristas.
    const { tandems, windows } = deriveMapOverlays(graph);

    const capsulas: OverlayFlowNode[] = tandems.map((capsule) => ({
      id: capsule.id,
      type: "tandem-capsule" as const,
      position: { x: capsule.x, y: capsule.y },
      data: {
        capsule,
        // Un hueco compartido sin modo curado dice «sin declarar», no «a la
        // vez»: afirmar un orden que nadie declaró es justo lo que esta feature
        // vino a quitar.
        label:
          capsule.mode === "simultaneo"
            ? t("timelineTandemSimultaneo")
            : capsule.mode === "indistinto"
              ? t("timelineTandemIndistinto")
              : t("timelineTandemUndeclared"),
      },
      draggable: false,
      selectable: false,
      zIndex: -1,
    }));

    const marcos: OverlayFlowNode[] = windows.map((frame) => ({
      id: frame.id,
      type: "window-frame" as const,
      position: { x: frame.x, y: frame.y },
      data: {
        frame,
        // Las MISMAS palabras que la fila del timeline sobre la misma obra: la
        // cabecera, más los lados que existan. Un lado abierto no se nombra.
        label: [
          t("timelineWindowTitle"),
          frame.afterLabel === null ? null : t("timelineWindowAfter", { title: frame.afterLabel }),
          frame.beforeLabel === null ? null : t("timelineWindowBefore", { title: frame.beforeLabel }),
        ]
          .filter((p): p is string => p !== null)
          .join(" · "),
      },
      draggable: false,
      selectable: false,
      zIndex: -1,
    }));

    const reales: GraphFlowNode[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.kind === "saga" ? "saga" : n.level === "principal" ? "cover" : "medallion",
      position: { x: n.x, y: n.y },
      // La lente viaja EN EL DATO del nodo: React Flow no propaga props a los
      // nodos custom.
      data: { node: n, muted: activeRole !== null && n.role !== activeRole },
    }));

    return [...capsulas, ...marcos, ...reales];
  }, [graph, t, activeRole]);

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        const color = e.type === "itinerario" ? ITINERARY_EDGE_COLOR : SAGA_ACCENT[e.accent].cssVar;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "floating",
          style: { stroke: color, strokeWidth: 3, strokeDasharray: EDGE_DASH[e.type], strokeLinecap: "round" },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        };
      }),
    [graph],
  );

  // Los adornos no navegan a ninguna parte: son fondo, y además no tienen
  // `href` que seguir. (Ya llevan `pointer-events-none`, así que este descarte
  // es el segundo cierre, no el único.)
  const onNodeClick: NodeMouseHandler<GraphFlowNode | OverlayFlowNode> = (_event, node) => {
    if (node.type === "tandem-capsule" || node.type === "window-frame") return;
    router.push(node.data.node.href);
  };

  return (
    <div className={className ?? "h-[600px] w-full"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
        style={{
          background: "radial-gradient(120% 90% at 18% 12%, #2b2620 0%, #201b16 55%, #191410 100%)",
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.3} color="#d9c8a833" />
        {showZoomControls && <Controls showInteractive={false} showFitView position="bottom-right" />}
      </ReactFlow>
    </div>
  );
}
