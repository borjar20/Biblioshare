"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { clamp, fit, MAX_ZOOM, MIN_ZOOM, panBy, zoomAt, zoomToward } from "@/lib/atlas/camera";
import type { Camera, Extent, Point, Viewport } from "@/lib/atlas/types";
import { readCamera, writeCamera } from "@/lib/sagas/atlas/camera-storage";

// Cámara del atlas de la saga (spec 2026-10-28 §7). Toda la geometría sale de
// `@/lib/atlas/camera`; aquí solo hay estado, gestos y persistencia.
const DRAG_THRESHOLD = 5;
const FIT_PAD: Point = { x: 48, y: 200 };
const FALLBACK: Camera = { x: 0, y: 0, k: 1 };
/** Por debajo de este zoom, encajar la saga entera deja portadas demasiado pequeñas. */
const FIT_MIN_K = 0.9;

/** Punto de pantalla relativo al contenedor. */
function localPoint(el: HTMLElement | null, e: { clientX: number; clientY: number }): Point {
  const r = el?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
}
const middle = (vp: Viewport): Point => ({ x: vp.width / 2, y: vp.height / 2 });

/** Tamaño del contenedor, del `ResizeObserver`. 0×0 hasta la primera medida (y en el servidor). */
export function useViewport(ref: RefObject<HTMLElement | null>): Viewport {
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box) return;
      setViewport((v) => (v.width === box.width && v.height === box.height ? v : { width: box.width, height: box.height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return viewport;
}

/**
 * Cámara, gestos y persistencia. Recibe el viewport ya medido (`useViewport`) porque la
 * orientación del layout depende de él: el layout se calcula entre las dos llamadas.
 *
 * Mientras nadie mueve la cámara, es la inicial DERIVADA: la guardada en sessionStorage; si
 * no hay, encajar toda la saga (hasta 2×) cuando cabe a k ≥ 0,9; si no cabe, la obra «ahora»
 * (o la primera) a k = 1. Así sigue al layout (giro del móvil) sin efectos.
 * Lo que se guarda es solo la cámara que alguien movió.
 */
export function useAtlasCamera({ ref, viewport, extent, focus, sagaId }: {
  ref: RefObject<HTMLElement | null>;
  viewport: Viewport;
  extent: Extent;
  focus: Point | null;
  sagaId: string;
}) {
  const [moved, setMoved] = useState<Camera | null>(null);
  // `animated`: los movimientos de botón (encajar, isla, + −) se suavizan; los gestos, no.
  const [animated, setAnimated] = useState(false);
  const ready = viewport.width > 0 && viewport.height > 0;
  const initial = useMemo<Camera | null>(() => {
    if (!ready) return null;
    const saved = readCamera(sagaId);
    if (saved) return saved;
    // Saga corta: se ve entera y grande. Saga larga: se lee desde donde vas, a tamaño real.
    const whole = fit(extent, viewport, FIT_PAD, 2);
    if (whole.k >= FIT_MIN_K || !focus) return whole;
    return { x: focus.x, y: focus.y, k: 1 };
  }, [ready, sagaId, focus, extent, viewport]);
  const camera = moved ?? initial ?? FALLBACK;

  // Los listeners nativos (rueda) y los updaters leen lo último sin re-suscribirse.
  const live = useRef({ camera, viewport });
  useLayoutEffect(() => {
    live.current = { camera, viewport };
  });
  const update = useCallback((f: (c: Camera) => Camera, smooth: boolean) => {
    setAnimated(smooth);
    setMoved((prev) => f(prev ?? live.current.camera));
  }, []);

  // Guardado con debounce; lo pendiente se escribe igualmente al desmontar (salir del atlas
  // justo después de mover no debe perder la cámara).
  const pending = useRef<{ sagaId: string; camera: Camera } | null>(null);
  useEffect(() => {
    if (!moved) return;
    pending.current = { sagaId, camera: moved };
    const id = setTimeout(() => {
      writeCamera(sagaId, moved);
      pending.current = null;
    }, 200);
    return () => clearTimeout(id);
  }, [moved, sagaId]);
  useEffect(() => {
    const box = pending;
    return () => {
      if (box.current) writeCamera(box.current.sagaId, box.current.camera);
      box.current = null;
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }) => localPoint(ref.current, e);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = localPoint(el, e);
      update((c) => zoomAt(c, live.current.viewport, s, Math.exp(-e.deltaY * 0.0015)), false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, update]);

  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<{ start: Point; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; mid: Point } | null>(null);
  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const capture = (e: ReactPointerEvent<HTMLElement>) => {
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* puntero ya suelto */ }
  };

  // Soltar un puntero. El arrastre se olvida en la siguiente vuelta: así `onClickCapture`
  // aún ve el arrastre del clic que sigue al `pointerup`, pero un Enter posterior no se pierde.
  const release = useCallback((id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      const ended = drag.current;
      setTimeout(() => {
        if (drag.current === ended) drag.current = null;
      }, 0);
    }
  }, []);

  // Un ratón que se suelta fuera del lienzo antes del umbral (sin captura) no manda
  // `pointerup` al lienzo. Mientras haya punteros pulsados se escucha también en `window`.
  const windowCleanup = useRef<(() => void) | null>(null);
  const watchWindow = () => {
    if (windowCleanup.current) return;
    const onUp = (e: PointerEvent) => {
      release(e.pointerId);
      if (pointers.current.size === 0) windowCleanup.current?.();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    windowCleanup.current = () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      windowCleanup.current = null;
    };
  };
  useEffect(() => () => windowCleanup.current?.(), []);

  const bind = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = local(e);
      pointers.current.set(e.pointerId, p);
      watchWindow();
      if (pointers.current.size === 1) drag.current = { start: p, moved: false };
      if (pointers.current.size === 2) {
        pinch.current = pair();
        if (drag.current) drag.current.moved = true;
        for (const id of pointers.current.keys()) {
          try { e.currentTarget.setPointerCapture?.(id); } catch { /* idem */ }
        }
      }
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      // Ratón sin botones pulsados: se soltó sin que nos llegara el `pointerup`.
      if (e.pointerType === "mouse" && e.buttons === 0) {
        release(e.pointerId);
        drag.current = null;
        return;
      }
      const p = local(e);
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size >= 2 && pinch.current) {
        const before = pinch.current, now = pair();
        pinch.current = now;
        update((c) => panBy(zoomAt(c, live.current.viewport, before.mid, now.dist / before.dist), now.mid.x - before.mid.x, now.mid.y - before.mid.y), false);
        return;
      }
      const d = drag.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < DRAG_THRESHOLD) return;
        d.moved = true;
        capture(e);
        update((c) => panBy(c, p.x - d.start.x, p.y - d.start.y), false);
        return;
      }
      update((c) => panBy(c, p.x - prev.x, p.y - prev.y), false);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      release(e.pointerId);
    },
    onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
      release(e.pointerId);
    },
    /** Un arrastre no es un clic: se lo come antes de que llegue a la obra o la isla. */
    onClickCapture(e: ReactMouseEvent<HTMLElement>) {
      if (drag.current?.moved) {
        e.stopPropagation();
        e.preventDefault();
      }
      drag.current = null;
    },
    onDoubleClick(e: ReactMouseEvent<HTMLElement>) {
      const s = local(e);
      update((c) => zoomToward(c, live.current.viewport, s, 2), true);
    },
  };

  const zoomBy = useCallback(
    (f: number) => update((c) => zoomAt(c, live.current.viewport, middle(live.current.viewport), f), true),
    [update],
  );
  const fitAll = useCallback(() => update(() => fit(extent, live.current.viewport, FIT_PAD), true), [update, extent]);
  const focusOn = useCallback(
    (p: Point, k?: number) => update((c) => ({ x: p.x, y: p.y, k: clamp(k ?? c.k, MIN_ZOOM, MAX_ZOOM) }), true),
    [update],
  );

  return { camera, viewport, animated, zoomBy, fitAll, focusOn, bind };
}
