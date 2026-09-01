"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { drawFromBag } from "@/lib/play/random/draws";
import type { BagItem, RandomState } from "@/lib/play/random/types";
import type { RandomEvent } from "@/lib/play/random/events";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import { BagStage, TokenPile } from "./stage/bag-stage";

/**
 * Bolsa virtual (spec §4): editar tipos, sacar ficha (ponderado por
 * restantes), toggle de reemplazo y reiniciar. Toda edición emite bag_set con
 * la FOTO completa (initial se re-fija a esa foto); reiniciar = bag_set con
 * initial. Sacar resuelve el azar aquí y emite bag_drawn.
 */
export function BagSection({
  bag,
  lastDrawn,
  onBagSet,
  onDraw,
}: {
  bag: RandomState["bag"];
  lastDrawn: RandomEvent | undefined;
  onBagSet: (items: BagItem[], withReplacement: boolean) => void;
  onDraw: (name: string) => void;
}) {
  const t = useTranslations("play.random.bag");
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);
  const [preview, setPreview] = useState(0);
  const [adding, setAdding] = useState(false);
  const commitCount = (total: number) => {
    setCount((c) => Math.min(99, Math.max(1, c + total)));
    setPreview(0);
  };
  const up = useHoldRepeat({ step: 1, onPreview: setPreview, onCommit: commitCount });
  const down = useHoldRepeat({ step: -1, onPreview: setPreview, onCommit: commitCount });
  const stepBtn = "h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]";
  const seg = (on: boolean) => `tap-44 rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-foreground bg-surface-muted" : "border-border"}`;

  const remaining = bag.items.reduce((sum, i) => sum + i.count, 0);
  // Toda edición emite bag_set con la foto completa, y bag_set exige counts
  // >= 1: un tipo agotado por extracciones (count 0) haría que el reducer
  // rechazara la edición EN SILENCIO. La foto que se emite excluye los
  // agotados — reiniciar sigue usando `initial`, que nunca tiene ceros.
  const alive = () => bag.items.filter((i) => i.count > 0).map((i) => ({ ...i }));
  const addValid = name.trim() !== "" && !bag.items.some((i) => i.name === name.trim());

  function addItem() {
    if (!addValid) return;
    onBagSet([...alive(), { name: name.trim(), count }], bag.withReplacement);
    setName("");
    setCount(1);
    setAdding(false);
  }

  const drawn = lastDrawn && lastDrawn.type === "bag_drawn" ? lastDrawn : null;

  return (
    <div>
      <BagStage
        drawn={drawn ? { id: drawn.id, name: drawn.payload.name } : null}
        onDraw={() => onDraw(drawFromBag(bag.items))}
        label={t("draw")}
        disabled={remaining === 0}
        hint={t("drawHint")}
      />

      {/* «+» despliega el único input: nombre, cantidad con stepper y Añadir. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t("addType")}
          aria-expanded={adding}
          aria-controls="bag-add"
          onClick={() => setAdding(!adding)}
          className="tap-44 h-11 w-11 rounded-chip border border-dashed border-border text-[18px] text-muted-foreground"
        >
          +
        </button>
        <span className="inline-flex gap-1" role="group" aria-label={t("replacementMode")}>
          <button type="button" aria-pressed={!bag.withReplacement} onClick={() => bag.withReplacement && onBagSet(alive(), false)} className={seg(!bag.withReplacement)}>
            {t("noReplacement")}
          </button>
          <button type="button" aria-pressed={bag.withReplacement} onClick={() => !bag.withReplacement && onBagSet(alive(), true)} className={seg(bag.withReplacement)}>
            {t("replacement")}
          </button>
        </span>
      </div>
      {adding ? (
        <div id="bag-add" className="mt-2 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
            aria-label={t("itemName")}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label={t("fewer")} disabled={count <= 1} {...down.handlers} className={stepBtn}>−</button>
            <span className="w-8 text-center text-[14px] font-semibold tabular-nums" aria-label={t("itemCount")}>{count + preview}</span>
            <button type="button" aria-label={t("more")} disabled={count >= 99} {...up.handlers} className={stepBtn}>+</button>
          </span>
          <button
            type="button"
            disabled={!addValid}
            onClick={addItem}
            className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
          >
            {t("add")}
          </button>
        </div>
      ) : null}

      {bag.items.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {bag.items.map((item) => (
            <li key={item.name} className="flex items-center justify-between text-[14px]">
              <span className="flex items-center gap-2">
                {item.name} <TokenPile name={item.name} count={item.count} />
              </span>
              <button
                type="button"
                onClick={() =>
                  onBagSet(alive().filter((i) => i.name !== item.name), bag.withReplacement)
                }
                aria-label={t("remove", { name: item.name })}
                className="tap-44 h-11 w-11 rounded-chip border border-border text-[14px]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <span className="text-[13px] text-muted-foreground">{t("remaining", { n: remaining })}</span>
        <button
          type="button"
          disabled={bag.initial.length === 0}
          onClick={() => onBagSet(bag.initial.map((i) => ({ ...i })), bag.withReplacement)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
