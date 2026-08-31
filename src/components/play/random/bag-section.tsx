"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { drawFromBag } from "@/lib/play/random/draws";
import type { BagItem, RandomState } from "@/lib/play/random/types";
import type { RandomEvent } from "@/lib/play/random/events";
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
  const [count, setCount] = useState("");

  const remaining = bag.items.reduce((sum, i) => sum + i.count, 0);
  // Toda edición emite bag_set con la foto completa, y bag_set exige counts
  // >= 1: un tipo agotado por extracciones (count 0) haría que el reducer
  // rechazara la edición EN SILENCIO. La foto que se emite excluye los
  // agotados — reiniciar sigue usando `initial`, que nunca tiene ceros.
  const alive = () => bag.items.filter((i) => i.count > 0).map((i) => ({ ...i }));
  const parsedCount = Number(count || "1");
  const addValid =
    name.trim() !== "" &&
    !bag.items.some((i) => i.name === name.trim()) &&
    Number.isInteger(parsedCount) &&
    parsedCount >= 1;

  function addItem() {
    if (!addValid) return;
    onBagSet([...alive(), { name: name.trim(), count: parsedCount }], bag.withReplacement);
    setName("");
    setCount("");
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

      {/* min-w-0 en el input de nombre: sin él, min-width:auto le impide
          encoger bajo su ancho intrínseco (~20 chars) y la fila desborda el
          viewport móvil de 390px (scroll lateral). */}
      <div className="mt-4 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("itemName")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={count}
          placeholder="1"
          onChange={(e) => setCount(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("itemCount")}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          disabled={!addValid}
          onClick={addItem}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("add")}
        </button>
      </div>

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
                className="rounded-chip border border-border px-2 py-0.5 text-[12px]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={bag.withReplacement}
          onChange={(e) => onBagSet(alive(), e.target.checked)}
        />
        {t("withReplacement")}
      </label>

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
