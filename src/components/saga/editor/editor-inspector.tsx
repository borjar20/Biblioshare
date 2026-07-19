"use client";

import { useTranslations } from "next-intl";
import type { EditorEdge, EditorNode, NodeDisplay } from "@/lib/sagas/editor-types";
import { displayKey } from "@/lib/sagas/editor-types";
import type { ChildSagaRef } from "./editor-left-panel";

// Inspector del nodo seleccionado (spec §3.5). El selector de subsaga NO toca
// el nodo: encola un MembershipOp (la subsaga se deriva de saga_items, §1.3).
export function EditorInspector({
  selected,
  display,
  membership,
  childSagas,
  edges,
  nodes,
  orderCollisions,
  onPatch,
  onMoveMembership,
  onRemoveNode,
  onRemoveEdge,
}: {
  selected: EditorNode | null;
  display: Record<string, NodeDisplay>;
  membership: Record<string, string | null>;
  childSagas: ChildSagaRef[];
  edges: EditorEdge[];
  nodes: EditorNode[];
  orderCollisions: number[];
  onPatch: (id: string, patch: Partial<EditorNode>) => void;
  onMoveMembership: (itemType: NonNullable<EditorNode["itemType"]>, itemId: string, target: string | null) => void;
  onRemoveNode: (id: string) => void;
  onRemoveEdge: (id: string) => void;
}) {
  const t = useTranslations("sagaEditor");

  if (!selected) {
    return (
      <aside className="w-full shrink-0 border-t border-border bg-surface p-4 lg:w-[300px] lg:border-l lg:border-t-0">
        <p className="text-xs text-muted-foreground">{t("emptyInspector")}</p>
      </aside>
    );
  }

  const d = display[displayKey(selected)] ?? { label: "?", coverUrl: null };
  const isItem = selected.itemType !== null && selected.itemId !== null;
  const memberOf = isItem ? (membership[`${selected.itemType}:${selected.itemId}`] ?? null) : null;
  const nodeLabel = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n ? ((n.labelOverride ?? display[displayKey(n)]?.label) || "?") : "?";
  };
  const incoming = edges.filter((e) => e.toNode === selected.id);
  const outgoing = edges.filter((e) => e.fromNode === selected.id);

  return (
    <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-border bg-surface p-4 lg:w-[300px] lg:border-l lg:border-t-0">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t("inspector")}</h2>
      <p className="font-serif text-base font-semibold leading-tight">{d.label}</p>

      <label className="block">
        <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{t("labelInGraph")}</span>
        <input
          value={selected.labelOverride ?? ""}
          placeholder={d.label}
          onChange={(e) => onPatch(selected.id, { labelOverride: e.target.value || null })}
          className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm"
        />
      </label>

      {isItem && (
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{t("subsagaField")}</span>
          <select
            value={memberOf ?? ""}
            onChange={(e) => onMoveMembership(selected.itemType!, selected.itemId!, e.target.value || null)}
            className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm"
          >
            <option value="">{t("noSubsaga")}</option>
            {childSagas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{t("level")}</span>
          <div className="flex gap-1 rounded-lg bg-surface-muted p-1">
            {(["principal", "menor"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onPatch(selected.id, { level: lvl })}
                className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold ${
                  selected.level === lvl ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {lvl === "principal" ? t("levelPrincipal") : t("levelMinor")}
              </button>
            ))}
          </div>
        </label>
        {isItem && (
          <label className="w-[74px]">
            <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{t("orderNo")}</span>
            <input
              type="number"
              min={1}
              value={selected.orderNo ?? ""}
              onChange={(e) => onPatch(selected.id, { orderNo: e.target.value ? Number(e.target.value) : null })}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-center text-sm"
            />
          </label>
        )}
      </div>
      {selected.orderNo !== null && orderCollisions.includes(selected.orderNo) && (
        <p className="text-[11px] font-semibold text-gold">{t("orderCollision")}</p>
      )}

      <div>
        <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{t("connections")}</span>
        <ul className="divide-y divide-border text-xs">
          {incoming.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5">
              <span className="w-9 shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{t("connIn")}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{nodeLabel(e.fromNode)}</span>
              <button type="button" aria-label={t("removeConnection")} onClick={() => onRemoveEdge(e.id)} className="text-muted-foreground">×</button>
            </li>
          ))}
          {outgoing.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5">
              <span className="w-9 shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{t("connOut")}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{nodeLabel(e.toNode)}</span>
              <button type="button" aria-label={t("removeConnection")} onClick={() => onRemoveEdge(e.id)} className="text-muted-foreground">×</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onRemoveNode(selected.id)}
          className="h-9 w-full rounded-lg border border-red-700/40 bg-red-700/10 text-xs font-semibold text-red-700"
        >
          {t("removeFromGraph")}
        </button>
        <p className="mt-1 text-[10.5px] text-muted-foreground">{t("removeHint")}</p>
      </div>
    </aside>
  );
}
