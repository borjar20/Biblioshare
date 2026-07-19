"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT, SAGA_ACCENT_SEQUENCE, type SagaAccentToken } from "@/lib/sagas/accents";
import type { EditorEdge, EditorNode, MembershipOp, NodeDisplay } from "@/lib/sagas/editor-types";
import { displayKey } from "@/lib/sagas/editor-types";
import { saveSagaGraph } from "@/lib/sagas/editor-actions";
import { findOrderCollisions, validateGraphDraft } from "@/lib/sagas/validate-graph-draft";
import { EditorNodeCard, type EditorFlowNode } from "./editor-node";
import { EditorLeftPanel, type ChildSagaRef } from "./editor-left-panel";
import { EditorInspector } from "./editor-inspector";
import { EditorSaveBar } from "./editor-save-bar";

const NODE_TYPES = { editor: EditorNodeCard };
const EDGE_DASH: Record<string, string | undefined> = { principal: undefined, opcional: "2 7", requisito: "1 6" };
const EDGE_ACCENT: Record<string, SagaAccentToken> = { opcional: "ambar", requisito: "beige" };

export type EdgeTool = "principal" | "opcional" | "requisito";

export function SagaGraphEditor({
  saga,
  initialNodes,
  initialEdges,
  initialDisplay,
  initialMembership,
  childSagas,
}: {
  saga: { id: string; name: string };
  initialNodes: EditorNode[];
  initialEdges: EditorEdge[];
  initialDisplay: Record<string, NodeDisplay>;
  initialMembership: Record<string, string | null>;
  childSagas: ChildSagaRef[];
}) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();

  const [nodes, setNodes] = useState<EditorNode[]>(initialNodes);
  const [edges, setEdges] = useState<EditorEdge[]>(initialEdges);
  const [display, setDisplay] = useState(initialDisplay);
  const [membership, setMembership] = useState(initialMembership);
  const [children, setChildren] = useState(childSagas);
  const [ops, setOps] = useState<MembershipOp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edgeTool, setEdgeTool] = useState<EdgeTool>("principal");
  const [dirty, setDirty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const touch = useCallback(() => setDirty((d) => d + 1), []);

  // Color de subsaga en el borrador: persistido > rotación estable por índice.
  const accentBySaga = useMemo(() => {
    const map = new Map<string | null, SagaAccentToken>();
    map.set(null, "beige");
    let rot = 0;
    for (const c of children) {
      const persisted = c.accentColor as SagaAccentToken | null;
      if (persisted && persisted in SAGA_ACCENT) map.set(c.id, persisted);
      else map.set(c.id, SAGA_ACCENT_SEQUENCE[rot++ % SAGA_ACCENT_SEQUENCE.length]);
    }
    return map;
  }, [children]);

  // Contador de miembros por subsaga (mockup frame F), sobre la membresía del borrador.
  const countBySaga = useMemo(() => {
    const map = new Map<string | null, number>();
    for (const target of Object.values(membership)) map.set(target, (map.get(target) ?? 0) + 1);
    return map;
  }, [membership]);

  const draftErrors = useMemo(() => validateGraphDraft(nodes, edges), [nodes, edges]);
  const orderCollisions = useMemo(() => findOrderCollisions(nodes), [nodes]);
  const errorNodeIds = useMemo(
    () => new Set(draftErrors.flatMap((e) => ("nodeId" in e ? [e.nodeId] : []))),
    [draftErrors],
  );

  const flowNodes = useMemo<EditorFlowNode[]>(
    () =>
      nodes.map((n) => {
        const d = display[displayKey(n)] ?? { label: "?", coverUrl: null };
        const groupId = n.childSagaId ?? membership[`${n.itemType}:${n.itemId}`] ?? null;
        return {
          id: n.id,
          type: "editor",
          position: { x: n.x, y: n.y },
          // Eco de la selección al modo controlado: sin esto React Flow la olvida en cada re-render y las flechas del teclado solo funcionan tras re-clicar.
          selected: n.id === selectedId,
          data: {
            label: n.labelOverride ?? d.label,
            coverUrl: d.coverUrl,
            accent: accentBySaga.get(groupId) ?? "beige",
            level: n.level,
            orderNo: n.orderNo,
            isSagaNode: n.childSagaId !== null,
            hasError: errorNodeIds.has(n.id),
          },
        };
      }),
    [nodes, display, membership, accentBySaga, errorNodeIds, selectedId],
  );

  const sourceGroup = useCallback(
    (nodeId: string): string | null => {
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) return null;
      return n.childSagaId ?? membership[`${n.itemType}:${n.itemId}`] ?? null;
    },
    [nodes, membership],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const accent = EDGE_ACCENT[e.edgeType] ?? accentBySaga.get(sourceGroup(e.fromNode)) ?? "beige";
        const color = SAGA_ACCENT[accent].cssVar;
        return {
          id: e.id,
          source: e.fromNode,
          target: e.toNode,
          style: { stroke: color, strokeWidth: 3, strokeDasharray: EDGE_DASH[e.edgeType], strokeLinecap: "round" },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        };
      }),
    [edges, accentBySaga, sourceGroup],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorFlowNode>[]) => {
      for (const ch of changes) {
        if (ch.type === "position" && ch.position) {
          // Modo controlado: aplicar la posición TAMBIÉN durante el drag (si no,
          // el nodo no sigue al cursor); el contador de cambios solo al soltar.
          setNodes((ns) => ns.map((n) => (n.id === ch.id ? { ...n, x: ch.position!.x, y: ch.position!.y } : n)));
          if (!ch.dragging) touch();
        }
        if (ch.type === "select") {
          setSelectedId((cur) => (ch.selected ? ch.id : cur === ch.id ? null : cur));
        }
        if (ch.type === "remove") {
          setNodes((ns) => ns.filter((n) => n.id !== ch.id));
          setEdges((es) => es.filter((e) => e.fromNode !== ch.id && e.toNode !== ch.id));
          setSelectedId((s) => (s === ch.id ? null : s));
          touch();
        }
      }
    },
    [touch],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      setEdges((es) => {
        if (es.some((e) => e.fromNode === conn.source && e.toNode === conn.target)) return es;
        return [...es, { id: crypto.randomUUID(), fromNode: conn.source, toNode: conn.target, edgeType: edgeTool }];
      });
      touch();
    },
    [edgeTool, touch],
  );

  // API para paneles (se pasa por props; sin contexto — un solo consumidor).
  const addItemNode = useCallback(
    (item: { itemType: EditorNode["itemType"]; itemId: string; title: string; coverUrl: string | null }) => {
      if (!item.itemType) return;
      if (nodes.some((n) => n.itemType === item.itemType && n.itemId === item.itemId)) return;
      const key = `${item.itemType}:${item.itemId}`;
      setDisplay((d) => ({ ...d, [`item:${key}`]: { label: item.title, coverUrl: item.coverUrl } }));
      if (!(key in membership)) {
        // No era miembro: asegurar membresía directa al guardar (grafo ⊆ miembros).
        setMembership((m) => ({ ...m, [key]: null }));
        setOps((o) => [...o.filter((x) => `${x.itemType}:${x.itemId}` !== key), { itemType: item.itemType!, itemId: item.itemId, targetSagaId: null }]);
      }
      setNodes((ns) => [
        ...ns,
        {
          id: crypto.randomUUID(),
          itemType: item.itemType,
          itemId: item.itemId,
          childSagaId: null,
          x: 120 + Math.random() * 120,
          y: 120 + Math.random() * 120,
          level: "principal",
          orderNo: null,
          labelOverride: null,
        },
      ]);
      touch();
    },
    [nodes, membership, touch],
  );

  const addSagaNode = useCallback(
    (child: { id: string; name: string }) => {
      if (nodes.some((n) => n.childSagaId === child.id)) return;
      setDisplay((d) => ({ ...d, [`saga:${child.id}`]: { label: child.name, coverUrl: null } }));
      setNodes((ns) => [
        ...ns,
        { id: crypto.randomUUID(), itemType: null, itemId: null, childSagaId: child.id, x: 200, y: 200, level: "principal", orderNo: null, labelOverride: null },
      ]);
      touch();
    },
    [nodes, touch],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<EditorNode>) => {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      touch();
    },
    [touch],
  );

  const moveMembership = useCallback(
    (itemType: NonNullable<EditorNode["itemType"]>, itemId: string, targetSagaId: string | null) => {
      const key = `${itemType}:${itemId}`;
      setMembership((m) => ({ ...m, [key]: targetSagaId }));
      setOps((o) => [...o.filter((x) => `${x.itemType}:${x.itemId}` !== key), { itemType, itemId, targetSagaId }]);
      touch();
    },
    [touch],
  );

  const removeNode = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.fromNode !== id && e.toNode !== id));
      setSelectedId(null);
      touch();
    },
    [touch],
  );

  const removeEdge = useCallback(
    (id: string) => {
      setEdges((es) => es.filter((e) => e.id !== id));
      touch();
    },
    [touch],
  );

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    const result = await saveSagaGraph(saga.id, nodes, edges, ops);
    setSaving(false);
    if (result.error) {
      setSaveError(result.error === "invalid-draft" ? t("invalidDraft") : t("saveError"));
      return;
    }
    setOps([]);
    setDirty(0);
    router.push(`/saga/${saga.id}?tab=mapa`);
    router.refresh();
  }

  // «Descartar» (spec §3.6): useState solo lee initial* al montar, así que
  // reasignar cada pieza de estado a su valor inicial es la única forma de
  // deshacer el borrador sin desmontar el árbol. router.refresh() se
  // mantiene después para resincronizar datos de servidor (p.ej. si otro
  // colaborador guardó mientras tanto).
  const discardDraft = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setDisplay(initialDisplay);
    setMembership(initialMembership);
    // children NO se revierte: crear/anidar subsagas y colores son acciones inmediatas ya persistidas, no borrador.
    setOps([]);
    setSelectedId(null);
    setDirty(0);
    setSaveError(null);
    router.refresh();
  }, [initialNodes, initialEdges, initialDisplay, initialMembership, router]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-gold">{t("eyebrow")}</p>
          <h1 className="font-serif text-lg font-semibold leading-tight">{t("title")}</h1>
          <p className="font-serif text-xs italic text-muted-foreground">{saga.name}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <EditorLeftPanel
          sagaId={saga.id}
          childSagas={children}
          accentBySaga={accentBySaga}
          countBySaga={countBySaga}
          edgeTool={edgeTool}
          onEdgeTool={setEdgeTool}
          onAddItem={addItemNode}
          onAddSagaNode={addSagaNode}
          onChildrenChange={setChildren}
        />

        <div className="relative min-h-[420px] flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            deleteKeyCode={["Delete", "Backspace"]}
            proOptions={{ hideAttribution: true }}
            style={{ background: "radial-gradient(120% 90% at 18% 12%, #2b2620 0%, #201b16 55%, #191410 100%)" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1.3} color="#d9c8a833" />
          </ReactFlow>
        </div>

        <EditorInspector
          selected={selected}
          display={display}
          membership={membership}
          childSagas={children}
          edges={edges}
          nodes={nodes}
          orderCollisions={orderCollisions}
          onPatch={updateNode}
          onMoveMembership={moveMembership}
          onRemoveNode={removeNode}
          onRemoveEdge={removeEdge}
        />
      </div>

      <EditorSaveBar
        dirty={dirty}
        saving={saving}
        error={saveError}
        hasErrors={draftErrors.length > 0}
        onDiscard={discardDraft}
        onSave={onSave}
      />
    </div>
  );
}
