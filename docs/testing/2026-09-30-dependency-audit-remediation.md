# Remediación de auditoría de dependencias — #1249

> **[Evidencia de ejecución · candidato local verificado el 2026-09-30]**

La remediación actualiza Vitest y sus siete paquetes internos a 4.1.11,
`baseline-browser-mapping` a 2.11.0, `browserslist` a 4.28.7 y `nanoid` a
3.3.18. El cierre requerido de Browserslist es `caniuse-lite` 1.0.30001814,
`electron-to-chromium` 1.5.443 y `node-releases` 2.0.57. Engines, Next, Sharp,
React, Capacitor, Fastq y `@swc/helpers` permanecen intactos.

## Comprobaciones

- Node 24.19.0 ejecutó `npm ci` normal, con scripts y sin
  `--legacy-peer-deps`: 599 paquetes instalados, 600 auditados y 0
  vulnerabilidades en todas las categorías.
- Vitest 4.1.11: 393 archivos y 3796 pruebas PASS en 166,09 s. No se añaden
  tests: son parches de dependencias cubiertos por la CI existente.
- Build de producción local con Next 16.3.8 y Supabase local (269 pasos): PASS,
  73 páginas y PPR conservado.
- Smoke después de la limpieza: 5/5 PASS en 48,2 s.

El primer smoke se conserva como FAIL interpretable: intentó limpiar una
fixture de baseline interrumpida antes de la prueba. El preflight de ownership
y la limpieza exacta posterior retiraron únicamente los actores y películas
sintéticos; la lectura final local confirmó cero restos. No se tocaron datos
remotos.

El smoke funcional no declara el servidor limpio. Persisten los errores SSR de
invalidación y los avisos de listeners/stream de navegación temprana, ya
seguidos por #1250 y #1251; no se atribuyen a esta remediación. La PR de #1249
aún debe crearse, por lo que esta evidencia no declara el cambio integrado.
