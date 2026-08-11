import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { TodayHeader } from "./today-header";
import { NextUpCard, type NextUpItem, type NextUpCardItem } from "./next-up-card";

// Estado 2 (nada en curso, pero hay cola): la cabecera pregunta "¿Qué te
// apetece hoy?" y en vez de "En curso" se destaca la próxima lectura. Como el
// estado "En curso", va SIEMPRE en una columna (`today-block`): el destacado
// arriba y, debajo, "Para más tarde" (LaterShelf, pintado en servidor y pasado
// como `later`). La vieja fila de dos columnas se retiró con el rediseño del
// bloque (2026-08-10).
//
// Las etiquetas (tipo de medio + textos del CTA) se resuelven AQUÍ, en
// servidor, y viajan como props a NextUpCard: el Inicio no manda los namespaces
// `today`/`detail` al cliente (route-messages, #444), así que un
// useTranslations dentro de la tarjeta cliente pintaría la clave cruda.
export async function ProximaLectura({
  items,
  later,
}: {
  items: NextUpItem[];
  later: ReactNode;
}) {
  const t = await getTranslations("today");
  const tMedia = await getTranslations("detail.mediaLabel");

  const cardItems: NextUpCardItem[] = items.map((item) => ({
    ...item,
    mediaLabel: tMedia(item.itemType),
  }));

  return (
    <section className="today-block flex flex-col gap-3">
      <TodayHeader title={t("nextUpTitle")} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
            {t("nextUpSection")}
          </span>
          <NextUpCard
            items={cardItems}
            labels={{
              context: t("nextUpContext"),
              start: t("startCta"),
              suggest: t("suggestAnother"),
            }}
          />
        </div>
        {later}
      </div>
    </section>
  );
}
