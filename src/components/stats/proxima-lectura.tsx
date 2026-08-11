import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { TodayHeader } from "./today-header";
import { NextUpCard, type NextUpItem } from "./next-up-card";

// Estado 2 (nada en curso, pero hay cola): la cabecera pregunta "¿Qué te
// apetece hoy?" y en vez de "En curso" se destaca la próxima lectura. El mismo
// grid de dos columnas que el estado 1: destacado a la izquierda, "Para más
// tarde" (LaterShelf, pintado en servidor y pasado como `later`) a la derecha.
export async function ProximaLectura({
  items,
  later,
}: {
  items: NextUpItem[];
  later: ReactNode;
}) {
  const t = await getTranslations("today");
  return (
    <section className="flex flex-col gap-3">
      <TodayHeader title={t("nextUpTitle")} />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
            {t("nextUpSection")}
          </span>
          <NextUpCard items={items} />
        </div>
        {later}
      </div>
    </section>
  );
}
