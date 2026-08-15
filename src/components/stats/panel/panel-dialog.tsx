"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * La capa donde un panel se lee entero. Sustituye al `<details>` en línea: en
 * una rejilla de dos o tres columnas, desplegar una tarjeta reflowea a todas
 * sus vecinas y el sitio donde estabas mirando se mueve bajo el cursor. La capa
 * no toca el muro — el fondo se queda quieto y el foco (visual y de teclado) va
 * a un solo panel.
 *
 * `<dialog>` nativo con `showModal()`, como el resto de capas del repo
 * (`sheet-shell.tsx`, `image-zoom.tsx`): trae gratis Escape, la trampa de foco,
 * el `inert` del fondo y la devolución del foco al disparador al cerrar.
 * Reimplementarlo con un div superpuesto sería perder las cuatro cosas.
 *
 * El disparador cubre la tarjeta entera (`absolute inset-0`) en vez de ser un
 * botón pequeño en una esquina: se pulsa donde sea, igual que antes. Va como
 * botón superpuesto y NO envolviendo el contenido porque `<button>` solo admite
 * contenido de frase — un `<h2>` dentro sería HTML inválido y algunos lectores
 * lo aplanan. Por eso la tarjeta no lleva ningún otro elemento interactivo: el
 * disparador los taparía.
 *
 * `children` llega ya renderizado desde el servidor: este componente no sabe
 * nada de paneles, solo abre y cierra.
 */
export function PanelDialog({
  title,
  label,
  children,
}: {
  /** Nombre accesible de la capa. */
  title: string;
  /** Nombre accesible del disparador: dice QUÉ panel se amplía, no «ver más». */
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // El contenido del panel navega estando la capa abierta (acciones/tabla con
  // <Link href>). Con Cache Components la capa NO se desmonta en navegación
  // soft: el <dialog> quedaría con `open=true` pero fuera del top layer al
  // volver, roto e incerrable (#448, como item-connect-sheet). Al cambiar de
  // ruta se cierra si está abierta (close() sobre una capa cerrada es no-op).
  useEffect(() => {
    if (ref.current?.open) ref.current.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={label}
        className="absolute inset-0 z-10 cursor-pointer rounded-card"
      />
      {/* `overflow-x-clip` explícito: pedir solo `overflow-y: auto` hace que el
          eje X compute a `auto` también, y entonces cualquier globo del gráfico
          que asome por el borde le regala una barra horizontal a toda la capa.
          `clip` recorta sin crear contenedor de scroll; la tabla ancha sigue
          teniendo el suyo propio dentro (ver panel-table.tsx). */}
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => {
          // Clic en el propio <dialog> (fuera del contenido) = clic en el
          // scrim. Un clic dentro llega con el hijo como target.
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[86dvh] w-[min(100%-1.5rem,34rem)] overflow-x-clip overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-0 text-left text-foreground shadow-card backdrop:bg-scrim"
      >
        {/* El cierre va pegado arriba: la capa hace scroll (una tabla de doce
            filas no cabe), y una salida que se va con el scroll deja atrapado a
            quien no usa Escape. */}
        <div className="sticky top-0 z-10 flex justify-end bg-surface px-3 pt-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div className="px-4 pb-5">{children}</div>
      </dialog>
    </>
  );
}
