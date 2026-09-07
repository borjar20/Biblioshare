"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { arrangeBurrow, type BurrowNeighbor, type BurrowPet } from "@/lib/pet/burrow";
import { spriteBox } from "@/lib/pet/manifest";
import { UserAvatar } from "@/components/social/user-avatar";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PetSprite } from "./pet-sprite";

export function Burrow({ own, neighbors, total, followingCount }: {
  own: BurrowPet | null;
  neighbors: BurrowNeighbor[];
  total: number;
  followingCount: number;
}) {
  const t = useTranslations("pet");
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { visible, hidden } = arrangeBurrow(own, neighbors);
  const entries: { key: string; pet: BurrowPet; owner: BurrowNeighbor | null }[] = [
    ...(own ? [{ key: "own", pet: own, owner: null }] : []),
    ...(expanded ? neighbors : visible).map((pet) => ({ key: pet.userId, pet, owner: pet })),
  ];
  // Resolve from current props: removed neighbors must not linger in an open card.
  const current = entries.find((entry) => entry.key === selected);

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 id={`${id}-title`} className="font-serif text-lg font-semibold">{t("burrow.title")}</h2>
      {entries.length > 0 && (
        <ul id={`${id}-pets`} role="list" className="flex flex-wrap items-end gap-x-3 gap-y-8 rounded-card border-b-4 border-border bg-surface-muted px-3 pb-3 pt-8">
          {entries.map(({ key, pet, owner }) => {
            const { box } = spriteBox(pet.stage, pet.petClass);
            const label = owner
              ? t("burrow.spriteLabel", { name: pet.name, class: t(`classes.${pet.petClass}`), stage: t(`stages.${pet.stage}`), owner: owner.username })
              : t("burrow.ownLabel", { name: pet.name, class: t(`classes.${pet.petClass}`), stage: t(`stages.${pet.stage}`) });
            return (
              <li key={key} className="flex w-24 flex-col items-center gap-2">
                <button type="button" aria-label={label} aria-pressed={selected === key} aria-controls={`${id}-detail`}
                  onClick={() => setSelected(selected === key ? null : key)}
                  className="relative cursor-pointer rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent aria-pressed:ring-2 aria-pressed:ring-accent"
                  style={{ width: box.w, height: box.h }}>
                  <span aria-hidden="true" className="pointer-events-none absolute" style={{ left: -box.x, top: -box.y }}>
                    <PetSprite stage={pet.stage} petClass={pet.petClass} mood="neutral" scale={1} label={pet.name} />
                  </span>
                </button>
                <span className="text-xs text-muted-foreground">{t("level", { level: pet.level })}</span>
                <span className="h-4 text-xs text-muted-foreground">{owner ? null : t("burrow.yours")}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!neighbors.length && (
        <EmptyState variant="panel" glyph={<span aria-hidden="true">♧</span>}
          title={t(followingCount === 0 ? "burrow.emptyNoFollows" : "burrow.emptyNoPets")}
          action={followingCount === 0 ? <Link href="/buscar?modo=personas" className={buttonVariants("secondary", "px-4")}>{t("burrow.findPeople")}</Link> : undefined} />
      )}
      {!expanded && hidden.length > 0 && (
        <button type="button" aria-expanded={false} aria-controls={`${id}-pets`} className={buttonVariants("secondary", "self-start px-4")} onClick={() => setExpanded(true)}>
          {t("burrow.showMore")}
        </button>
      )}
      {expanded && total > neighbors.length && (
        <p className="text-sm text-muted-foreground">{t("burrow.limit", { shown: neighbors.length, total })}</p>
      )}
      <div id={`${id}-detail`} role="region" aria-label={t("burrow.detail")} aria-live="polite" aria-atomic="true">
        {current && (
          <div className="flex flex-col gap-2 rounded-card border border-border p-4">
            <h3 className="break-words font-serif text-lg font-semibold">{current.pet.name}</h3>
            <p className="text-sm text-muted-foreground">{t(`classes.${current.pet.petClass}`)} · {t(`stages.${current.pet.stage}`)} · {t("level", { level: current.pet.level })}</p>
            {current.owner && (
              <Link href={`/u/${encodeURIComponent(current.owner.username)}`} className="flex items-center gap-2 self-start text-sm text-accent">
                <UserAvatar name={current.owner.displayName || current.owner.username} avatarUrl={current.owner.avatarUrl} size={32} />
                <span>@{current.owner.username}</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
