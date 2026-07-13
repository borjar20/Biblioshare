"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import {
  itemKey,
  type ListChallengeParticipantProgress,
} from "@/lib/clubs/activities/list-challenge-types";
import { itemHref } from "@/lib/catalog/item-href";
import { CheckIcon } from "@/components/ui/icons";

// Rejilla ítems x participantes (EPIC-05 Bloque H3).
//
// Filas = ítems, columnas = participantes, y no al revés: el eje de ítems es el
// ILIMITADO (una lista de 25 libros es normal) y el scroll vertical es gratis;
// el de participantes está acotado por el tamaño del club, así que es el que
// puede vivir en el eje horizontal restringido de un móvil. Transponer pondría
// un número ilimitado de columnas en el eje estrecho -- justo el modo de fallo.
//
// Sin botón de "marcar como hecho" POR DISEÑO: el progreso es derivado de los
// pases de diario. El título de cada ítem enlaza a su ficha, que es donde se
// registra el pase.
export function ListChallengeGrid({
  items,
  participants,
}: {
  items: ActivityItem[];
  participants: ListChallengeParticipantProgress[];
}) {
  const t = useTranslations("activity");

  return (
    // -mx-4/px-4 para que el scroll horizontal viva DENTRO de este contenedor y
    // nunca ensanche la página (es una PWA; el body no debe scrollear en X).
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface p-2 text-left" />
            {participants.map((p) => (
              <th key={p.userId} className="p-2 align-bottom">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="max-w-[5rem] truncate text-[11px] font-medium text-foreground"
                    title={p.displayName || p.username}
                  >
                    {p.displayName || p.username}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.completedKeys.length}/{items.length}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const key = itemKey(item.itemType, item.itemId);
            const doneCount = participants.filter((p) => p.completedKeys.includes(key)).length;

            return (
              <tr key={item.id}>
                <th className="sticky left-0 z-10 border-t border-border bg-surface p-2 text-left font-normal">
                  <Link
                    href={itemHref(item.itemType, item.itemId)}
                    className="flex items-center gap-2 hover:text-accent"
                  >
                    {item.itemCoverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                      <img
                        src={item.itemCoverUrl}
                        alt=""
                        className="h-10 w-7 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="max-w-[10rem] truncate text-xs">{item.itemTitle}</span>
                  </Link>
                </th>

                {participants.map((p) => {
                  const done = p.completedKeys.includes(key);
                  const completedOn = p.completedOnByKey[key];
                  return (
                    <td
                      key={p.userId}
                      className={`border-t border-border p-2 text-center ${
                        p.isViewer ? "bg-accent/5" : ""
                      }`}
                      title={
                        done && completedOn
                          ? t("listChallengeCompletedOn", { date: completedOn })
                          : undefined
                      }
                      aria-label={t("listChallengeCellLabel", {
                        user: p.displayName || p.username,
                        item: item.itemTitle,
                        state: done ? t("listChallengeDone") : t("listChallengePending"),
                      })}
                    >
                      {done ? (
                        <CheckIcon className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-surface-muted" />
                      )}
                    </td>
                  );
                })}

                <td className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">
                  {t("listChallengeItemProgress", {
                    done: doneCount,
                    total: participants.length,
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
