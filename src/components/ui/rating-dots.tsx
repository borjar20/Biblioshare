"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatDots, ratingFromFraction } from "@/lib/rating/dots";
import type { ItemType } from "@/lib/catalog/types";

// EL control de valoración de Paper: cinco dots sobre la nota 1–10, en modo
// lectura o interactivo. Único en la app — no hay estrellas en ninguna parte.
//
// Cada dot vale DOS puntos de la escala y un dot a medias es la nota impar
// (estilo Letterboxd): así caben las diez notas en los cinco dots de la
// maqueta, sin bajar la nota a una escala de 5 ni alinear diez dots en fila.
// La técnica (medio relleno con un degradado duro al 50%, mitades pulsables)
// venía de EpisodeRating, que era el único sitio que ya la tenía bien; ahora
// vive aquí y aquel la reutiliza.
//
// Recibe y devuelve SIEMPRE 1–10: la conversión a /5 es interna y de
// presentación, igual que hacía el StarRating al que jubila. Ningún consumidor
// piensa en dots.
//
// El relleno toma el color del TIPO de obra (--type-book/movie/series): la nota
// se lee dentro de la ficha o la tarjeta de un medio y se tiñe con su identidad.
// Antes era ORO fijo en toda la app (el color de tipo se reservaba para
// identificar el medio); se cambió a propósito — ver decisiones.md. Sin
// `itemType` cae a oro, para no dejar sin relleno un sitio que aún no lo pase.
const GOLD = "var(--gold)";
// El dot apagado va en --surface-3, no en --border: con el borde (alfa .14) no
// se distinguía del fondo y una nota de 2/10 parecía "sin valorar".
const EMPTY = "var(--surface-3)";

const SIZES = { sm: 7, md: 10, lg: 14 } as const;

// Mínimo táctil. Vertical se estira sin coste (nadie vive encima ni debajo de
// la fila), así que las mitades pulsables llegan a 44px de alto por margen
// negativo. HORIZONTAL no se puede: 10 mitades × 22px son 220px de fila para
// cinco dots de 10px, un dibujo distinto. Ahí entra el arrastre.
const TOUCH_MIN = 44;

function dotBackground(rating: number, index: number, fill: string): string {
  // index 0..4 → cubre las notas (2i+1, 2i+2).
  const full = 2 * index + 2;
  const half = 2 * index + 1;
  if (rating >= full) return fill;
  if (rating >= half)
    return `linear-gradient(90deg, ${fill} 50%, ${EMPTY} 50%)`;
  return EMPTY;
}

