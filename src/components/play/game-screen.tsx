"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { toolViews } from "./tool-views";
import { buttonVariants } from "@/components/ui/button";

/**
 * Isla raíz de `/partida/activa`. Resuelve la herramienta por el `toolId` del
 * snapshot contra el registro de UI (spec §6): esta pantalla no sabe nada de Magic.
 *
 * Sin partida NO se redirige en silencio: se enseña el vacío con salida. Un
 * `router.push` aquí competiría con la navegación que acaba de traernos y dejaría el
 * botón «atrás» roto.
 */
export function GameScreen({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const { snapshot, game, store } = useActiveGame(identity);

  // Hidratando: fieltro vacío, sin mensaje. Pintar «no hay partida» aquí un
  // frame antes de saberlo es el parpadeo que la spec fase 3 §3 prohíbe.
  if (snapshot.status === "loading") {
    return <div className="h-dvh w-full bg-play-felt" />;
  }

  if (!game) {
    return (
      <div className="grid h-dvh w-full place-items-center gap-3 bg-play-felt px-6 text-center">
        <div>
          <p className="font-serif text-[17px] font-semibold">{t("empty.noActiveGame")}</p>
          <Link href="/partidas" className={buttonVariants("primary", "mt-4 px-5 py-2 text-[14px]")}>
            {t("empty.goToHub")}
          </Link>
        </div>
      </div>
    );
  }

  // Terminada, la misma ruta enseña el resumen: la partida no desaparece al acabar,
  // porque de ahí sale la revancha (spec §7, «Finalización»).
  const { Board, Summary } = toolViews[game.state.toolId];
  const Screen = game.state.status === "finished" ? Summary : Board;
  return <Screen game={game} store={store} identity={identity} />;
}
