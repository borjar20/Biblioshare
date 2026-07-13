"use client";

import { useEffect, useState, useTransition } from "react";
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
}: {
  activity: ActivityDetail;
  viewerId: string;
  isModerator: boolean;
  onChanged: () => void;
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

  if (!activity.viewerIsParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("tierlistTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("tierlistJoinToSee")}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("tierlistTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("tierlistNoConfig")}</p>
      </div>
    );
  }

  const board = view.boards.find((b) => b.userId === shownUserId) ?? view.boards[0];
  if (!board) return null;

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
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("tierlistTitle")}</h2>

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
            className={`rounded-full border px-3 py-1 text-xs ${
              b.userId === board.userId
                ? "border-accent text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {b.isViewer ? t("tierlistMine") : b.displayName || b.username}
          </button>
        ))}
      </div>

      <DndContext
        id="tierlist-board"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-2">
          {view.tiers.map((tier) => (
            <TierRow
              key={tier}
              id={tier}
              label={tier}
              items={itemsOf(board.itemKeysByTier[tier] ?? [])}
              editable={editable}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          ))}

          <TierRow
            id={UNPLACED}
            label={t("tierlistUnplacedShort")}
            items={itemsOf(board.unplacedItemKeys)}
            editable={editable}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>
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
                key={tier}
                type="button"
                disabled={!selectedKey}
                onClick={() => selectedKey && move(selectedKey, tier)}
                className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-muted disabled:opacity-40"
              >
                {tier}
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
  );
}