export function RatingDots({
  value,
  onChange,
  size = "md",
  disabled = false,
  className = "",
  itemType,
}: {
  /** Nota 1–10, o null si no hay. */
  value: number | null;
  /** Si se pasa, el control es interactivo (precisión de media nota). */
  onChange?: (rating: number) => void;
  size?: keyof typeof SIZES | number;
  disabled?: boolean;
  className?: string;
  /** Tiñe la nota con el color del tipo de obra. Sin él, oro. */
  itemType?: ItemType;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  // Solo mientras el dedo está apoyado: distingue el arrastre táctil del
  // preview de ratón/teclado, que no debe sacar el globo de la nota.
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const interactive = Boolean(onChange) && !disabled;
  const shown = (interactive ? (preview ?? value) : value) ?? 0;
  const px = typeof size === "number" ? size : SIZES[size];
  const fill = itemType ? `var(--type-${itemType})` : GOLD;
  // Cuánto sobresale por arriba y por abajo cada mitad pulsable.
  const padY = Math.max(0, (TOUCH_MIN - px) / 2);

  // Nota bajo el dedo. El reparto en diez tramos vive en `lib/rating/dots` para
  // poder probarlo sin navegador; aquí solo queda la medida de la fila. El
  // desfase máximo contra el dot dibujado son 2-3px, y manda lo que enseña el
  // globo, no lo que el ojo calcule.
  function valueFromX(clientX: number): number | null {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return ratingFromFraction((clientX - rect.left) / rect.width);
  }

  // Arrastre continuo (patrón Letterboxd), SOLO para dedo y lápiz. Con ratón no
  // se toca nada: sigue el hover + clic sobre las mitades, y así los e2e que
  // pulsan el botón «10/10» siguen valiendo.
  //
  // `touch-action: pan-y` (no `none`): el eje vertical se lo queda el scroll de
  // la página —empezar a bajar con el dedo sobre la fila no puede secuestrar el
  // gesto, que es justo el error de la tierlist en F4-012— y el horizontal es
  // nuestro. Si el navegador se lleva el gesto para hacer scroll, llega
  // `pointercancel` y no se puntúa nada.
  const touchHandlers = interactive
    ? {
        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType === "mouse") return;
          // Mata el clic sintético que dispararía además la mitad de debajo
          // (doble `onChange`) y la selección de texto del long-press.
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setPreview(valueFromX(e.clientX));
        },
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (!dragging) return;
          setPreview(valueFromX(e.clientX));
        },
        onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (!dragging) return;
          const next = valueFromX(e.clientX);
          setDragging(false);
          setPreview(null);
          if (next !== null) onChange!(next);
        },
        onPointerCancel: () => {
          setDragging(false);
          setPreview(null);
        },
      }
    : {};

  const dots = (
    <div
      ref={rowRef}
      className={`inline-flex items-center gap-1${
        interactive ? " touch-pan-y select-none" : ""
      }`}
      onMouseLeave={interactive ? () => setPreview(null) : undefined}
      {...touchHandlers}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const valueAt = (half: boolean) => 2 * i + (half ? 1 : 2);
        return (
          <span
            key={i}
            className="relative inline-block rounded-full"
            style={{
              width: px,
              height: px,
              background: dotBackground(shown, i, fill),
              cursor: interactive ? "pointer" : "default",
            }}
            aria-hidden={!interactive}
          >
            {interactive && (
              <>
                {/* Mitades pulsables: izquierda = nota impar, derecha = par.
                    Son <button> de verdad (no un onClick sobre el dot) para
                    que el control se pueda tabular y usar con teclado.
                    Se estiran en vertical hasta los 44px con `top`/`bottom`
                    negativos: el alto de la fila no cambia (son absolutas). */}
                <button
                  type="button"
                  className="absolute left-0 w-1/2"
                  style={{ top: -padY, bottom: -padY }}
                  aria-label={`${valueAt(true)}/10`}
                  onMouseEnter={() => setPreview(valueAt(true))}
                  onFocus={() => setPreview(valueAt(true))}
                  onBlur={() => setPreview(null)}
                  onClick={() => onChange!(valueAt(true))}
                />
                <button
                  type="button"
                  className="absolute right-0 w-1/2"
                  style={{ top: -padY, bottom: -padY }}
                  aria-label={`${valueAt(false)}/10`}
                  onMouseEnter={() => setPreview(valueAt(false))}
                  onFocus={() => setPreview(valueAt(false))}
                  onBlur={() => setPreview(null)}
                  onClick={() => onChange!(valueAt(false))}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );

  // `className` va SIEMPRE en el envoltorio de fuera, nunca en el div de los
  // dots: ese ya lleva `inline-flex`, y Tailwind emite `.inline-flex` después
  // de `.hidden`, así que un `hidden` del consumidor perdía la pelea. Por eso
  // el resumen de «Comunidad» pintaba diez dots en móvil — sus dos instancias
  // (`lg:hidden` y `hidden lg:flex`) se veían las dos a la vez.
  if (!interactive) {
    return (
      <div
        role="img"
        className={className || undefined}
        aria-label={
          value === null ? "Sin valorar" : `${formatDots(value)} de 5`
        }
      >
        {dots}
      </div>
    );
  }

  return (
    <div
      role="group"
      className={`relative${className ? ` ${className}` : ""}`}
      aria-label="Tu valoración"
    >
      {/* La nota, grande y encima de la fila, mientras el dedo no se levanta:
          es lo que convierte un target de 3,5px en un gesto que se puede
          corregir antes de soltar. Sin él, la nota salía ±1 de la intención.
          `aria-hidden` porque el lector de pantalla ya va por los botones. */}
      {dragging && preview !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1 font-mono text-[15px] font-semibold leading-none text-surface shadow-card"
        >
          {preview}
        </span>
      )}
      {dots}
    </div>
  );
}
