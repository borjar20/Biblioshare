import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { RouteMessages } from "@/components/route-messages";
import { SpineDraw } from "@/components/rincon/spine-draw";
import type { SorteoCollection, SorteoItem } from "@/components/rincon/sorteo-logic";
import { TodayHeader } from "./today-header";

// Estado 2 (nada en curso, pero hay cola): la cabecera pregunta "¿Qué te
// apetece hoy?" y en vez de destacar UN pendiente con "Empezar"/"Sugerirme
// otro", la elección se deja al SORTEO — la misma ceremonia "Sacar un lomo" del
// Rincón (SpineDraw + SorteoSheet): estantería animada, filtros y, al revelar,
// deja el ítem en curso. La cola completa sigue debajo en "Para más tarde"
// (LaterShelf, pintado en servidor y pasado como `later`).
//
// El sorteo es cliente y usa el namespace `rincon`, que el Inicio NO manda al
// cliente (route-messages, #444: home solo envía activity/feed/social/…). Se
// envuelve SOLO la entrada del sorteo en un <RouteMessages ns={["rincon"]}>, así
// esas cadenas viajan únicamente cuando este estado se pinta, no en cada visita
// al Inicio. `later` queda fuera: se resuelve en servidor y no las necesita.
export async function ProximaLectura({
  pool,
  collections,
  later,
}: {
  pool: SorteoItem[];
  collections: SorteoCollection[];
  later: ReactNode;
}) {
  const t = await getTranslations("today");

  return (
    <section className="today-block flex flex-col gap-3">
      <TodayHeader title={t("nextUpTitle")} />
      <div className="flex flex-col gap-3">
        <RouteMessages ns={["rincon"]}>
          <SpineDraw pool={pool} collections={collections} />
        </RouteMessages>
        {later}
      </div>
    </section>
  );
}
