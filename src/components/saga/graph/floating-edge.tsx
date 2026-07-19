"use client";

import { BaseEdge, getBezierPath, useInternalNode, Position, type EdgeProps, type InternalNode } from "@xyflow/react";

// Arista flotante (spec post-v2 §4): se dibuja entre los LADOS más cercanos
// de ambos nodos, ignorando qué handle inició la conexión — el lado no se
// persiste (saga_edges no cambia).
//
// La matemática es la del ejemplo oficial "floating-edges" de React Flow
// (intersección de la línea centro-a-centro con el rectángulo del nodo,
// normalizada para que el punto caiga siempre sobre el borde — ver
// https://reactflow.dev/examples/edges/floating-edges): NO la fórmula
// borrador del brief de esta tarea (esa versión, aunque numéricamente
// equivalente en los casos probados, no clampa width/height=0 durante el
// primer render antes de medir el nodo). Aquí se clampa con Math.max(…, 1)
// para evitar divisiones por cero mientras React Flow aún no ha medido los
// nodos custom.

function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const w = Math.max((intersectionNode.measured.width ?? 0) / 2, 1);
  const h = Math.max((intersectionNode.measured.height ?? 0) / 2, 1);
  const intersectionNodePosition = intersectionNode.internals.positionAbsolute;
  const targetPosition = targetNode.internals.positionAbsolute;

  const x2 = intersectionNodePosition.x + w;
  const y2 = intersectionNodePosition.y + h;
  const x1 = targetPosition.x + Math.max((targetNode.measured.width ?? 0) / 2, 1);
  const y1 = targetPosition.y + Math.max((targetNode.measured.height ?? 0) / 2, 1);

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

// Qué lado del rect de `node` es el punto de intersección (para orientar las
// curvas de Bézier del path como si saliera de ese lado).
function getEdgePosition(node: InternalNode, intersectionPoint: { x: number; y: number }): Position {
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const width = node.measured.width ?? 0;
  const height = node.measured.height ?? 0;
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + height - 1) return Position.Bottom;
  return Position.Top;
}

export function FloatingEdge({ id, source, target, style, markerEnd, markerStart, label, labelStyle }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sourceIntersection = getNodeIntersection(sourceNode, targetNode);
  const targetIntersection = getNodeIntersection(targetNode, sourceNode);
  const sourcePosition = getEdgePosition(sourceNode, sourceIntersection);
  const targetPosition = getEdgePosition(targetNode, targetIntersection);

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sourceIntersection.x,
    sourceY: sourceIntersection.y,
    sourcePosition,
    targetX: targetIntersection.x,
    targetY: targetIntersection.y,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
      markerStart={markerStart}
      label={label}
      labelStyle={labelStyle}
      labelX={labelX}
      labelY={labelY}
    />
  );
}
