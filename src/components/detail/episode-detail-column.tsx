"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import type { GridSource } from "./episode-grid";
import { EpisodeInlineDetail } from "./episode-detail";

export type EpisodeDetailColumnProps = {
  /** El episodio elegido, o null → estado vacío. */
  episode: EpisodeRow | null;
  own: OwnWatch | null;
  source: GridSource;
  interactive: boolean;
  isPending: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  markUpToCount: number;
  onMarkUpTo: () => void;
  /**
   * Cambia (a un valor no nulo) solo cuando el usuario elige un episodio a
   * propósito en PC — nunca en el montaje ni al cambiar de temporada. Mueve
   * el foco al título de la columna para que el teclado no tenga que
   * atravesar el resto de filas (revisión final PR 4).
   */
  focusKey: string | null;
  /**
   * Llamado justo tras aplicar el foco al título. El panel lo usa para
   * consumir el token (volverlo a null): sin esto, remontar la columna con
   * el mismo focusKey (p.ej. lista → grid → lista) roba el foco sin que el
   * usuario haya elegido nada (revisión final PR 4).
   */
  onFocused?: () => void;
};

// La tercera columna del frame PC·1 (ficha cinemática, PR 4): el detalle del
// episodio elegido, anclado a la derecha mientras se recorre la lista. En móvil
// no existe: allí el mismo detalle se despliega bajo su fila (EpisodeList).
// Reutiliza EpisodeInlineDetail tal cual —metadatos, sinopsis, reseña y
// «vistos hasta aquí»— y le pone encima el fotograma y el título, que en la
// fila ya se ven pero aquí la columna está sola.
export function EpisodeDetailColumn({
  episode,
  own,
  focusKey,
  onFocused,
  ...detail
}: EpisodeDetailColumnProps) {
  const t = useTranslations("episode");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Solo reacciona a un focusKey no nulo: el panel lo deja en null al montar
  // y al cambiar de temporada, así que aquí nunca se roba el foco por eso —
  // solo cuando el usuario elige un episodio a propósito. Se avisa al padre
  // justo después con `onFocused` para que consuma el token: si no, un
  // remontaje posterior (lista → grid → lista) vería el mismo focusKey ya
  // "gastado" y robaría el foco sin que el usuario haya elegido nada.
  useEffect(() => {
    if (focusKey !== null) {
      headingRef.current?.focus();
      onFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  if (!episode || !own) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
        {t("pickEpisode")}
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4">
      {episode.stillUrl && (
        <span className="relative mb-3.5 block aspect-video w-full overflow-hidden rounded-[8px] bg-surface-3">
          <Image src={episode.stillUrl} alt="" fill sizes="340px" className="object-cover" />
        </span>
      )}
      <span className="font-mono text-[10.5px] text-muted-foreground">
        {t("code", { s: episode.season, e: episode.episode })}
      </span>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 rounded-sm font-serif text-[18px] leading-tight font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-type-series/40"
      >
        {episode.title ?? t("untitled")}
      </h3>
      <EpisodeInlineDetail episode={episode} own={own} {...detail} />
    </div>
  );
}
