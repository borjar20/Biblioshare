export type PanelRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** Crece desde la tarjeta; no cambia el árbol React ni el estado del contenido. */
export async function animateHomePanel(dialog: HTMLElement, origin: PanelRect | null, reduced: boolean, closing = false) {
  if (!origin || reduced || typeof dialog.animate !== "function") return;
  const target = dialog.getBoundingClientRect();
  if (!target.width || !target.height || !origin.width || !origin.height) return;
  const compact = `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})`;
  const frames = [{ transform: compact, borderRadius: "14px" }, { transform: "none", borderRadius: "14px" }];
  const surface = dialog.querySelector<HTMLElement>(".home-panel-surface") ?? dialog;
  const motion = surface.animate(closing ? frames.reverse() : frames, {
    duration: closing ? 270 : 340,
    easing: "cubic-bezier(.22,.8,.22,1)",
  }).finished.catch(() => {});
  const body = dialog.querySelector<HTMLElement>(".home-panel-body");
  const reveal = body?.animate(closing ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1 }], { duration: closing ? 200 : 340 }).finished.catch(() => {});
  await Promise.all([motion, reveal]);
}
