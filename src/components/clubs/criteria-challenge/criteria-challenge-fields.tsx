"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";
import {
  CRITERIA_MODES,
  type CriteriaChallengeConfig,
  type CriteriaMode,
} from "@/lib/clubs/activities/criteria-challenge-types";
import { SagaPicker } from "@/components/saga-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// Campos del criterio en el composer de actividades (EPIC-05, Bloque H4). Se enchufan vía
// ActivityKindDefinition.ConfigFields -- el composer genérico no sabe nada de retos, solo
// pinta lo que el kind aporte y manda el config resultante a proposeActivity.
//
// El criterio se serializa a club_activities.config, el campo jsonb que SD-8 reservó en
// Bloque G y que este bloque estrena.
export function CriteriaChallengeFields({
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const tTypes = useTranslations("search.types");

  const [mode, setMode] = useState<CriteriaMode>("competitive");
  const [itemType, setItemType] = useState<ItemType | "">("");
  const [targetCount, setTargetCount] = useState("");
  const [genre, setGenre] = useState("");
  const [saga, setSaga] = useState<{ id: string; name: string } | null>(null);

  // El config se recompone entero en cada cambio y sube al composer, que solo tiene que
  // pasarlo tal cual al proponer. `onChange` es el setState del composer (estable).
  useEffect(() => {
    const target = Number(targetCount);
    const config: CriteriaChallengeConfig = {
      mode,
      itemType: itemType || null,
      targetCount: Number.isInteger(target) && target > 0 ? target : 0,
      ...(genre.trim() ? { genre: genre.trim() } : {}),
      ...(saga ? { sagaId: saga.id } : {}),
    };
    onChange(config as unknown as Json);
  }, [mode, itemType, targetCount, genre, saga, onChange]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("criteriaMode")}
        <Select
          value={mode}
          onChange={(e) => setMode(e.target.value as CriteriaMode)}
        >
          {CRITERIA_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`criteriaMode_${m}`)}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("criteriaItemType")}
          <Select
            value={itemType}
            onChange={(e) => setItemType((e.target.value || "") as ItemType | "")}
          >
            <option value="">{t("criteriaAnyType")}</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("criteriaTarget")}
          <Input
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("criteriaGenre")}
        <Input
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          placeholder={t("criteriaGenrePlaceholder")}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("criteriaSaga")}
        <SagaPicker value={saga} onChange={setSaga} />
      </label>
    </div>
  );
}
