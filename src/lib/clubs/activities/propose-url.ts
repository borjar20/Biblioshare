// La URL que abre el asistente de proponer actividad, y su lectura. Las dos
// caras de lo mismo: quien construye el enlace y quien decide, al leerlo, si el
// asistente va abierto.
//
// Vive en `lib` y NO en `activity-composer.tsx` por un motivo que ya costó un
// 500 en la pestaña entera: aquel fichero empieza con "use client", y en Next 16
// eso convierte hasta una función pura en una referencia de cliente. Llamarla
// desde un Server Component revienta en tiempo de EJECUCIÓN:
//
//   Error: Attempted to call isComposerOpen() from the server but
//   isComposerOpen is on the client.
//
// Y no lo caza nada de lo que se corre antes: `tsc` pasa, `next build` pasa, y
// la página solo llega a esa línea con sesión de MIEMBRO -- sin sesión sale
// antes por el stub de club privado. Lo encontraron los e2e (issue #595).
//
// Regla, entonces: lo que llamen los dos lados se queda en un módulo sin
// directiva. Un fichero "use client" exporta componentes, no utilidades.

/** Los TRES puntos de entrada (cabecera de escritorio, cabecera móvil y el
 *  estado vacío de Próximas) apuntan aquí, y hay una sola instancia del
 *  asistente. */
export function proposeHref(clubSlug: string): string {
  return `/club/${clubSlug}?tab=actividades&nueva=1`;
}

/** Si el parámetro pide el asistente abierto. La comparación se hace en UN solo
 *  sitio a propósito: repartida por la página, la cabecera y la lista, cambiar
 *  qué abre el asistente obligaría a acordarse de tres sitios y nada avisaría
 *  del que se olvide.
 *
 *  Estricto contra `"1"`: `?nueva=0` o `?nueva=loquesea` no abren nada, y una
 *  clave repetida (que Next entrega como array) tampoco. Ante la duda, cerrado. */
export function isComposerOpen(nueva: string | string[] | undefined): boolean {
  return nueva === "1";
}
