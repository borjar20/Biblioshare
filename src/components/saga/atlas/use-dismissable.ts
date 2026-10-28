"use client";
import { useCallback, useEffect, type FocusEvent, type RefObject } from "react";

/** Por debajo de 640 px las hojas del atlas son hoja inferior con fondo (modal de hecho); a
 *  ≥ 640 px, tarjeta o desplegable. 639,98 evita que 640 caiga en los dos lados (la CSS lo repite). */
export const NARROW_QUERY = "(max-width: 639.98px)";

/**
 * Cierre común de las hojas del atlas (itinerarios y mini-ficha): Escape cierra y pide
 * devolver el foco (`close(true)`); un `pointerdown` fuera de `ref` cierra sin moverlo
 * (`close(false)`), salvo en lo que `ignore` acepte. Devuelve el `onBlur` del contenedor:
 * si el foco sale de la hoja se cierra, solo en móvil (`blur: "narrow"`, así no se escapa
 * tras el fondo) o a cualquier ancho (`"always"`, devolviendo el foco al origen); con
 * `"always"`, lo que `ignore` acepte tampoco cuenta como salir. `close` e `ignore` deben ser estables.
 */
export function useDismissable({ open, ref, close, ignore, blur = "narrow" }: {
  open: boolean;
  ref: RefObject<HTMLElement | null>;
  close: (refocus: boolean) => void;
  ignore?: (target: Element) => boolean;
  blur?: "narrow" | "always";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignore && target instanceof Element && ignore(target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, ref, close, ignore]);

  return useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget as Node | null;
      if (!open || !next || ref.current?.contains(next)) return;
      if (blur === "always") {
        if (next instanceof Element && ignore?.(next)) return;
        close(true);
      } else if (window.matchMedia?.(NARROW_QUERY).matches) close(false);
    },
    [open, ref, close, ignore, blur],
  );
}
