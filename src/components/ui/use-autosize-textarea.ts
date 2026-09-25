"use client";

import { useLayoutEffect, type RefObject } from "react";

// Textarea que crece con lo que escribes, hasta `maxVh` del alto de la ventana
// (a partir de ahí hace scroll dentro). Sin esto, un mensaje largo se escribía
// en una caja de 2–3 líneas con scroll interno: en móvil no se podía releer lo
// ya escrito. El alto mínimo lo siguen marcando `rows`; si el usuario estira la
// caja a mano (`resize-y`), el siguiente carácter vuelve a ajustarla.
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxVh = 45,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = (window.innerHeight * maxVh) / 100;
    // +2: el borde de 1px arriba y abajo no entra en scrollHeight.
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
  }, [ref, value, maxVh]);
}
