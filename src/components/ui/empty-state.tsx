import type { ReactNode } from "react";

// Patrón único de estado vacío / de error (Paper - Estados.html): glifo sobrio
// en caja, título en Fraunces, mensaje tenue y una acción. Lo comparten el
// perfil privado, la colección vacía, el feed vacío, la búsqueda sin
// resultados, el error de carga y el offline.
// Dos tallas, no dos componentes (F3-015). `page` es la de siempre: ocupa la
// pantalla cuando el vacío ES la pantalla (perfil privado, búsqueda sin
// resultados, offline). `panel` es la que faltaba, y es la razón por la que
// media app seguía resolviendo sus vacíos con un `<p>` gris suelto: una lista
// dentro de una sección —los clubes de «Descubrir», la agenda del mes, las
// sesiones de un pase— no puede permitirse 128px de aire ni un titular en
// serif de 20px, así que nadie usaba el componente y cada sitio improvisaba.
//
// Lo que NO cambia entre tallas es la anatomía: glifo, qué pasa, y una salida.
// Si un vacío no tiene salida que ofrecer, `action` se queda fuera — pero hay
// que haberlo pensado, que era el hallazgo.
const SIZES = {
  page: {
    root: "flex-1 gap-1.5 px-6 py-16",
    glyph: "mb-3 h-16 w-16 rounded-2xl",
    title: "font-serif text-xl font-semibold tracking-tight",
    message: "max-w-xs text-sm",
    action: "mt-4",
  },
  panel: {
    root: "gap-1 px-4 py-8",
    glyph: "mb-2.5 h-11 w-11 rounded-xl",
    title: "font-serif text-base font-semibold",
    message: "max-w-sm text-[13px]",
    action: "mt-3",
  },
} as const;

export function EmptyState({
  glyph,
  title,
  message,
  action,
  secondary,
  variant = "page",
}: {
  glyph: ReactNode;
  title: string;
  message?: string;
  /** Acción principal (normalmente un Link con buttonVariants("primary")). */
  action?: ReactNode;
  /** Enlace secundario, en tenue y subrayado. */
  secondary?: ReactNode;
  /** `page` llena la pantalla; `panel` cabe dentro de una sección o una lista. */
  variant?: keyof typeof SIZES;
}) {
  const size = SIZES[variant];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${size.root}`}
    >
      <div
        className={`grid place-items-center border border-border bg-surface text-accent ${size.glyph}`}
      >
        {glyph}
      </div>

      <h2 className={`text-foreground ${size.title}`}>{title}</h2>

      {message && (
        <p className={`leading-relaxed text-muted-foreground ${size.message}`}>
          {message}
        </p>
      )}

      {action && <div className={size.action}>{action}</div>}
      {secondary && <div className="mt-3 text-xs">{secondary}</div>}
    </div>
  );
}
