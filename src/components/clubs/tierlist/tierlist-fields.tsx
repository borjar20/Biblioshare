"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import {
  DEFAULT_TIERS,
  TIER_COLORS,
  parseTierlistConfig,
  type TierSpec,
} from "@/lib/clubs/activities/tierlist-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { XIcon, ChevronUpIcon, ChevronDownIcon } from "@/components/ui/icons";

// Editor de niveles: etiqueta + color, reordenables.
//
// Antes era un campo de texto con los niveles separados por comas. Funcionaba,
// pero no dejaba ver el resultado ni ponerles color — que es medio sentido de
// una tierlist.
export function TierlistFields({
  value,
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const [tiers, setTiers] = useState<TierSpec[]>(
    () => parseTierlistConfig(value)?.tiers ?? DEFAULT_TIERS,
  );

  // El config sube al composer, que lo pasa tal cual a proposeActivity.
  useEffect(() => {
    onChange({ tiers } as unknown as Json);
  }, [tiers, onChange]);

  function patch(index: number, next: Partial<TierSpec>) {
    setTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, ...next } : tier)),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tiers.length) return;
    setTiers((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border p-3">
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
        {t("tierlistTiers")}
      </span>

      {tiers.map((tier, index) => (
        <div key={index} className="flex items-center gap-2">
          {/* El color cicla por una paleta cerrada. Sin selector libre: acabaría
              en niveles ilegibles sobre el fondo. */}
          <button
            type="button"
            aria-label={t("tierlistTierColor")}
            onClick={() => {
              const current = TIER_COLORS.indexOf(tier.color ?? "");
              patch(index, {
                color: TIER_COLORS[(current + 1) % TIER_COLORS.length],
              });
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-chip border border-border font-serif text-sm font-semibold"
            style={
              tier.color
                ? { background: tier.color, color: "var(--tier-foreground)" }
                : undefined
            }
          >
            {tier.label.slice(0, 2) || "?"}
          </button>

          <Input
            value={tier.label}
            onChange={(e) => patch(index, { label: e.target.value })}
            placeholder={t("tierlistTierLabel")}
            className="w-full"
          />

          <button
            type="button"
            aria-label={t("moveUp")}
            disabled={index === 0}
            onClick={() => move(index, -1)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted disabled:opacity-30"
          >
            <ChevronUpIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t("moveDown")}
            disabled={index === tiers.length - 1}
            onClick={() => move(index, 1)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted disabled:opacity-30"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t("tierlistRemoveTier")}
            onClick={() => setTiers((prev) => prev.filter((_, i) => i !== index))}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-status-dropped"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() =>
          setTiers((prev) => [
            ...prev,
            { label: "", color: TIER_COLORS[prev.length % TIER_COLORS.length] },
          ])
        }
      >
        {t("tierlistAddTier")}
      </Button>

      <p className="text-xs text-muted-foreground">{t("tierlistTiersHint")}</p>
    </div>
  );
}
