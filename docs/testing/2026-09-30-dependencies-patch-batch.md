# Lote de parches de dependencias — #1234, #1233, #1232, #1181, #1180 y #1179

> **[Evidencia de ejecución · verificado el 2026-09-30]**

El lote agrupa Next y `eslint-config-next` 16.3.8, Undici 8.11.2, Brace
Expansion 1.1.21 y 5.0.12, `js-yaml` 4.3.2, `xmldom` 0.9.12 y Sharp 0.35.4.
Sharp conserva sus cierres de `@img/sharp-*` 0.35.4, libvips 1.3.3 y emnapi
1.11.3. `fastq` no cambia. React, Capacitor y los scripts permanecen fuera del
lote. Las seis propuestas originales se agrupan en una PR con el lockfile
reparado, instalación reproducible y un contrato Node compatible con jsdom.

## Comprobaciones realizadas

- `npm ci` real con scripts: 599 paquetes instalados y 600 auditados.
- Carga nativa en Windows x64: binding Sharp 0.35.4, operación PNG, helpers SWC
  0.5.23 y carga de `next-intl`, Undici, YAML y xmldom PASS.
- Unitarios: 393 archivos y 3796 pruebas PASS. Lint: 1839 archivos, 0 errores
  y 28 avisos preexistentes.
- Build de producción local: Node 24.19.0, Next 16.3.8 y Supabase local con 269
  pasos; BUILD PASS, 73 páginas y PPR conservado.
- Navegador con Next 16.3.8 en desarrollo: seis rutas autenticadas y dos públicas
  PASS; sesión conservada y arrays de errores de consola, página y peticiones
  vacíos. Evidencia: `deps-repair/browser-next-patch.log`. La prueba no escribe
  catálogo compartido ni modifica la cuenta QA.

La auditoría baja de 11 paquetes afectados a 5 (2 altos y 3 moderados); no es
una auditoría a cero. El residual se sigue de forma separada en
[#1249](https://github.com/borjar20/Biblioshare/issues/1249). No se informan
alertas de GitHub para este lote.

## Smoke local

| Superficie | Resultado |
| --- | --- |
| Cinco recorridos funcionales | PASS en 1,1 min. |
| Salud del servidor | FAIL parcial: dos errores de `revalidateTag ratings:movie` durante el render dentro de `after()` y cinco avisos `MaxListenersExceededWarning` de Gzip. |

Los hallazgos se siguen por separado en [#1250](https://github.com/borjar20/Biblioshare/issues/1250)
(`tipo:bug`, P2, invalidación) y [#1251](https://github.com/borjar20/Biblioshare/issues/1251)
(`tipo:sospecha`, P2, listeners). El log no se presenta como limpio ni se atribuyen
estos síntomas a la nueva versión de Next: falta el baseline con Next 16.3.0.

La carga nativa verificada es Windows x64; los binarios de otras plataformas
solo constan en el lockfile.
