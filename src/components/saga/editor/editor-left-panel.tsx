"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ItemPicker, type PickedItem } from "@/components/clubs/item-picker";
import { SagaPicker } from "@/components/saga-picker";
import { SAGA_ACCENT, SAGA_ACCENT_SEQUENCE, type SagaAccentToken } from "@/lib/sagas/accents";
import { createChildSaga, nestExistingSaga, updateSagaAccent } from "@/lib/sagas/editor-actions";
import type { EdgeTool } from "./saga-graph-editor";

export type ChildSagaRef = { id: string; name: string; accentColor: string | null };

// Paleta del editor SIN beige (reservado al nexo, DEFER F1/F4).
const PALETTE = SAGA_ACCENT_SEQUENCE;

export function EditorLeftPanel({
  sagaId,
  childSagas,
  accentBySaga,
  countBySaga,
  edgeTool,
  onEdgeTool,
  onAddItem,
  onAddSagaNode,
  onChildrenChange,
}: {
  sagaId: string;
  childSagas: ChildSagaRef[];
  accentBySaga: Map<string | null, SagaAccentToken>;
  countBySaga: Map<string | null, number>;
  edgeTool: EdgeTool;
  onEdgeTool: (t: EdgeTool) => void;
  onAddItem: (item: PickedItem) => void;
  onAddSagaNode: (child: { id: string; name: string }) => void;
  onChildrenChange: (children: ChildSagaRef[]) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [picking, setPicking] = useState(false);
  const [nesting, setNesting] = useState(false);
  const [nestValue, setNestValue] = useState<{ id: string; name: string } | null>(null);
  const [nestError, setNestError] = useState(false);
  const [newName, setNewName] = useState("");
  const [newError, setNewError] = useState(false);

  async function submitNewSubsaga() {
    const name = newName.trim();
    if (!name) return;
    setNewError(false);
    const result = await createChildSaga(sagaId, name);
    if ("id" in result) {
      onChildrenChange([...childSagas, { ...result, accentColor: null }]);
      setNewName("");
      return;
    }
    setNewError(true);
  }

  async function submitNest(saga: { id: string; name: string } | null) {
    setNestValue(saga);
    setNestError(false);
    if (!saga) return;
    const result = await nestExistingSaga(sagaId, saga.id);
    if (result.error) {
      setNestError(true);
      setNestValue(null);
      return;
    }
    onChildrenChange([...childSagas, { id: saga.id, name: saga.name, accentColor: null }]);
    onAddSagaNode(saga);
    setNesting(false);
    setNestValue(null);
  }

  async function cycleAccent(child: ChildSagaRef) {
    const current = accentBySaga.get(child.id);
    const idx = current ? PALETTE.indexOf(current as (typeof PALETTE)[number]) : -1;
    const next = PALETTE[(idx + 1) % PALETTE.length];
    const result = await updateSagaAccent(child.id, next);
    if (!result.error) {
      onChildrenChange(childSagas.map((c) => (c.id === child.id ? { ...c, accentColor: next } : c)));
    }
  }

  return (
    <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-b border-border bg-surface p-4 lg:w-[272px] lg:border-b-0 lg:border-r">
      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t("addTitle")}</h2>
        {picking ? (
          <ItemPicker allowedItemTypes="all" onPick={(item) => { onAddItem(item); setPicking(false); }} onCancel={() => setPicking(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="h-9 w-full rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground"
          >
            ⌕ {t("searchCatalog")}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t("subsagas")}</h2>
        <ul className="space-y-1.5">
          {childSagas.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
              <button
                type="button"
                aria-label={t("cycleColor", { name: c.name })}
                onClick={() => cycleAccent(c)}
                className={`h-3 w-3 shrink-0 rounded-sm ${SAGA_ACCENT[accentBySaga.get(c.id) ?? "terracota"].bg}`}
              />
              <button type="button" onClick={() => onAddSagaNode(c)} className="min-w-0 flex-1 truncate text-left text-xs font-semibold">
                {c.name}
              </button>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{countBySaga.get(c.id) ?? 0}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNewError(false);
            }}
            placeholder={t("newSubsagaPrompt")}
            aria-label={t("newSubsagaPrompt")}
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs"
          />
          <button type="button" onClick={submitNewSubsaga} className="h-8 shrink-0 rounded-lg bg-accent px-2.5 text-xs font-semibold text-accent-foreground">
            ＋
          </button>
        </div>
        {newError && <p className="mt-1 text-[11px] text-red-600">{t("createError")}</p>}
        {nesting ? (
          <div className="mt-2">
            <SagaPicker value={nestValue} onChange={submitNest} />
            {nestError && <p className="mt-1 text-[11px] text-red-600">{t("cycleError")}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setNesting(true)} className="mt-2 text-[11px] font-semibold text-accent">
            {t("nestExisting")}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t("tools")}</h2>
        <div className="space-y-1.5 rounded-xl bg-surface-muted p-2.5">
          {(["principal", "opcional", "requisito"] as const).map((kind) => (
            <label key={kind} className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="radio" name="edge-tool" checked={edgeTool === kind} onChange={() => onEdgeTool(kind)} className="accent-[#b0542f]" />
              <span
                className={`w-7 border-t-[2.5px] ${
                  kind === "principal" ? "border-foreground" : kind === "opcional" ? "border-dashed border-gold" : "border-dotted border-spine"
                }`}
              />
              {t(kind === "principal" ? "edgePrincipal" : kind === "opcional" ? "edgeOptional" : "edgeRequisite")}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">{t("toolConnectHint")}</p>
      </section>
    </aside>
  );
}
