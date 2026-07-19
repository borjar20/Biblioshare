"use client";

import Image from "next/image";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";

// Nodo del EDITOR (frame F): tarjeta compacta con handles visibles para trazar
// conexiones. La fidelidad visual completa (portada grande/medallón) vive en el
// viewer; aquí manda la manipulación. El borde usa el color de la subsaga
// ASIGNADA EN EL BORRADOR (membership ops sin guardar incluidas).

export type EditorFlowNode = Node<
  {
    label: string;
    coverUrl: string | null;
    accent: SagaAccentToken;
    level: "principal" | "menor";
    orderNo: number | null;
    isSagaNode: boolean;
    hasError: boolean;
  },
  "editor"
>;

const HANDLE = "!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#fff5ef] !bg-accent";

export function EditorNodeCard({ data, selected }: NodeProps<EditorFlowNode>) {
  return (
    <div
      className={`relative w-[120px] rounded-lg border-2 bg-black/50 p-1.5 backdrop-blur-sm ${
        selected ? "ring-2 ring-accent ring-offset-2 ring-offset-black" : ""
      } ${data.hasError ? "outline outline-2 outline-red-500" : ""}`}
      style={{ borderColor: SAGA_ACCENT[data.accent].cssVar, borderStyle: data.level === "menor" ? "dashed" : "solid" }}
    >
      <Handle type="target" position={Position.Top} className={HANDLE} />
      <div className="flex items-center gap-1.5">
        <span className={`relative shrink-0 overflow-hidden ${data.isSagaNode ? "h-8 w-8 rounded-full" : "h-11 w-[30px] rounded-sm"}`}>
          {data.coverUrl ? (
            <Image src={data.coverUrl} alt="" fill sizes="44px" className="object-cover" />
          ) : (
            <span className="block h-full w-full bg-spine/40" />
          )}
        </span>
        <span className="min-w-0">
          {data.orderNo !== null && (
            <span className="block font-mono text-[8px] text-[#b9a986]">Nº {data.orderNo}</span>
          )}
          <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight text-[#f0e6d4]">{data.label}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className={HANDLE} />
    </div>
  );
}
