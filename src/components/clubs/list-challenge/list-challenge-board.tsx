"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ActivityDetail, ActivityItem } from "@/lib/clubs/activities/core";
import { getListChallengeProgress } from "@/lib/clubs/activities/list-challenge";
import {
  itemKey,
  readCompletionMode,
  type ListChallengeProgressView,
} from "@/lib/clubs/activities/list-challenge-types";
import { itemHref } from "@/lib/catalog/item-href";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { MemberRankRow } from "@/components/clubs/member-rank-row";
import { ListChallengeSummary } from "./list-challenge-summary";
import { ListChallengeGrid } from "./list-challenge-grid";
import { ItemConnectSheet } from "./item-connect-sheet";

// DetailExtension de list_challenge (registro de kinds, EPIC-05 Bloque H3).
// Mismo patrón de montaje que BuddyReadCheckpoints (H1): estado propio + su
// propio refresh, sin arrastrar al resto de la ficha de actividad.
//
// A diferencia de los checkpoints de H1 (visibles a todo el club para decidir
// si unirse), el tablero es SOLO PARA PARTICIPANTES -- coherente con la RPC,
// que no devuelve nada a un no-participante, y con las opiniones, que ya son
// solo-participantes desde SD-8.
//
// Layout del mockup (Paper · Clubes, frame de reto de lista): anillo con tu
// avance, tu rejilla de portadas y la clasificación del club. La matriz
// ítems x participantes se conserva plegada en un <details> -- es la única
// vista con el detalle de quién completó qué.
export function ListChallengeBoard({
  activity,
  viewerId,
  isModerator,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [view, setView] = useState<ListChallengeProgressView | null>(null);
  const [, startTransition] = useTransition();
  const [sheetItem, setSheetItem] = useState<ActivityItem | null>(null);
  const isCurator = isModerator || activity.createdBy === viewerId;
  const canConnect = isCurator && activity.status === "active";

  useEffect(() => {
    startTransition(async () => {
      const fresh = await getListChallengeProgress(activity.id);
      setView(fresh);
    });
    // Recarga también cuando cambia el pool (un curador añadió/quitó un ítem):
    // la rejilla se materializa cruzando el pool con el roster.
  }, [activity.id, activity.items.length]);

  if (activity.items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("listChallengeProgress")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("listChallengeEmptyList")}</p>
      </div>
    );
  }

  if (!activity.viewerIsParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("listChallengeProgress")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("listChallengeJoinToSee")}</p>
      </div>
    );
  }

  if (!view) return null;

  const viewer = view.participants.find((p) => p.isViewer);
  // Clasificación: completados desc, desempate estable por username.
  const ranked = [...view.participants].sort(
    (a, b) =>
      b.completedKeys.length - a.completedKeys.length ||
      (a.username ?? "").localeCompare(b.username ?? ""),
  );
  const viewerRank = ranked.findIndex((p) => p.isViewer) + 1;
  const completionMode = readCompletionMode(activity.config);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("listChallengeProgress")}
      </h2>

      <ListChallengeSummary
        itemCount={activity.items.length}
        viewerCompleted={viewer?.completedKeys.length ?? 0}
        position={viewerRank}
        participantCount={view.participants.length}
      />

      <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("listChallengeList")}
      </h3>
      <div className="grid grid-cols-5 gap-2">
        {activity.items.map((item) => {
          const done = viewer?.completedKeys.includes(itemKey(item.itemType, item.itemId)) ?? false;
          const itemClassName =
            "relative aspect-[2/3] overflow-hidden rounded-[5px] border border-border bg-surface-muted";
          const cover = (
            <>
              {item.itemCoverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                <img
                  src={item.itemCoverUrl}
                  alt={item.itemTitle}
                  className={`h-full w-full object-cover ${done ? "" : "opacity-55"}`}
                />
              )}
              {done && (
                <span className="absolute inset-0 grid place-items-center bg-status-completed/55">
                  <CheckIcon className="h-4 w-4 text-accent-foreground" />
                </span>
              )}
            </>
          );
          // canConnect (curador/mod + reto activo): el ítem abre la hoja de conexión (frame 14)
          // en vez de ir directo a su ficha -- desde ahí también se puede llegar a la ficha.
          return canConnect ? (
            <button
              key={item.id}
              type="button"
              title={item.itemTitle}
              onClick={() => setSheetItem(item)}
              className={itemClassName}
            >
              {cover}
            </button>
          ) : (
            <Link
              key={item.id}
              href={itemHref(item.itemType, item.itemId)}
              title={item.itemTitle}
              className={itemClassName}
            >
              {cover}
            </Link>
          );
        })}
      </div>

      <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("listChallengeRanking")}
      </h3>
      <div className="flex flex-col">
        {ranked.map((p) => (
          <MemberRankRow
            key={p.userId}
            name={p.displayName || p.username}
            avatarUrl={p.avatarUrl}
            isViewer={p.isViewer}
            percent={
              activity.items.length > 0
                ? (p.completedKeys.length / activity.items.length) * 100
                : 0
            }
            counter={`${p.completedKeys.length}/${activity.items.length}`}
            fill="accent"
          />
        ))}
      </div>

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <ChevronDownIcon
            aria-hidden
            className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          />
          {t("listChallengeMatrix")}
        </summary>
        <div className="mt-3">
          <ListChallengeGrid items={activity.items} participants={view.participants} />
        </div>
      </details>

      {/* Esta línea es lo que hace legible la regla del reto: el progreso es
          DERIVADO, no se marca a mano -- y qué lo deriva depende de la modalidad
          (H3b). Sin ella, la rejilla es un misterio. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {completionMode === "any"
          ? t("listChallengeRuleOpen")
          : t("listChallengeRule", { start: view.windowStart, end: view.windowEnd })}
      </p>

      <ItemConnectSheet
        parentActivityId={activity.id}
        item={sheetItem}
        open={sheetItem !== null}
        onClose={() => setSheetItem(null)}
      />
    </div>
  );
}
