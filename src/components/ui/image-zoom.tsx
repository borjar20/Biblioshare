"use client";

import { useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** Lightbox estilo X: pulsas la imagen y se ve a tamaño completo sobre el
 *  scrim. `<dialog>` nativo con `showModal()`, como el resto de capas del repo
 *  (`sheet-shell.tsx`): trae gratis Escape, la trampa de foco y el `inert` del
 *  fondo. Cierra al pulsar en cualquier sitio — en móvil no hay Escape.
 *
 *  `children` es el hueco que ya ocupaba la imagen (la miniatura optimizada);
 *  `src` es lo que se amplía, en crudo y a resolución completa. */
export function ImageZoom({
  src,
  alt,
  className,
  children,
}: {
  src: string;
  alt: string;
  /** Va al botón disparador: hereda tamaño y forma del hueco original. */
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations("common");

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={t("zoomImage")}
        className={`cursor-zoom-in ${className ?? ""}`}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        aria-label={alt || t("zoomImage")}
        onClick={() => ref.current?.close()}
        // Fondo casi negro en claro y oscuro, no el `--scrim` de las hojas
        // (0.45 en claro): aquí la imagen ES el contenido y el resto estorba.
        className="m-auto max-h-none max-w-none cursor-zoom-out bg-transparent p-0 backdrop:bg-black/90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- aquí se quiere
            el original a resolución completa, no una miniatura optimizada */}
        <img
          src={src}
          alt={alt}
          className="max-h-[92vh] max-w-[92vw] object-contain"
        />
      </dialog>
    </>
  );
}
