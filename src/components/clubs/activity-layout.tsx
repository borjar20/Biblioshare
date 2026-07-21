import type { ReactNode } from "react";

export type ActivityLayoutProps = {
  /** En móvil va ANTES del tablero; en PC, arriba del rail derecho. */
  railTop?: ReactNode;
  /** El tablero del tipo de actividad. Columna izquierda en PC. */
  body: ReactNode;
  /** En móvil va DESPUÉS del tablero; en PC, debajo en el rail. */
  railBottom?: ReactNode;
  /** Piezas que aporta ActivityDetailView al rail (participantes). Solo se
      pintan en PC: en móvil el padre ya las tiene en su posición del mockup. */
  railExtra?: ReactNode;
};

// Tres ranuras, un solo DOM (spec, decisión 2). El orden del DOM ES el orden
// móvil, que fluye natural; en `lg` un grid explícito recoloca:
//
//   railTop      -> col 2, fila 1        body -> col 1, filas 1-2
//   railBottom   -> col 2, fila 2
//
// No se usa `hidden lg:block` para mover piezas: duplicaría controles y la
// suite corre a 1280 (ver la nota sobre duplicados en `club-shell.tsx`).
export function ActivityLayout({
  railTop,
  body,
  railBottom,
  railExtra,
}: ActivityLayoutProps) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_296px] lg:items-start lg:gap-7">
      {(railTop || railExtra) && (
        <div
          className={`flex-col gap-4 empty:hidden lg:col-start-2 lg:row-start-1 ${
            // Si no hay `railTop`, el único contenido de esta ranura es
            // `railExtra`, que solo se pinta en PC (`hidden lg:block` más
            // abajo). El contenedor en sí debe seguirle el paso: si se queda
            // `flex` a secas, en móvil es un ítem flex vacío que igual gasta
            // el `gap-4` del padre -- un hueco de aire sin nada dentro
            // (ocurría en buddy_read sin «Tu progreso»).
            railTop ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* railExtra solo existe en PC: en móvil el padre ya pintó
              participantes en su sitio del mockup. */}
          {railExtra && <div className="hidden lg:block">{railExtra}</div>}
          {railTop}
        </div>
      )}

      <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">{body}</div>

      {/* `empty:hidden` en los dos contenedores de rail: cuando la pieza que
          llega a una ranura renderiza `null` (p. ej. `LinkedActivities` sin
          hijas ni oferta), el `<div>` se monta sin hijos y `:empty` lo
          colapsa -- si no, ese contenedor vacío igual consume el `gap-4` del
          padre en móvil. Resuelve estructuralmente toda la familia de casos
          data-driven (presentes y futuros), no solo el actual. */}
      {railBottom && (
        <div className="flex flex-col gap-4 empty:hidden lg:col-start-2 lg:row-start-2">
          {railBottom}
        </div>
      )}
    </div>
  );
}
