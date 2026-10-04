# Purga del espejo de partidas al cerrar sesión — #975

[Informe de verificación · 2026-10-04]

La salida real de Ajustes espera la purga de las **copias sincronizadas sin
tombstone** de la identidad validada por Auth. Conserva partidas pendientes,
intenciones de borrado, otras identidades, las guardadas anónimas y la partida
activa. Una transacción compartida con el contexto de sesión impide que el
trabajo de sincronización retirado repueble ese espejo después del logout.

## Diagnóstico y política

La [issue #975](https://github.com/borjar20/Biblioshare/issues/975) describe
retención en disco. `listSaved(identity)` ya aísla las listas: no se atribuye
una mezcla de cuentas en la UI. La prueba anterior al cambio del botón real
falló porque `A-synced` seguía presente al llamar a la acción de salida.

El diagnóstico con IndexedDB en RAM y el ejecutor real confirmó dos riesgos:
borrar indiscriminadamente elimina fuentes pending/tombstones, y una respuesta
de pull nueva puede volver a guardar A después de una purga simple. Se aplica
la política conservadora indicada por el coordinador: **no borrar pendientes
sin confirmación**. Un tombstone con `syncStatus="synced"` también se conserva:
ese estado acredita la subida original, pero el `remove` remoto aún debe
confirmarse. El predicado de purga es `synced && deletedAt === null`.

## Contrato aplicado

- IndexedDB pasa de v4 a v5 añadiendo únicamente `saved_sessions`, por identity.
  Guarda generación, session_id actual, estado de cierre e ids retirados.
  No guarda tokens, cookies, contraseñas ni decide permisos remotos.
- `getUser(token capturado)` valida el uid en el servidor; session_id leído
  del token sólo distingue login de refresh. Un refresh mantiene generación;
  un login nuevo puede abrir otra. Ningún id retirado puede reabrir, incluso
  después de varias salidas y reentradas de A.
- Cerrar la generación y purgar `saved` ocurre en una misma transacción. Los
  put/delete de sync verifican la generación en su propia transacción conjunta
  y comprueban también el propietario de la fila antes de tocarla.
- El canal existente `biblioshare:play:saved:<identity>` acelera la cancelación;
  no constituye la garantía. Una señal vieja no cancela una generación nueva.
- El candado de sync distingue generaciones. A nueva no espera la respuesta
  vieja, y el finally viejo no puede soltar su candado. Pull/ACK de push/remove
  tardíos se descartan; las fuentes pendientes siguen disponibles para repetir.
- Guardar desde una herramienta directa puede abrir una sesión nueva validada
  sin haber montado el historial. Sólo un intento de guardar con contexto
  cerrado consulta Auth; no hay consultas Auth por render. Un ACK local de
  save que llega después del cierre no vacía la partida activa.
- Logout registra el contexto validado aun si no hubo sync y espera la purga
  antes de revocar la sesión nativa o navegar. El módulo se carga al pulsar.
  El delete remoto añade filtro owner_id a los ids; conserva RLS existente.

## Pruebas y fronteras

Node **24.19.0**, Vitest **4.1.11**, fake-indexeddb **6.2.5**. La suite usa
IndexedDB real en RAM, logs sintéticos válidos y los módulos db/store/sync
reales. Dos módulos distintos abren dos conexiones a la misma factoría IDB;
se observa su orden transaccional y el rechazo sin recibir BroadcastChannel.
Auth, backend, acción de navegación y transporte de canal son fronteras
controladas. El caso de owner_id aplica filtros a un backend doblado: no
demuestra RLS real ni ejecuta SQL. Para save tardío sólo se retiene el callback
de confirmación de una transacción que sí ha escrito y confirmado en IDB.

| Verificación | Resultado | Evidencia propia |
|---|---|---|
| Botón real antes del arreglo | RED: 1/1 falla; copia A-synced permanece | `red-logout-01/output.log` |
| Purga indiscriminada y pull tardío originales | CONFIRMED; pérdida de fuentes/repoblación | `diagnosis-01/diagnosis.json` |
| Suite completa Play + logout | PASS: 500/500, 41 ficheros | `play-suite-06/result.json` |
| Controles causales finales | PASS: 24/24 | `mutant-control-02/result.json` |
| Nueve mutantes en RAM | 9/9 KILLED por aserciones, sin error de carga | `mutants-summary-02.json` |
| Typecheck sin caché incremental | PASS | `types-final-06/output.log` |
| Lint de 15 fuentes cambiadas y fixture tipada final | PASS | `lint-final-02/`, `lint-fixture-final-03/` |
| Diff y perímetro de archivos | PASS | `diff-check.log`, `source-hashes.json` |
| Navegador, backend real, build de producción | PENDIENTE de QA coordinada | No se iniciaron servicios |

Los mutantes eliminan, por separado, protección de pending, alcance por
identidad, comprobación transaccional de generación, rechazo de ids retirados,
protección del candado nuevo, comparación de generación del canal, filtro
remoto de owner_id, guarda de ACK local y reapertura de sesión al guardar.
Sólo se transforma código en RAM; los fuentes del checkout no se sustituyen.

También quedan conservados los fallos de preparación. `candidate-01` incluye
el orden de apertura de la segunda conexión y el interceptor antiguo que sólo
reconocía la transacción de un store; se corrigieron las fronteras de prueba.
`candidate-03` carecía de navigator.onLine en Node; el fixture ahora lo fija.
`types-final-04/05` detectaron la aridad sin tipo del builder doblado; se tipó.
No se presentan esos fallos como bugs de producto ni como mutantes abatidos.

Se incorporó main `2a1766b4c0a4747751c03dc144e1e44f2e933ba1`. La cobertura
de #977 conserva rollback exacto de v1 tras errores de petición asíncronos y
reintento sin reset; sólo añade el store v5 a la expectativa final. La prueba
v4→v5 aborta la creación aditiva y conserva esquema, saved y active originales;
el siguiente intento funciona. También verifica cierre por versionchange.
El informe histórico de #977 queda intacto. La suite emite una advertencia
act() en use-active-game.test.tsx; no hay errores no tratados en la ejecución.

## Límites y entrega

No es una limpieza total de datos del dispositivo: permanecen pending,
tombstones, active y los metadatos de cancelación; players/companion tampoco
son objeto de este ticket. Los ids retirados se retienen para impedir ABA y
no se presentan como credenciales. Borrar esas fuentes o diseñar borrado total
confirmado requiere una política aparte y seguimiento como issue por Root.

Sin Auth verificable, con IDB no disponible o con transacción abortada,
`purgePlaySavedOnLogout` devuelve fallo y el logout sigue siendo posible;
no se acredita purga ni barrera confirmada en ese caso. Una petición remota
ya enviada puede terminar: su ACK local retirado se descarta, conservando la
fuente para una pasada nueva. No se probó cuota física de disco, navegador
nativo, sesiones reales ni datos productivos.

Raíz de evidencias: `.scratch/ticket-campaign/20261002-resolve-all/play-logout-saved975-20261004/`
en el checkout raíz. `manifest.json` y su SHA-256 recogen el inventario de evidencias;
`source-head.json` y `source-hashes.json` fijan el candidato para revisión.
Root integra documentación central, seguimiento de los límites, QA y GitHub.
