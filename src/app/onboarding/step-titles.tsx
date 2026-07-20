"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { SuggestionCandidate } from "@/lib/onboarding/rank-suggestions";
import { toggleTitle } from "@/lib/onboarding/actions";
import { ImportPanel } from "./import-panel";

export function StepTitles({
  suggestions,
  nextHref,
}: {
  suggestions: SuggestionCandidate[];
  nextHref: string;
}) {
  const t = useTranslations("onboarding.wizard");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  // "grid" = la rejilla de siempre; "import" = el subidor ocupa su sitio dentro
  // de la MISMA tarjeta, sin cambiar de paso ni de URL.
  const [mode, setMode] = useState<"grid" | "import">("grid");
  const [imported, setImported] = useState(0);

  function toggle(s: SuggestionCandidate) {
    const key = `${s.itemType}:${s.itemId}`;
    const willSelect = !selected.includes(key);
    setSelected((prev) =>
      willSelect ? [...prev, key] : prev.filter((k) => k !== key),
    );
    start(async () => {
      await toggleTitle(s.itemType, s.itemId, willSelect);
    });
  }

  if (mode === "import") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[22px] font-semibold">
            {t("titlesTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("importCta")}</p>
        </div>

        <ImportPanel
          onDone={(added) => setImported(added)}
          onCancel={() => setMode("grid")}
        />

        <Button
          type="button"
          onClick={() => router.push(nextHref)}
          className="w-full justify-center"
        >
          {imported > 0 ? t("continueWithCount", { count: imported }) : t("continue")}
        </Button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-serif text-[22px] font-semibold">
          {t("titlesTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("titlesEmpty")}</p>
        <Button
          type="button"
          onClick={() => router.push(nextHref)}
          className="w-full justify-center"
        >
          {t("continue")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[22px] font-semibold">
          {t("titlesTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("titlesHint")}</p>
      </div>

      <div className="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t("importCta")}</p>
        <Button type="button" variant="secondary" onClick={() => setMode("import")}>
          {t("importAction")}
        </Button>
      </div>

      <p className="text-center font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        {t("importOr")}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {suggestions.map((s) => {
          const key = `${s.itemType}:${s.itemId}`;
          const on = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={on}
              className="flex flex-col gap-1.5 text-left"
            >
              <div
                className={`relative aspect-2/3 w-full overflow-hidden rounded-card border-[1.5px] bg-surface-muted transition-opacity ${
                  on
                    ? "border-accent"
                    : `${MEDIA_ACCENT[s.itemType].borderSoft} opacity-70`
                }`}
              >
                {s.coverUrl && (
                  <Image
                    src={s.coverUrl}
                    alt={s.title}
                    fill
                    sizes="(max-width: 640px) 30vw, 150px"
                    className="object-cover"
                  />
                )}
                {on && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                    ✓
                  </span>
                )}
              </div>
              <span className="line-clamp-2 font-serif text-xs font-semibold">
                {s.title}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={() => router.push(nextHref)}
        disabled={pending}
        className="w-full justify-center"
      >
        {selected.length > 0
          ? t("continueWithCount", { count: selected.length })
          : t("continue")}
      </Button>
    </div>
  );
}
