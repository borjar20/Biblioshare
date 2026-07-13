import { type SelectHTMLAttributes, forwardRef } from "react";

// El `size` nativo de <select> es el nº de filas visibles, que no usamos en
// ningún sitio; lo sustituimos por la escala de tamaño.
type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** `sm` para filas de tabla, `xs` para paneles compactos. */
  size?: "default" | "sm" | "xs";
};

const SIZES = {
  default: "px-3 py-2 text-sm",
  sm: "px-2 py-1 text-sm",
  xs: "px-2 py-1.5 text-xs",
} as const;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", size = "default", ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`rounded-md border border-border bg-surface text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 ${SIZES[size]} ${className}`}
      {...props}
    />
  );
});
