// Clases de los controles menudos de filtro/orden, en un solo sitio.
//
// Estaban copiadas literalmente en `library-filters.tsx` (servidor) y
// `collection-items.tsx` (cliente), y al añadir un tercer sitio (el buscador de
// Colecciones) tocaba una cuarta copia. Viven en un módulo sin JSX y sin
// dependencias a propósito: un componente de CLIENTE no puede importar de uno de
// servidor sin arrastrarse el módulo entero al bundle, así que la casa común no
// puede ser ninguno de los dos componentes.
//
// OJO: `saga-index-filters.tsx` tiene su propio `segClass` y NO es este —el suyo
// es un segmentado a ancho completo (`flex-1`, fondo `bg-surface` con sombra).
// Son dos diseños distintos que se llaman igual; unificarlos sería un cambio
// visual, no una limpieza.

/** Píldora de tipo (prominente): la elección más "de un vistazo". */
export function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

/**
 * Segmento compacto (`.sortrow .s` del mockup): estado y orden, menudos, sin
 * fondo salvo el activo — pesan mucho menos que las píldoras grandes.
 */
export function segClass(active: boolean) {
  return `rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "bg-surface-muted text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;
}
