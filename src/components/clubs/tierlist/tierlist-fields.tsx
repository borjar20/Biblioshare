"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import { DEFAULT_TIERS, type TierlistConfig } from "@/lib/clubs/activities/tierlist-types";
import { Input } from "@/components/ui/input";

// Campos de configuración de una tierlist en el composer (EPIC-05, Bloque H2). Se enchufan vía
// ActivityKindDefinition.ConfigFields, el hueco que estrenó H4 -- este es su segundo consumidor,
// lo que confirma que la abstracción era la correcta.
//
// Los tiers se escriben como texto separado por comas: es un campo que se rellena UNA vez al
// proponer (luego se congela al activar), así que no merece una UI de chips arrastrables.
export function TierlistFields({
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const [raw, setRaw] = useState(DEFAULT_TIERS.join(", "));

  // El config se recompone en cada cambio y sube al composer, que lo pasa tal cual a
  // proposeActivity. `onChange` es el setState del composer (estable).
  useEffect(() => {
    const tiers = raw
      .split(",")
      .map((tier) => tier.trim())
      .filter(Boolean);
    const config: TierlistConfig = { tiers };
    onChange(config as unknown as Json);
  }, [raw, onChange]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("tierlistTiers")}
        <Input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t("tierlistTiersPlaceholder")}
        />
      </label>
      <p className="text-[11px] text-muted-foreground">{t("tierlistTiersHint")}</p>
    </div>
  );
}
