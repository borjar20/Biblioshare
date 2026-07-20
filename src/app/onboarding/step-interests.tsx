"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { saveInterests } from "@/lib/onboarding/actions";

const TYPES: ItemType[] = ["book", "movie", "series"];

export function StepInterests({ nextHref }: { nextHref: string }) {
  const t = useTranslations("onboarding.wizard");
  const tTypes = useTranslations("search.types");
  const router = useRouter();
  const [chosen, setChosen] = useState<ItemType[]>([]);
  const [pending, start] = useTransition();

  function toggle(type: ItemType) {
    setChosen((prev) =>
      prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type],
    );
  }

  function submit() {
    start(async () => {
      await saveInterests(chosen);
      router.push(nextHref);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[22px] font-semibold">
          {t("interestsTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("interestsHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        {TYPES.map((type) => {
          const on = chosen.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              aria-pressed={on}
              className={`flex items-center gap-3 rounded-card border p-4 text-left transition-colors ${
                on
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span
                aria-hidden
                className={`h-[9px] w-[9px] shrink-0 rounded-full ${MEDIA_ACCENT[type].bg}`}
              />
              <span className="text-[15px] font-semibold">{tTypes(type)}</span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={submit}
        disabled={chosen.length === 0 || pending}
        className="w-full justify-center"
      >
        {t("continue")}
      </Button>
    </div>
  );
}
