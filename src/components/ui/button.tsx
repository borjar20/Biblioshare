import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "green";

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
};

// Shared with any element that should look like a button (e.g. next/link),
// so we never nest an <a> inside a <button>.
export function buttonVariants(variant: Variant = "primary", className = "") {
  return `inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${VARIANT_CLASSES[variant]} ${className}`;
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
