"use client";

import dynamic from "next/dynamic";

// DEFER F2: @xyflow/react pesa; cargarlo solo cuando el grafo se pinta de
// verdad. ssr:false — el canvas no aporta HTML útil al SSR.
export const SagaGraphLazy = dynamic(
  () => import("./saga-graph-view").then((m) => m.SagaGraphView),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-[420px] w-full place-items-center bg-[#201b16] font-mono text-[11px] text-[#b9a986]">
        …
      </div>
    ),
  },
);
