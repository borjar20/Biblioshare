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
  const { game, store } = useActiveGame(identity);

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

  const { Board } = toolViews[game.state.toolId];
  return <Board game={game} store={store} identity={identity} />;
}
