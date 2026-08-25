import { type ButtonHTMLAttributes, forwardRef } from "react";

// Los CUATRO roles del sistema (F3-014), más el verde social que ya existía.
// La regla que los hace legibles no está en el código sino en el uso: UN SOLO
// primario por vista. Si una vista necesita dos naranjas, es que una de las dos
// acciones no era primaria.
//
// `danger` es el cuarto rol y NO es «lo mismo en rojo»: la jerarquía manda que
// lo destructivo viva tras un «···» (ver ActionMenu, prop `danger`) y que este
// botón solo salga cuando el borrado ES el asunto de la pantalla — la
// confirmación de una hoja, el paso final de un flujo. Un `Button
// variant="danger"` sembrado por fila es exactamente el patrón que F3-012
// venía a quitar.
type Variant = "primary" | "secondary" | "ghost" | "green" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-60",
  secondary:
    "border border-border text-foreground hover:bg-surface-muted disabled:opacity-60",
  ghost: "text-foreground hover:bg-surface-muted disabled:opacity-60",
  // Verde = lo social en Paper: unirse a un club, aprobar, aceptar. No hay
  // token --green-hover, así que el hover atenúa en vez de inventar uno.
  green:
    "bg-green text-accent-foreground hover:opacity-90 disabled:opacity-60",
  // Rojo sólido, no outline: cuando este botón aparece es el que remata la
  // acción irreversible y tiene que leerse como tal. `--status-dropped` es el
  // rojo que la app ya usa para «abandonado» y para los errores de formulario;
  // no se inventa un segundo rojo.
  danger:
    "bg-status-dropped text-accent-foreground hover:opacity-90 disabled:opacity-60",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors";

// Tailwind resuelve los conflictos por el ORDEN DE LA HOJA, no por el orden en
// el string: `hidden` se emite antes que `inline-flex` y `px-3` antes que
// `px-5`, así que lo que pasaba el llamante PERDÍA contra la base de aquí. Eso
// dejaba «Iniciar sesión» visible en móvil (debía ocultarse) y todos los
// botones más anchos de lo pedido. Como no hay tailwind-merge, quitamos de la
// base la clase cuyo grupo el llamante redefine. Solo cuentan las clases SIN
// variante (`sm:px-8` no debe dejar el móvil sin padding).
const OVERRIDES: [base: string, overriddenBy: RegExp][] = [
  ["inline-flex", /^(hidden|block|inline|inline-block|flex|grid|contents)$/],
  ["px-5", /^px-/],
  ["py-2", /^py-/],
  ["text-sm", /^text-(xs|sm|base|lg|xl|\[)/],
  ["rounded-full", /^rounded/],
  ["gap-2", /^gap-/],
];

// Shared with any element that should look like a button (e.g. next/link),
// so we never nest an <a> inside a <button>.
export function buttonVariants(variant: Variant = "primary", className = "") {
  const plain = className.split(/\s+/).filter((c) => c && !c.includes(":"));
  const base = BASE.split(" ").filter((c) => {
    const rule = OVERRIDES.find(([name]) => name === c);
    return !rule || !plain.some((p) => rule[1].test(p));
  });
  return `${base.join(" ")} ${VARIANT_CLASSES[variant]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className = "", ...props }, ref) {
    return (
      <button ref={ref} className={buttonVariants(variant, className)} {...props} />
    );
  }
);
