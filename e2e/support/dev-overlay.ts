import type { Page } from "@playwright/test";

/** Oculta el overlay de desarrollo de Next (`<nextjs-portal>`) durante un spec.
 *
 * Ese portal se planta abajo a la izquierda y, en cuanto hay un aviso que contar
 * —hoy siempre lo hay: el `Date.now()` en prerender de #895 es global—, **tapa el
 * primer botón de la barra de la mascota**, «Campamento». El click nunca llega y
 * el test muere con `<nextjs-portal> … intercepts pointer events` tras 20 s. Es lo
 * que estaba detrás de #1169, que lo había diagnosticado como una carrera del
 * `router.refresh()` en la aserción de la línea siguiente.
 *
 * Ocultarlo no esconde nada del producto: el portal lo inyecta `next dev` y no
 * existe en el build de producción contra el que corre CI (`playwright.ci.config.ts`).
 * Lo que sí escondería es un `force: true` en el click, que pasaría por encima de
 * CUALQUIER cosa superpuesta, incluida una del producto — por eso no se hace así.
 *
 * Va como `addInitScript` y no como `addStyleTag` porque los specs recargan y
 * navegan: un estilo inyectado en un documento no sobrevive al siguiente.
 */
export async function hideNextDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important }";
      (document.head ?? document.documentElement).append(style);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true });
    else inject();
  });
}
