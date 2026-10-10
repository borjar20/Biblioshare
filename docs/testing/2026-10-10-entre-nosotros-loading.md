# Carga visual de Entre nosotros

**[Histórico · evidencia del candidato local, 2026-10-10]**

El estado de carga de la comparación y del detalle utiliza `ComparisonLoading`:
tres círculos y portadas simbólicas animadas con CSS; el detalle usa la variante
compacta. El gráfico no recibe evidencia y las etiquetas traducidas siguen en una
región de estado. No hay cambios de consultas, sesión, errores ni fallback SSR.

## Verificación

- 45 pruebas existentes de `explorer.test.tsx` y `work-detail.test.tsx` PASS.
- TypeScript (`tsc --noEmit`), ESLint focal y `git diff --check` PASS.
- Revisión independiente del componente, consumidores y CSS: sin hallazgos.
- Chromium con el componente y CSS Modules reales en un harness: ocho escenarios
  (general/compacto × 1280/320 px × claro/oscuro), sin desbordamiento horizontal.
- Transformaciones distintas a 0/1000/2200 ms y retorno exacto a 4400 ms; también
  se comprobó el avance real durante 1000 ms. Movimiento reducido: cero animaciones
  y composición estática.
- Una región de estado con texto visible; SVG decorativo `aria-hidden`.
  Cero errores de consola, solicitudes fallidas o peticiones externas en el harness.

Capturas y medidas: [journal](assets/2026-10-10-entre-nosotros-loading/journal.json),
[escritorio claro](assets/2026-10-10-entre-nosotros-loading/full-1280-light-2200ms.png)
y [móvil oscuro](assets/2026-10-10-entre-nosotros-loading/full-320-dark.png).

El harness valida el dibujo y su composición con los estilos reales; no acredita
un nuevo recorrido autenticado, de base de datos ni de producción. La integración
de los consumidores se cubre con las pruebas existentes; CI y publicación quedan
registradas en la PR de esta entrega. No se crean fixtures ni servidores de Next.
