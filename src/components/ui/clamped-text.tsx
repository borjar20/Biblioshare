"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// Texto largo plegable: por encima de `maxHeight` se corta con un degradado y
// un «Ver más» lo despliega. Por ALTURA medida y no con `line-clamp`: el cuerpo
// suele traer varios bloques (párrafos, listas del markdown-lite) y Safari solo
// recorta bien el contenido inline de un único bloque. Si el texto cabe, no se
// pinta el botón ni el degradado — un post de una línea queda igual que antes.
export function ClampedText({
  children,
  maxHeight = 224,
  className = "",
}: {
  children: ReactNode;
  /** Alto plegado en px (224 ≈ 10 líneas de 14px con leading-relaxed). */
  maxHeight?: number;
  className?: string;
}) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Se remide al cambiar el ancho (girar el móvil, abrir el rail): el mismo
  // texto puede pasar de caber a no caber.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > maxHeight + 24);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  const collapsed = overflows && !expanded;

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={ref}
        className={`relative ${collapsed ? "overflow-hidden" : ""} ${className}`}
        style={collapsed ? { maxHeight } : undefined}
      >
        {children}
        {collapsed && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent"
          />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="self-start py-1 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}
