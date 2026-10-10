export type PanelRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** Solo cancelar nuestras transiciones, no relojes/barras del contenido. */
export function cancelHomePanelMotion(panel: HTMLElement) {
  panel.getAnimations?.({ subtree: true })
    .filter((animation) => animation.id.startsWith("home-panel-"))
    .forEach((animation) => animation.cancel());
}

/** Crece desde la tarjeta; no cambia el árbol React ni el estado del contenido. */
export async function animateHomePanel(dialog: HTMLElement, origin: PanelRect | null, reduced: boolean, closing = false) {
  cancelHomePanelMotion(dialog);
  if (!origin || reduced || typeof dialog.animate !== "function") return;
  const target = dialog.getBoundingClientRect();
  if (!target.width || !target.height || !origin.width || !origin.height) return;
  const compact = `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})`;
  const frames = [
    { transform: compact, transformOrigin: "0 0", borderRadius: "14px" },
    { transform: "none", transformOrigin: "0 0", borderRadius: "14px" },
  ];
  const surface = dialog.querySelector<HTMLElement>(".home-panel-surface") ?? dialog;
  const motion = surface.animate(closing ? frames.reverse() : frames, {
    duration: closing ? 270 : 340,
    easing: "cubic-bezier(.22,.8,.22,1)",
  });
  motion.id = "home-panel-surface";
  const body = dialog.querySelector<HTMLElement>(".home-panel-body");
  const reveal = body?.animate(closing ? [{ opacity: 1 }, { opacity: 0 }] : [
    { opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1 },
  ], { duration: closing ? 200 : 340 });
  if (reveal) reveal.id = "home-panel-reveal";
  await Promise.all([motion.finished.catch(() => {}), reveal?.finished.catch(() => {})]);
}
