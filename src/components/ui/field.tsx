import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  required = false,
  mono = false,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  /** Pinta el `*` de requerido en accent (`.req` de las maquetas). */
  required?: boolean;
  /**
   * Label en mono 10px uppercase muted, como el frame B de «Añadir
   * manualmente». Es OPT-IN a propósito: `Field` lo usan 17 formularios más
   * (login, signup, onboarding, clubes, retos…) y volverlo global restylearía
   * todos de golpe. Esa decisión es del plan 07 (transversal), que sigue
   * abierto — cuando la tome, esta prop se cae y el estilo pasa a ser el único.
   */
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className={
          mono
            ? "mb-[3px] label-section"
            : "text-sm font-medium"
        }
      >
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
