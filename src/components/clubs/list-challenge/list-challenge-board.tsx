"use client";

import { useEffect, useState, useTransition } from "react";
import type { ComponentType, ReactNode } from "react";
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
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
import { ListChallengeSummary } from "./list-challenge-summary";
import { ListChallengeGrid } from "./list-challenge-grid";
import { ItemConnectSheet } from "./item-connect-sheet";
import { LinkedActivities } from "./linked-activities";

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
  clubSlug,
  Layout,
  railExtra,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
  clubSlug: string;
  Layout: ComponentType<ActivityLayoutProps>;
  railExtra: ReactNode;
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

  // Los dos early returns con contenido (pool vacío, no-participante) pasan
  // por `Layout`: si no, a 1280 el bloque de participantes no aparece en
  // ninguna parte (el flujo lo oculta confiando en el rail, pero sin `Layout`
  // ese rail nunca llega a existir). `LinkedActivities` NO va en su
  // `railBottom` aquí -- ese reparto es solo del camino de participante, más
  // abajo; para un no-participante, `activity-detail.tsx` ya la pinta directa
  // (hasBoard es estrecho: este tablero, para `list_challenge`, solo se monta
  // si `isParticipant`). Consecuencia: el early return de `!viewerIsParticipant`
  // de aquí abajo queda inalcanzable (el padre ya no monta este componente
  // para un no-participante) -- se conserva como defensa del componente, no se
  // borra. El de `!view` (mientras carga) también pasa por `Layout`, con el
  // cuerpo vacío: los participantes llegan por props del SSR, no del fetch, así
  // que se pintan desde el primer frame en vez de aparecer de golpe al resolver.
  if (activity.items.length === 0) {
    return (
      <Layout
        railExtra={railExtra}
        body={
          <div className="flex flex-col gap-2">
            <h2 className="label-section">
              {t("listChallengeProgress")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("listChallengeEmptyList")}</p>
          </div>
        }
      />
    );
  }

  // Inalcanzable hoy: `hasBoard` en `activity-detail.tsx` ya gatea el montaje
  // de este tablero a `isParticipant` para `list_challenge` (a diferencia de
  // `buddy_read`). Se conserva como defensa en profundidad del componente.
  if (!activity.viewerIsParticipant) {
    return (
      <Layout
        railExtra={railExtra}
        body={
          <div className="flex flex-col gap-2">
            <h2 className="label-section">
              {t("listChallengeProgress")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("listChallengeJoinToSee")}</p>
          </div>
        }
      />
    );
  }

  if (!view) return <Layout railExtra={railExtra} body={null} />;

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
    <Layout
      railExtra={railExtra}
      railTop={
        <div className="flex flex-col gap-3">
          <h2 className="label-section">
            {t("listChallengeProgress")}
          </h2>
          <ListChallengeSummary
            itemCount={activity.items.length}
            viewerCompleted={viewer?.completedKeys.length ?? 0}
            position={viewerRank}
            participantCount={view.participants.length}
          />
        </div>
      }
      body={
        <div className="flex flex-col gap-3">
          <h3 className="label-section">
            {t("listChallengeList")}
          </h3>
          {/* En PC la rejilla gana ancho: 8 columnas como el frame 2 del mockup. */}
          <div className="grid grid-cols-5 gap-2 lg:grid-cols-8">
            {activity.items.map((item) => {
              const done =
                viewer?.completedKeys.includes(itemKey(item.itemType, item.itemId)) ?? false;
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

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 label-section">
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
              DERIVADO, no se marca a mano -- y qué lo deriva depende de la
              modalidad (H3b). Sin ella, la rejilla es un misterio. */}
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
      }
      railBottom={
        <div className="flex flex-col gap-3">
          <h3 className="label-section">
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
          <LinkedActivities activity={activity} isCurator={isCurator} clubSlug={clubSlug} />
        </div>
      }
    />
  );
}
