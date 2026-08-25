"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  EMOJI_GROUPS,
  emojisByGroup,
  searchEmojis,
  type EmojiEntry,
} from "@/lib/social/emoji-catalog";
import { isEmojiSupported } from "@/lib/social/emoji-support";

// Selector completo. Se carga con next/dynamic desde el ReactionBar para que el
// catálogo (153 KB en crudo, 1.906 entradas) no viaje en el bundle del feed.
//
// Sin virtualización a propósito: se pinta SOLO la categoría activa (la mayor,
// Caras, ronda 180 entradas) y la búsqueda corta en 100. Una ventana virtual
// para 1.900 botones es complejidad que este caso no paga.
//
// Ancho y columnas: `min-[1023px]:` es el corte de escritorio de este repo
// (ver post-aside.tsx), no `sm:`/`lg:`. En ESCRITORIO el panel sigue siendo
// un popover de ancho fijo anclado al botón (28rem/12 columnas, más alto:
// 20rem en vez de 14rem — hay sitio de sobra y quedarse en el ancho de móvil
// sería pequeño sin motivo). En MÓVIL ya no hay un ancho propio (`w-full`):
// el selector es una hoja inferior a ancho de pantalla (reaction-bar.tsx),
// así que un `19rem` fijo aquí dejaba una banda en blanco a la derecha en
// cuanto la hoja era más ancha que eso — el `w-[19rem]` original asumía que
// el contenedor SIEMPRE medía justo eso, y dejó de ser cierto en cuanto el
// selector pasó a colgar de la hoja en vez del botón.
//
// Columnas en móvil: en vez de un `grid-cols-8` fijo (pensado para los 19rem
// de antes), `repeat(auto-fill,minmax(2.75rem,1fr))` deja que el propio grid
// calcule cuántas caben — 2.75rem (44px) es el mismo suelo de tamaño táctil
// que usa `tap-44` en el resto del repo. Así, cuanto más ancha la hoja, MÁS
// columnas entran (a ~44px cada una), en vez de estirar siempre las mismas 8
// hasta celdas gigantes en un móvil grande. En escritorio el panel es de
// ancho fijo, así que ahí sigue teniendo sentido un número fijo de columnas
// (12) en vez de `auto-fill`.
export function EmojiPicker({
  onPick,
  onBack,
  atCap = false,
  isDisabled,
}: {
  onPick: (emoji: string) => void;
  onBack: () => void;
  /** Al llegar al tope se avisa, aunque el emoji en pantalla siga siendo pulsable. */
  atCap?: boolean;
  /**
   * Qué botones deshabilitar. El ReactionBar es quien conoce el mapa de
   * reacciones del viewer, así que decide él: al llegar al tope se bloquean
   * los emojis nuevos, pero el viewer puede seguir quitando los suyos.
   */
  isDisabled?: (emoji: string) => boolean;
}) {
  const t = useTranslations("social");
  const [group, setGroup] = useState(0);
  const [query, setQuery] = useState("");

  // Filtrado por soporte real del dispositivo, calculado en el render (nada
  // de useEffect: el repo exige set-state-in-effect limpio y este componente
  // ya vivía sin efectos). `isEmojiSupported` cachea a nivel de módulo, así
  // que memorizar aquí solo evita recrear el array filtrado en renders que no
  // cambian ni la categoría ni la búsqueda — la medición cara ya está resuelta
  // la primera vez que se ve cada emoji. Se filtra solo lo que se va a pintar
  // (categoría activa o resultados de búsqueda, como mucho un par de cientos),
  // nunca las 1.906 entradas del catálogo de golpe.
  const results: EmojiEntry[] = useMemo(() => {
    const raw = query.trim() ? searchEmojis(query) : emojisByGroup(group);
    return raw.filter((entry) => isEmojiSupported(entry.e));
  }, [query, group]);

  return (
    // `min-h-0 flex-1` (mobile): permite que ESTE contenedor se encoja por
    // debajo de su alto de contenido cuando el `<dialog>` padre lo topa con
    // `max-h-[60svh]` (reaction-bar.tsx) — sin esto, un flex-item se resiste
    // a bajar de su tamaño «natural» y el tope de arriba no llegaría a la
    // rejilla, que es la que de verdad necesita encogerse y scrollear. En
    // escritorio es inofensivo: el `<dialog>` no tiene `max-h` ahí
    // (`min-[1023px]:max-h-none`), así que nunca hay hueco que repartir y
    // `flex-1`/`min-h-0` no cambian nada.
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2 min-[1023px]:w-[28rem]">
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("emojiPicker.back")}
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ←
        </button>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("emojiPicker.search")}
          aria-label={t("emojiPicker.search")}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
        />
      </div>

      {!query.trim() && (
        // Sigue necesitando desplazarse en móviles estrechos (9 categorías no
        // caben en unos 300-350px), pero la barra no debe verse — mismo
        // patrón que post-aside.tsx. En escritorio (28rem) puede que ya
        // quepan todas sin scroll, pero el fix es el mismo en ambos casos.
        // `shrink-0`: esta tira nunca cede su alto — el que se encoge (y
        // scrollea) cuando falta sitio es solo el grid de abajo.
        <div className="flex shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                group === g.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {atCap && (
        <p className="shrink-0 text-[11px] text-muted-foreground">{t("emojiPicker.capReached")}</p>
      )}

      {results.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {t("emojiPicker.noResults")}
        </p>
      ) : (
        // `overflow-x-hidden` explícito: si se deja en `visible` (el valor por
        // defecto), CSS lo computa como `auto` en cuanto el eje Y deja de ser
        // `visible` (por el `overflow-y-auto` de al lado). Esa barra horizontal
        // fantasma le roba unos px al ancho, el contenido desborda por muy
        // poco y aparece una barra que nadie pidió — en Windows, donde las
        // barras siempre ocupan sitio, eso se suma a la vertical y a la de la
        // tira de categorías: tres barras a la vez.
        //
        // Alto en móvil: `max-h-56` (14rem fijo) era el tope REAL de toda la
        // hoja — un valor pensado para cuando esto era un popover colgado
        // del botón, nadie lo revisó al pasar a hoja inferior, y dejaba
        // 60-65% de la pantalla en blanco por encima con solo 4 filas
        // visibles. Se cambia a `flex-1 min-h-0`: el grid pasa a ocupar
        // TODO el alto que le sobra al `<dialog>` (que es quien pone el
        // límite real ahora, `max-h-[60svh]` en reaction-bar.tsx) una vez
        // descontados el buscador y la tira de categorías — y sigue
        // scrolleando internamente (`overflow-y-auto`, ya estaba) lo que no
        // quepa. En escritorio se mantiene `min-[1023px]:max-h-80` fijo, sin
        // cambios: ahí el panel no tiene ancestro con `max-h` que repartir
        // (`min-[1023px]:max-h-none` en el `<dialog>`), así que `flex-1` no
        // hace nada y sigue siendo el tope de 20rem de siempre.
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-0.5 overflow-x-hidden overflow-y-auto min-[1023px]:max-h-80 min-[1023px]:grid-cols-12">
          {results.map((entry) => (
            <button
              key={entry.e}
              type="button"
              disabled={isDisabled?.(entry.e) ?? false}
              aria-label={entry.n}
              title={atCap && isDisabled?.(entry.e) ? t("emojiPicker.capReached") : entry.n}
              onClick={() => onPick(entry.e)}
              // `min-h-11` (44px) es el alto REAL del botón en móvil, no un
              // área táctil invisible: se descartó `tap-44` a propósito. Esa
              // utilidad crece un `::after` centrado en la CAJA del control
              // sin tocar el dibujo, pensada para un icono aislado con margen
              // alrededor (el disparador «⋯», el cierre de una hoja). Aquí no
              // hay margen: es una rejilla sin huecos (`gap-0.5`), así que el
              // `::after` de 44px de una celda invadiría la fila de arriba y
              // la de abajo — el mismo "le roba clics al vecino" que ya
              // explica `tap-44` para el ratón, aquí con el dedo. La única
              // forma de dar 44px reales sin pisar al vecino es que la fila
              // ocupe 44px de verdad, así que se agranda la CAJA (con
              // `flex items-center justify-center` para recentrar el emoji
              // dentro), no un halo invisible encima. `min-[1023px]:min-h-0`
              // lo revierte en escritorio: ahí el panel es de ratón y el
              // tamaño compacto actual es la decisión ya tomada, sin motivo
              // para agrandarlo.
              className="flex min-h-11 items-center justify-center rounded p-1 text-lg leading-none transition-colors hover:bg-surface-muted disabled:opacity-40 min-[1023px]:min-h-0"
            >
              <span aria-hidden="true">{entry.e}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
