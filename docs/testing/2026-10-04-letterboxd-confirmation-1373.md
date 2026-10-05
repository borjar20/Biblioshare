# Confirmación durable antes de cerrar el ZIP de Letterboxd (#1373)

> **[Canónico · contrato del test y verificación local contra build/start
> comprobados el 2026-10-04; candidato sin publicar, CI final pendiente]**

**PASS local acotado.** El primer escenario de
`e2e/ci/letterboxd-archive.spec.ts` confirma mediante el formulario real, observa
por lectura fresca el job del propietario en `running`, comprueba una fila
`pending` y cero pases, y sólo entonces cierra la página. Retiene únicamente el
POST del dispatcher de ese job, sin fabricar respuesta. Después ejecuta el cron
real, exige trabajo positivo y ese mismo job en `done`, y conserva las aserciones
de historial, pendientes, privacidad, reseña y deshacer.

El FAIL original de CI permanece acreditado: el test cerró unos 4 ms después
del gesto, el cron devolvió `jobs:0, batches:0` y el regreso mostró el borrador.
Ese recorrido no prueba la recuperación de un trabajo confirmado ni acredita
que una RPC concreta se abortara. La corrección cambia la precondición del test;
no modifica el producto ni confirma mediante una RPC de escritura sustituta.

Base `2a1766b4c0a4747751c03dc144e1e44f2e933ba1`; candidato SHA-256
`6f060cba1daca51e0e164bd9a348390e207735f81f3fed67b02847aa9602e4ec`.
Build nueva `LtlMxgu08kYxCCscyxrR7`, Next 16.3.8 y Node 24.19.0,
Supabase local `biblioshare-local-eeaa203e`. Las tandas posteriores reutilizan
esa build tras verificar sus huellas y las 1.950 fuentes/configuraciones
congeladas. No se repitió la tanda normal ya acreditada.

| Tanda | Resultado | Frontera comprobada |
| --- | --- | --- |
| `run03-candidate` | PASS 1/1, 4,3 s | Confirmación real, `running` antes del cierre, incorporación posterior, privacidad y deshacer |
| `run04-held-confirm` | FAIL esperado | Confirmación retenida sin commit: la nueva espera rechaza `draft`; no alcanza cierre ni cron |
| `run05-api-case` | PASS 1/1, 2,5 s | Segundo escenario existente: procedencia, concurrencia, RLS entre cuentas, cron y deshacer protegido |
| `run06-held-release` | PASS 1/1, 4,2 s | Retención real hasta que el propio driver lee `draft` con la página abierta; liberación por señal, confirmación real, cierre y cron `jobs:1, batches:1` |

Las tandas usan un worker, cero reintentos y los timeouts de CI existentes.
Los dos escenarios existentes pasan en invocaciones focales separadas; no se
declara ejecutada la suite completa. La revisión independiente estática ya
dio PASS sobre el mismo SHA. El segundo caso conserva su confirmación RPC
explícita; esa ruta no sustituye la confirmación por UI del primer caso.

La retención de confirmación pertenece sólo al harness diagnóstico privado:
identifica `confirmArchive` en el manifiesto real de esa build y permite
continuar su petición real después de una lectura del driver, sin sleeps ni
respuestas inventadas. El control sin commit conserva su FAIL de 15 s; no es
una reproducción causal de la carrera original de CI.

Límites: en los dos recorridos positivos no se emitió un POST browser al
dispatcher antes de cerrar, por lo que su retención quedó registrada pero no
ejercida. Sí se acreditan `pending` y cero pases antes del cierre y escrituras
posteriores por cron. No se verifica el transporte natural del dispatcher,
la programación externa del cron ni Vault de producción. No se declara PASS
global de red: hay peticiones `ERR_ABORTED` conservadas. Los controles browser
tienen cero errores de página, consola y HTTP; el 401 del cron sin secreto y
los rechazos de acceso ajeno son resultados esperados del spec. Las capturas
asíncronas tienen límites de navegación; no sustituyen los locators ni las
lecturas persistidas y no acreditan una revisión visual general.

Evidencia privada, con recibos y manifiesto de hashes:
`.scratch/ticket-campaign/20261002-resolve-all/letterboxd-confirmation1373-native-20261004/`
(`native-report-v002.md`, `handoff-final-v002.json` y
`artifact-manifest-final-v002.json`). Los cuatro FAIL de preparación anteriores
y el error de sintaxis que interrumpió el primer sellado se conservan
diferenciados del producto. Las credenciales efímeras no se publican.

Limpieza conjunta: cinco actores y cuatro películas propios eliminados por
los `finally`, sin fallback; Auth devuelve 404 y las tablas de perfiles,
pases e importación quedan vacías para esos actores. Contextos y procesos
propios terminados; puertos 3000 y 3125 libres. Las tandas originales usaron
3000; la continuación usa 3125. El backend Docker compartido permanece activo.
No se modificaron `.env`, esquema, datos remotos ni configuración de producción.
