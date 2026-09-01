"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourceDef, ResourcesState } from "@/lib/play/resources/types";
import { valueOf } from "@/lib/play/resources/selectors";
import { stableColor } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";
import { HoldRepeatButton } from "./hold-repeat-button";

const QUICK_DELTAS = [5, 10, -5, -10];

function Row({
  def,
  value,
  onAdjust,
  testId,
}: {
  def: ResourceDef;
  value: number;
  onAdjust: (delta: number) => void;
  testId: string;
}) {
  const t = useTranslations("play.resources");
  // preview: acumulado del mantener-pulsado — el número corre en pantalla
  // antes de emitirse el evento único al soltar.
  const [preview, setPreview] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-6 w-1 shrink-0 rounded-full"
          style={{ background: stableColor(def.name) }}
        />
        <span className="min-w-0 flex-1 truncate text-[14px]">
          {def.emoji ? `${def.emoji} ` : ""}
          {def.name}
        </span>
        <HoldRepeatButton
          direction={-1}
          label={t("decrease", { name: def.name })}
          onPreview={setPreview}
          onCommit={onAdjust}
        />
        <span
          data-testid={testId}
          className="w-16 text-center font-serif text-[28px] font-semibold tabular-nums"
        >
          {value + preview}
        </span>
        <HoldRepeatButton
          direction={1}
          label={t("increase", { name: def.name })}
          onPreview={setPreview}
          onCommit={onAdjust}
        />
        <button
          type="button"
          aria-expanded={quickOpen}
          aria-label={t("quick", { name: def.name })}
          onClick={() => setQuickOpen(!quickOpen)}
          className="rounded-chip border border-border px-2 py-1 text-[12px]"
        >
          ±
        </button>
      </div>
      {quickOpen ? (
        <div className="mt-1 flex justify-end gap-2">
          {QUICK_DELTAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onAdjust(d)}
              className="rounded-chip border border-border px-3 py-1 text-[13px] tabular-nums"
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tablero del gestor: tarjeta «Banco» con los compartidos y una por jugador
 * con sus recursos. Toque ±1, mantener acumula y emite UNO, chips ±5/±10.
 */
export function ResourcesBoard({
  state,
  emit,
}: {
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
}) {
  const t = useTranslations("play.resources");
  const sharedDefs = state.defs.filter((d) => d.shared);
  const playerDefs = state.defs.filter((d) => !d.shared);

  const adjust = (resource: string, owner: string | null) => (delta: number) => {
    if (delta !== 0) emit("adjusted", { resource, owner, delta });
  };

  return (
    <div className="space-y-3">
      {sharedDefs.length > 0 ? (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("bank")}
          </h2>
          <div className="mt-2 space-y-2">
            {sharedDefs.map((def) => (
              <Row
                key={def.name}
                def={def}
                value={valueOf(state, def.name, null) ?? 0}
                onAdjust={adjust(def.name, null)}
                testId={`res-bank-${def.name}`}
              />
            ))}
          </div>
        </section>
      ) : null}
      {playerDefs.length > 0
        ? state.players.map((player, i) => (
            <section key={player} className="rounded-card border border-border bg-surface p-4">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})` }}
                />
                {player}
              </h2>
              <div className="mt-2 space-y-2">
                {playerDefs.map((def) => (
                  <Row
                    key={def.name}
                    def={def}
                    value={valueOf(state, def.name, player) ?? 0}
                    onAdjust={adjust(def.name, player)}
                    testId={`res-${i}-${def.name}`}
                  />
                ))}
              </div>
            </section>
          ))
        : null}
    </div>
  );
}
