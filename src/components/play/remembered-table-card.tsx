"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { rememberTable, rotateStartingSeat } from "@/lib/play/ui/table-memory";
import { seatAccent } from "@/lib/play/ui/seats";
import { buttonVariants } from "@/components/ui/button";
import { useRememberedTable } from "./use-remembered-table";

/**
 * «Tu mesa habitual»: la última mesa usada, jugable en un toque. Existe por las dos
 * conclusiones de la revisión UX 2026-08-30: la fricción real está en la segunda
 * partida de la tarde (los nombres ya se escribieron una vez), y los hubs en
 * escritorio estaban vacíos — esto los llena con contenido REAL del dispositivo, no
 * con promesas de secciones futuras.
 *
 * «Jugar» arranca con el turno rotado un asiento (la convención de revancha: empieza
 * el siguiente); «Ajustar» entra en la configuración por el camino de revancha, que
 * ya prerrellena exactamente esta mesa.
 *
 * Sin mesa recordada no pinta nada: una tarjeta explicando lo que aparecería aquí
 * sería justo la promesa vacía que este hueco vino a quitar.
 */
export function RememberedTableCard({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  const remembered = useRememberedTable(identity);
  const { snapshot, store } = useActiveGame(identity);
  if (!remembered) return null;

  const rotated = rotateStartingSeat(remembered);

  function play() {
    if (!remembered) return;
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    // Mismo contrato que cualquier arranque: empezar ES pedir sustituir la activa.
    if (snapshot.game) store.discard();
    const setup = rotateStartingSeat(remembered);
    if (!store.start(makeEvent("game_started", { toolId: "mtg" as const, setup }, Date.now()))) {
      return;
    }
    rememberTable(identity, setup);
    router.push("/partida/activa");
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {t("rememberedTable.title")}
      </h2>
      <p className="mt-1 font-serif text-[15px] font-semibold">
        {t("setup.modeAndLife", {
          mode: t(`tools.mtg.modes.${remembered.mode}.name`),
          life: remembered.startingLife,
        })}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {remembered.participants.map((participant, seat) => (
          <li key={participant.id} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden className={`${seatAccent(seat).bar} h-4 w-1.5 rounded-full`} />
            <span className="min-w-0 flex-1 truncate">{participant.name}</span>
            {participant.deckName && (
              <span className="truncate text-[11px] text-muted-foreground">
                {participant.deckName}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={play}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-2.5")}
        >
          {t("rememberedTable.play")}
        </button>
        <Link
          href={`/partidas/mtg/nueva?modo=${remembered.mode}&revancha=1`}
          className={buttonVariants("secondary", "w-full justify-center py-2.5")}
        >
          {t("rememberedTable.adjust")}
        </Link>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        {t("rememberedTable.startsNext", {
          name: rotated.participants[rotated.startingSeat].name,
        })}
      </p>
    </section>
  );
}
