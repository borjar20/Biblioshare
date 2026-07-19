"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
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
import type { SagaGraph } from "@/lib/sagas/graph-data";
import { CoverNode, MedallionNode, SagaNodeCard, type GraphFlowNode } from "./graph-nodes";

// Viewer read-only del grafo (frames C/E): pan + zoom (rueda/pellizco), tap en
// nodo navega a su ficha. El mismo componente sirve embebido en PC y a
// pantalla completa en móvil; el editor de fase 3 reutilizará los node types.
//
// Limitación conocida (a11y): la navegación al tocar un nodo es solo de
// puntero — con elementsSelectable=false, React Flow no dispara onNodeClick
// desde teclado (Enter/Espacio). Las mismas obras son alcanzables por la
// pestaña Info y las listas; se revisará con las interacciones del editor
// (fase 3).

const NODE_TYPES = { cover: CoverNode, medallion: MedallionNode, saga: SagaNodeCard };

const EDGE_DASH: Record<string, string | undefined> = {
  principal: undefined,
  opcional: "2 7",
  requisito: "1 6",
};

export function SagaGraphView({
  graph,
  className,
  showZoomControls = false,
}: {
  graph: SagaGraph;
  className?: string;
  /** Botones ＋/− (frame C, mapa fullscreen móvil, donde no hay rueda). */
  showZoomControls?: boolean;
}) {
  const router = useRouter();

  const nodes = useMemo<GraphFlowNode[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.kind === "saga" ? "saga" : n.level === "principal" ? "cover" : "medallion",
        position: { x: n.x, y: n.y },
        data: { node: n },
      })),
    [graph],
  );

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        const color = SAGA_ACCENT[e.accent].cssVar;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          style: { stroke: color, strokeWidth: 3, strokeDasharray: EDGE_DASH[e.type], strokeLinecap: "round" },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        };
      }),
    [graph],
  );

  const onNodeClick: NodeMouseHandler<GraphFlowNode> = (_event, node) => {
    router.push(node.data.node.href);
  };

  return (
    <div className={className ?? "h-[600px] w-full"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
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
