"use client";

import { useEffect, useState, useTransition } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import type { ActivityDetail, ActivityItem } from "@/lib/clubs/activities/core";
import { getTierlists, setPlacement, clearPlacement } from "@/lib/clubs/activities/tierlist";
import type { TierlistView } from "@/lib/clubs/activities/tierlist-types";
import { UserAvatar } from "@/components/social/user-avatar";
import type { ActivityLayoutProps } from "@/components/clubs/activity-layout";
import { TierRow } from "./tier-row";

const UNPLACED = "unplaced";

// DetailExtension de tierlist (EPIC-05, Bloque H2). Mismo patrón de montaje que los otros tres
// tipos: estado propio con su propio fetch.
//
// Dos caminos para colocar (decisión de diseño):
//   - Arrastrar entre filas (escritorio). Es DnD ENTRE CONTENEDORES, no una lista ordenable
//     como la cola (7.22) -- de ese precedente se reutiliza el id fijo del DndContext (el
//     contador incremental por defecto de dnd-kit rompe la hidratación) y el patrón optimista
//     con rollback.
//   - Tocar una portada y pulsar un tier abajo (táctil y teclado). En móvil ES la vía principal:
//     arrastrar entre contenedores compite con el scroll de la página.
export function TierlistBoard({
  activity,
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
  const [view, setView] = useState<TierlistView | null>(null);
  const [shownUserId, setShownUserId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  useEffect(() => {
    startTransition(async () => {
      const fresh = await getTierlists(activity.id);
      setView(fresh);
    });
    // Recarga también cuando cambia el pool (un curador añadió/quitó un ítem).
  }, [activity.id, activity.items.length]);

  // Ambos early returns con contenido pasan por `Layout`: sin esto, a 1280 el
  // bloque de participantes no aparece en ningún sitio -- el flujo principal
  // lo oculta confiando en que el rail lo repite, pero sin `Layout` ese rail
  // nunca llega a montarse.
  //
  // Inalcanzable hoy: `hasBoard` en `activity-detail.tsx` ya exige
  // `isParticipant` para montar este tablero (tierlist no es `buddy_read`, la
  // única excepción). Se conserva como defensa en profundidad del componente,
  // por si algún día se monta desde otro sitio sin ese gateo.
  if (!activity.viewerIsParticipant) {
    return (
      <Layout
        railExtra={railExtra}
        body={
          <div className="flex flex-col gap-2">
            <h2 className="label-section">
              {t("tierlistTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("tierlistJoinToSee")}</p>
          </div>
        }
      />
    );
  }

  if (!view) {
    return (
      <Layout
        railExtra={railExtra}
        body={
          <div className="flex flex-col gap-2">
            <h2 className="label-section">
              {t("tierlistTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("tierlistNoConfig")}</p>
          </div>
        }
      />
    );
  }

  const board = view.boards.find((b) => b.userId === shownUserId) ?? view.boards[0];
  // Igual que `!view` arriba: pasa por `Layout` para que el rail (y
  // `railExtra`) siga existiendo mientras no hay board que mostrar.
  if (!board) return <Layout railExtra={railExtra} body={null} />;

  const editable = board.isViewer;
  const itemByKey = new Map(activity.items.map((i) => [`${i.itemType}:${i.itemId}`, i]));
  const itemsOf = (keys: string[]): ActivityItem[] =>
    keys.map((k) => itemByKey.get(k)).filter((i): i is ActivityItem => i !== undefined);

  // Mueve un ítem a un tier (o a la bandeja) y persiste. Optimista con rollback: si la escritura
  // falla, se restaura el estado anterior.
  function move(key: string, target: string) {
    if (!editable || !view) return;
    const item = itemByKey.get(key);
    if (!item) return;

    const previous = view;
    const next: TierlistView = {
      ...view,
      boards: view.boards.map((b) => {
        if (!b.isViewer) return b;
        const itemKeysByTier = Object.fromEntries(
          Object.entries(b.itemKeysByTier).map(([tier, keys]) => [
            tier,
            keys.filter((k) => k !== key),
          ]),
        );
        const unplaced = b.unplacedItemKeys.filter((k) => k !== key);
        if (target === UNPLACED) {
          return { ...b, itemKeysByTier, unplacedItemKeys: [...unplaced, key] };
        }
        return {
          ...b,
          itemKeysByTier: {
            ...itemKeysByTier,
            [target]: [...(itemKeysByTier[target] ?? []), key],
          },
          unplacedItemKeys: unplaced,
        };
      }),
    };
    setView(next);
    setSelectedKey(null);

    startTransition(async () => {
      try {
        if (target === UNPLACED) {
          await clearPlacement(activity.id, item.itemType, item.itemId);
        } else {
          const position =
            next.boards.find((b) => b.isViewer)?.itemKeysByTier[target].indexOf(key) ?? 0;
          await setPlacement(activity.id, item.itemType, item.itemId, target, position);
        }
      } catch {
        setView(previous); // rollback
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    move(String(active.id), String(over.id));
  }

  return (
    <Layout
      railExtra={railExtra}
      railTop={
        <div className="flex flex-col gap-3">
          {/* Conmutador de participante: la tuya es editable, las demás de solo lectura. */}
          <div className="flex flex-wrap gap-2">
            {view.boards.map((b) => (
              <button
                key={b.userId}
                type="button"
                onClick={() => {
                  setShownUserId(b.userId);
                  setSelectedKey(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-0.5 text-xs ${
                  b.userId === board.userId
                    ? "border-accent text-accent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserAvatar name={b.displayName || b.username} avatarUrl={b.avatarUrl} size={20} />
                {b.isViewer ? t("tierlistMine") : b.displayName || b.username}
              </button>
            ))}
          </div>

          <h2 className="label-section">
            {board.isViewer
              ? t("tierlistYours")
              : t("tierlistOf", { name: board.displayName || board.username })}
          </h2>
        </div>
      }
      body={
        <div className="flex flex-col gap-3">
          <DndContext
            id="tierlist-board"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col gap-2">
              {view.tiers.map((tier) => (
                <TierRow
                  key={tier.label}
                  id={tier.label}
                  label={tier.label}
                  color={tier.color}
                  items={itemsOf(board.itemKeysByTier[tier.label] ?? [])}
                  editable={editable}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                />
              ))}
            </div>

            <p className="mt-1 label-section">
              {t("tierlistUnplaced", { count: board.unplacedItemKeys.length })}
            </p>
            <TierRow
              id={UNPLACED}
              label=""
              variant="pool"
              items={itemsOf(board.unplacedItemKeys)}
              editable={editable}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          </DndContext>

          {/* Camino táctil y accesible: seleccionas una portada y eliges tier aquí. */}
          {editable && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-muted-foreground">
                {selectedKey ? t("tierlistPickTier") : t("tierlistSelectItem")}
              </p>
              <div className="flex flex-wrap gap-1">
                {view.tiers.map((tier) => (
                  <button
                    key={tier.label}
                    type="button"
                    disabled={!selectedKey}
                    onClick={() => selectedKey && move(selectedKey, tier.label)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-muted disabled:opacity-40"
                  >
                    {tier.color && (
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{ background: tier.color }}
                      />
                    )}
                    {tier.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!selectedKey}
                  onClick={() => selectedKey && move(selectedKey, UNPLACED)}
                  className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-surface-muted disabled:opacity-40"
                >
                  {t("tierlistUnplace")}
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
