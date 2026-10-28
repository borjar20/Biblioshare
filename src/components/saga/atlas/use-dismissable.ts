"use client";
import { useCallback, useEffect, type FocusEvent, type RefObject } from "react";

/** A partir de aquí las hojas del atlas son hoja inferior con fondo (modal de hecho). */
export const NARROW_QUERY = "(max-width: 640px)";

/**
 * Cierre común de las hojas del atlas (itinerarios y mini-ficha): Escape cierra y pide
 * devolver el foco (`close(true)`); un `pointerdown` fuera de `ref` cierra sin moverlo
 * (`close(false)`), salvo en lo que `ignore` acepte. Devuelve el `onBlur` del contenedor:
 * en móvil, si el foco sale de la hoja, se cierra (así no se escapa tras el fondo).
 * `close` e `ignore` deben ser estables.
 */
export function useDismissable({ open, ref, close, ignore }: {
  open: boolean;
  ref: RefObject<HTMLElement | null>;
  close: (refocus: boolean) => void;
  ignore?: (target: Element) => boolean;
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
      if (window.matchMedia?.(NARROW_QUERY).matches) close(false);
    },
    [open, ref, close],
  );
}
