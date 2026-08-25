"use client";

import { useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { tallyOf, type ReactionsByEmoji } from "@/lib/social/interactions";
import { capReached, orderedReactions, summarize } from "@/lib/social/reaction-display";
import { QUICK_REACTIONS, QUICK_REACTION_NAMES } from "@/lib/social/reaction-constants";

// El catálogo entero (153 KB en crudo, 1.906 entradas) vive DENTRO de este
// chunk diferido. Por eso el ReactionBar importa reaction-constants y no
// emoji-catalog: si importara el catálogo, esos datos viajarían en el bundle
// del feed y la carga diferida no serviría de nada.
// `loading` ocupa el hueco del selector mientras llega el chunk: sin él, al
// pulsar «+» el botón se desmonta y no se pinta nada hasta que carga. El foco
// cae entonces a <body>, que queda FUERA del div que lleva el onKeyDown de
// Escape, así que con el chunk frío un usuario de teclado se queda varado sin
// poder cerrar. El placeholder mantiene el tamaño aproximado del picker
// (14rem de alto en móvil, 20rem desde min-[1023px]: el mismo corte de
// escritorio que usa emoji-picker.tsx) para que el popover no salte de
// tamaño al resolver. El ANCHO ya no se fija aquí (`w-full`, ver
// emoji-picker.tsx): en móvil lo manda la hoja inferior de este mismo
// componente (`inset-x-3`, más abajo), y un `w-[19rem]` fijo en el
// placeholder dejaba una banda en blanco a la derecha en cuanto la hoja era
// más ancha que eso.
const EmojiPicker = dynamic(() => import("./emoji-picker").then((m) => m.EmojiPicker), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center text-xs text-muted-foreground min-[1023px]:h-80 min-[1023px]:w-[28rem]">
      …
    </div>
  ),
});

