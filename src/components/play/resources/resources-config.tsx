"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import { SeatPicker } from "@/components/play/ui/seat-picker";
import { SeatToken, initials } from "@/components/play/ui/seat-token";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourceDef, ResourcesState } from "@/lib/play/resources/types";
import {
  RESOURCES_MAX_DEFS,
  RESOURCES_MAX_PLAYERS,
  RESOURCE_VALUE_MAX,
  RESOURCE_VALUE_MIN,
} from "@/lib/play/resources/reducer";
import { stableColor } from "@/components/play/random/stage/stage-helpers";
import { RESOURCE_ICON_IDS, RESOURCE_PRESETS, ResourceGlyph } from "./resource-icons";

const clampInitial = (n: number) => Math.min(RESOURCE_VALUE_MAX, Math.max(RESOURCE_VALUE_MIN, n));

/**
 * Configuración del gestor (spec visual-first §4): jugadores como fichas,
 * recursos como PRESETS que se crean de un toque (fichas fantasma con glifo),
 * ficha creada que se toca para ajustar inicial/dueño/quitar, y un «+» que
 * abre el constructor de recurso libre — el único input de la pantalla.
 * Antes arrancaba en un campo de texto vacío con emojis del sistema.
 */
export function ResourcesConfig({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
}) {
  const t = useTranslations("play.resources");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resName, setResName] = useState("");
  const [icon, setIcon] = useState("");

  const taken = new Set(state.defs.map((d) => d.name));
  const full = state.defs.length >= RESOURCES_MAX_DEFS;
  const presets = RESOURCE_PRESETS.map((p) => ({ ...p, name: t(p.nameKey) })).filter((p) => !taken.has(p.name));
  const opened = state.defs.find((d) => d.name === open) ?? null;

  const trimmedRes = resName.trim();
  const addValid = trimmedRes !== "" && !taken.has(trimmedRes) && !full;

  function createPreset(name: string, id: string) {
    if (full || taken.has(name)) return;
    emit("resource_added", { name, emoji: id, initial: 0, shared: false });
  }

  function createCustom() {
    if (!addValid) return;
    emit("resource_added", { name: trimmedRes, emoji: icon, initial: 0, shared: false });
    setResName("");
    setIcon("");
    setAdding(false);
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("players")}</p>
      <div className="mt-2">
        <SeatPicker
          identity={identity}
          players={state.players}
          max={RESOURCES_MAX_PLAYERS}
          onChange={(players) => emit("players_set", { players })}
          idPrefix="resources"
        />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("resources")}</p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {state.defs.map((d) => (
          <SeatTokenLike
            key={d.name}
            def={d}
            selected={d.name === open}
            label={t("editResource", { name: d.name })}
            onClick={() => setOpen(open === d.name ? null : d.name)}
          />
        ))}
        {full
          ? null
          : presets.map((p) => (
              <SeatToken
                key={p.id}
                variant="regular"
                caption={p.name}
                label={t("preset", { name: p.name })}
                onClick={() => createPreset(p.name, p.id)}
              >
                <ResourceGlyph icon={p.id} className="h-5 w-5" />
              </SeatToken>
            ))}
        {full ? null : (
          <SeatToken
            variant="add"
            caption={t("custom")}
            label={t("customResource")}
            expanded={adding}
            controls="resources-custom"
            onClick={() => setAdding(!adding)}
          />
        )}
      </div>

      {opened ? <DefPanel def={opened} emit={emit} onRemoved={() => setOpen(null)} /> : null}

      {adding ? (
        <div id="resources-custom" className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
          <input
            autoFocus
            value={resName}
            placeholder={t("resourcePlaceholder")}
            onChange={(e) => setResName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createCustom();
            }}
            aria-label={t("resourceName")}
            className="min-w-0 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("iconPicker")}>
            {RESOURCE_ICON_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={icon === id}
                aria-label={t("iconOption", { name: t(`presets.${id}`) })}
                onClick={() => setIcon(icon === id ? "" : id)}
                className={`flex h-11 w-11 items-center justify-center rounded-chip border ${
                  icon === id ? "border-foreground bg-surface-muted" : "border-border"
                }`}
              >
                <ResourceGlyph icon={id} className="h-5 w-5" />
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!addValid}
            onClick={createCustom}
            className="tap-44 self-start rounded-chip border border-border px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
          >
            {t("create")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Ficha de un recurso creado: color estable, glifo o inicial, y el inicial debajo. */
function SeatTokenLike({
  def,
  selected,
  label,
  onClick,
}: {
  def: ResourceDef;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <span className="flex w-14 flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        aria-expanded={selected}
        aria-controls="resources-def"
        title={def.name}
        onClick={onClick}
        className="flex h-11 w-11 flex-col items-center justify-center rounded-full text-surface [touch-action:manipulation]"
        style={{
          background: stableColor(def.name),
          ...(selected ? { boxShadow: "0 0 0 2px var(--background), 0 0 0 4px var(--accent-ink)" } : {}),
        }}
      >
        <ResourceGlyph icon={def.emoji || initials(def.name)} className="h-5 w-5" />
        <span className="text-[10px] font-semibold tabular-nums">{def.initial}</span>
      </button>
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">{def.name}</span>
    </span>
  );
}

/** Panel de un recurso: inicial con mantener, dueño segmentado y quitar. Cada cambio emite. */
function DefPanel({
  def,
  emit,
  onRemoved,
}: {
  def: ResourceDef;
  emit: CompanionEmit<ResourcesEvent>;
  onRemoved: () => void;
}) {
  const t = useTranslations("play.resources");
  const [preview, setPreview] = useState(0);
  const commit = (total: number) => {
    const initial = clampInitial(def.initial + total);
    setPreview(0);
    if (initial !== def.initial) emit("resource_updated", { name: def.name, initial, shared: def.shared });
  };
  const up = useHoldRepeat({ step: 1, onPreview: setPreview, onCommit: commit });
  const down = useHoldRepeat({ step: -1, onPreview: setPreview, onCommit: commit });
  const seg = (on: boolean) =>
    `tap-44 rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-foreground bg-surface-muted" : "border-border"}`;

  return (
    <div id="resources-def" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={t("fewerInitial")}
          disabled={def.initial <= RESOURCE_VALUE_MIN}
          {...down.handlers}
          className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
        >
          −
        </button>
        <span className="w-14 text-center font-serif text-[20px] font-semibold tabular-nums">
          {clampInitial(def.initial + preview)}
        </span>
        <button
          type="button"
          aria-label={t("moreInitial")}
          disabled={def.initial >= RESOURCE_VALUE_MAX}
          {...up.handlers}
          className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
        >
          +
        </button>
      </span>
      <span className="inline-flex gap-1" role="group" aria-label={t("owner")}>
        <button type="button" aria-pressed={!def.shared} onClick={() => def.shared && emit("resource_updated", { name: def.name, initial: def.initial, shared: false })} className={seg(!def.shared)}>
          {t("ownerPlayers")}
        </button>
        <button type="button" aria-pressed={def.shared} onClick={() => !def.shared && emit("resource_updated", { name: def.name, initial: def.initial, shared: true })} className={seg(def.shared)}>
          {t("ownerBank")}
        </button>
      </span>
      <button
        type="button"
        onClick={() => {
          emit("resource_removed", { name: def.name });
          onRemoved();
        }}
        className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] text-muted-foreground"
      >
        {t("removeResource", { name: def.name })}
      </button>
    </div>
  );
}