// Reacciones con cualquier emoji, estilo Teams. Colapsado: los 3 emojis más
// votados + el total (pintarlos todos desbordaría la burbuja). Abierto: los ya
// reaccionados para sumarte de un clic, la fila rápida fija, y el «+» que
// cambia el contenido del popover por el catálogo — no abre un segundo
// flotante, que en 360 px no cabe.
export function ReactionBar({
  reactions,
  disabled,
  onToggle,
}: {
  reactions: ReactionsByEmoji;
  disabled?: boolean;
  onToggle: (emoji: string) => void;
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Posición del panel en ESCRITORIO, medida en `measureDesktopPosition` (más
  // abajo) contra el nodo real. En móvil no se usa: el panel deja de colgar
  // del botón (ver el `className` del diálogo más abajo).
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const { top, total, viewerReacted } = summarize(reactions);
  const existing = orderedReactions(reactions);
  const atCap = capReached(reactions);

  // Foco pendiente sin useEffect: al volver del catálogo (onBack) marcamos la
  // intención, y el callback ref del botón «+» la consume en cuanto ese botón
  // vuelve a montarse (se desmonta mientras `browsing` está activo).
  const restorePlusFocus = useRef(false);

  function close() {
    setOpen(false);
    setBrowsing(false);
    triggerRef.current?.focus();
  }

  // Posición del panel en ESCRITORIO: se mide el nodo YA renderizado, nunca se
  // estima. Nada de useEffect (lint set-state-in-effect) — es un callback de
  // `ref`, el mismo patrón que ya usa el botón «+» para el foco, salvo que
  // aquí interesa que se dispare en CADA commit, no solo al montar: al ser una
  // función inline (identidad nueva en cada render), React la reengancha
  // siempre, así que también corre cuando el catálogo pasa de placeholder
  // (`next/dynamic`, sin buscador ni tira de categorías) al panel real (con
  // los dos, más alto) — un `key` fijo en el montaje se habría quedado con la
  // medida vieja. El callback corre en el commit, ANTES de que el navegador
  // pinte, así que el `setAnchor` que dispara no provoca parpadeo.
  //
  // Se mide con `getBoundingClientRect()` el panel (ancho y alto REALES, ya
  // renderizados: nada de constantes a ojo tipo "28rem/20rem" que se
  // desincronizan en cuanto alguien toca el selector) y el botón que lo abre.
  // `left` se acota para que quepa entre los bordes del viewport por mucho
  // que la sangría del hilo lo empuje a la derecha. `top` intenta ir DEBAJO
  // del botón como siempre; si con la altura real no cabe (el caso que se
  // detectó: el catálogo mide bastante más que la fila de reacciones
  // rápidas), se coloca ENCIMA en su lugar.
  //
  // Guardia contra bucle infinito: `setAnchor` devuelve el mismo objeto
  // `prev` si los números no cambiaron, así que React no vuelve a renderizar
  // (bail-out por igualdad referencial) — sin esto, cada commit crearía un
  // objeto `{left, top}` nuevo aunque los valores fueran idénticos y
  // dispararía otro render sin parar.
  function measureDesktopPosition(node: HTMLDivElement | null) {
    if (!node) return; // se desmonta: nada que medir
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = node.getBoundingClientRect();
    const MARGIN = 16; // separación mínima con el borde del viewport

    // Nombres `panelLeft`/`panelTop` (no `left`/`top` a secas) para no tapar
    // el `top` de más arriba (los emojis más votados de `summarize()`) — son
    // conceptos sin relación, pero comparten nombre corto.
    const panelLeft = clamp(triggerRect.left, MARGIN, window.innerWidth - panelRect.width - MARGIN);

    const spaceBelow = window.innerHeight - triggerRect.bottom - MARGIN;
    const panelTop =
      panelRect.height <= spaceBelow
        ? triggerRect.bottom + 4
        : clamp(
            triggerRect.top - panelRect.height - 4,
            MARGIN,
            window.innerHeight - panelRect.height - MARGIN,
          );

    setAnchor((prev) =>
      prev && prev.left === panelLeft && prev.top === panelTop ? prev : { left: panelLeft, top: panelTop },
    );
  }

  function pick(emoji: string) {
    onToggle(emoji);
    close();
  }

  function backFromPicker() {
    restorePlusFocus.current = true;
    setBrowsing(false);
  }

  /** Un emoji nuevo se bloquea al llegar al tope; los tuyos siempre se quitan. */
  function blocked(emoji: string) {
    return Boolean(disabled) || (atCap && !tallyOf(reactions, emoji).viewerReacted);
  }

  return (
    <div
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("react")}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          viewerReacted
            ? "border-accent text-accent"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {top.length > 0 ? (
          <>
            <span aria-hidden="true">{top.map((r) => r.emoji).join(" ")}</span>
            <span>{total}</span>
          </>
        ) : (
          <span aria-hidden="true">🙂</span>
        )}
      </button>

      {open && (
        <>
          {/* Cierra al pulsar fuera, sin useEffect (lint set-state-in-effect).
              En móvil el panel pasa a ser una hoja inferior a pantalla
              completa (ver el diálogo de abajo), así que aquí sí se oscurece
              el fondo — mismo criterio que event-followers.tsx. En
              escritorio sigue siendo un popover pequeño anclado al botón y el
              fondo se queda como estaba: transparente.
              z-50: el mismo número que usan las demás hojas a pantalla
              completa sin <dialog> nativo del repo (filters-dropdown.tsx,
              event-followers.tsx) para no inventar uno — hay que quedar por
              ENCIMA del compositor del hilo, que es `fixed … z-30` en
              post-thread.tsx (`lg:static` en escritorio, así que ahí ni
              compite). El backdrop, a pantalla completa, también oscurece esa
              barra: si se viera por encima, la hoja seguiría pareciendo que
              cuelga por debajo de algo. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-50 cursor-default bg-scrim min-[1023px]:bg-transparent"
          />
          <div
            ref={measureDesktopPosition}
            role="dialog"
            aria-label={browsing ? t("emojiPicker.title") : t("react")}
            // Sin useEffect: `--panel-left/top` los calcula
            // `measureDesktopPosition` (el callback de `ref` de arriba) y
            // solo los lee el `min-[1023px]:` de abajo. En móvil el panel es
            // una hoja inferior FIJA respecto al viewport (`inset-x-3` +
            // `bottom-…`), sin relación con la posición del botón: por eso la
            // sangría del hilo deja de importar del todo, no solo se acota.
            // En escritorio sigue anclado al botón, pero con `position:
            // fixed` y coordenadas ya acotadas al viewport (con el tamaño
            // REAL del panel, medido, no estimado), así que nunca se sale ni
            // por la derecha ni por abajo por mucho que anide el hilo.
            // Mismo z-50 que el backdrop: al ir después en el DOM, un empate
            // de z-index ya lo coloca por encima (orden de documento), sin
            // necesitar un número más alto todavía.
            //
            // `max-h-[60svh]` (no `70vh`, y no un `px`/`rem` fijo): `svh` es
            // la unidad que ya usan las demás hojas del repo
            // (day-sheet.tsx, agenda-reminder-sheet.tsx) para que la barra
            // del navegador móvil no haga bailar el alto disponible —
            // `dvh` cambiaría en vivo al mostrarse/ocultarse esa barra,
            // `svh` se queda fija en el caso más estrecho, sin salto. 60%
            // dejaba antes un hueco de sobra (el tope real era el `max-h-56`
            // fijo de la rejilla de emoji-picker.tsx, pensado para un
            // popover pequeño, no para esta hoja) y ahora sí es la hoja
            // ENTERA (buscador + categorías + rejilla) la que se topa aquí:
            // `flex flex-col` más `flex-1 min-h-0` en la rejilla (ver
            // emoji-picker.tsx) hacen que sea ELLA quien absorbe el sobrante
            // con su propio scroll, no el conjunto. Dejar el 40% restante
            // visible es deliberado: parte del hilo se ve por encima de la
            // hoja, que es lo que explica a qué se está reaccionando. En
            // escritorio nada de esto aplica (`min-[1023px]:max-h-none`): ya
            // se acota al viewport y voltea hacia arriba si no cabe.
            style={
              anchor
                ? ({
                    "--panel-left": `${anchor.left}px`,
                    "--panel-top": `${anchor.top}px`,
                  } as CSSProperties)
                : undefined
            }
            className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 flex max-h-[60svh] flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-card min-[1023px]:inset-x-auto min-[1023px]:bottom-auto min-[1023px]:left-[var(--panel-left)] min-[1023px]:top-[var(--panel-top)] min-[1023px]:max-h-none min-[1023px]:overflow-visible"
          >
            {browsing ? (
              <EmojiPicker
                onPick={pick}
                onBack={backFromPicker}
                atCap={atCap}
                isDisabled={blocked}
              />
            ) : (
              <div className="flex flex-col gap-1">
                {existing.length > 0 && (
                  // Mismo problema que la tira de categorías del picker: se
                  // desplaza en pantallas estrechas, pero la barra no debe
                  // verse (patrón de post-aside.tsx).
                  <div className="flex max-w-[15rem] items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {existing.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={blocked(r.emoji)}
                        aria-pressed={r.viewerReacted}
                        onClick={() => pick(r.emoji)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
                          r.viewerReacted
                            ? "bg-accent/15 text-accent"
                            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                        }`}
                      >
                        {/* Sin aria-hidden: es el único contenido del botón que
                            identifica el emoji para lectores de pantalla, que
                            resuelven el carácter con su propia tabla CLDR. */}
                        <span>{r.emoji}</span>
                        <span>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      disabled={blocked(emoji)}
                      aria-pressed={tallyOf(reactions, emoji).viewerReacted}
                      aria-label={QUICK_REACTION_NAMES[emoji]}
                      title={atCap ? t("emojiPicker.capReached") : QUICK_REACTION_NAMES[emoji]}
                      onClick={() => pick(emoji)}
                      className={`rounded-full px-2 py-1 text-sm transition-colors disabled:opacity-40 ${
                        tallyOf(reactions, emoji).viewerReacted
                          ? "bg-accent/15"
                          : "hover:bg-surface-muted"
                      }`}
                    >
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    ref={(node) => {
                      // Al volver del catálogo este botón se remonta; si
                      // `backFromPicker` dejó la marca, le devolvemos el foco
                      // aquí mismo (sin useEffect: el callback ref ya corre
                      // tras el commit, que es cuando el nodo existe).
                      if (node && restorePlusFocus.current) {
                        restorePlusFocus.current = false;
                        node.focus();
                      }
                    }}
                    aria-label={t("emojiPicker.open")}
                    title={t("emojiPicker.open")}
                    onClick={() => setBrowsing(true)}
                    className="rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Acota `value` a `[min, max]`. En viewports de escritorio (≥1023px) `max`
 * siempre es ≥ `min` para el uso de arriba, así que no hace falta blindarlo. */
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
