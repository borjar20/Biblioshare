# Cambio de identidad en el hub de Play — #1230

> **[Evidencia de ejecución · verificada el 2026-09-30]**

`/partidas` conservaba las instancias de `SavedGames` y `PlayersManager` cuando
el subtree recibía una identidad distinta. Cancelar una lectura antigua evitaba
una actualización tardía, pero no ocultaba las filas ya cargadas de A mientras
la lectura de B estaba pendiente.

El componente síncrono `IdentityScopedHub` compone los dos clientes con claves
distintas por componente e identidad. La sesión sigue resolviéndose en el
Server Component; no se añade un boundary cliente ni se modifica la base de datos.

La prueba de integración monta ambos clientes reales y sustituye solo la lectura
local y la sincronización. Carga A, cambia a B con promesas pendientes y exige
que desaparezcan el historial y el contador de habituales anteriores.

| Comprobación | Resultado |
|---|---|
| Retirar únicamente la clave de SavedGames | RED: la prueba de historial encuentra «Partida A»; la de habituales pasa. |
| Retirar únicamente la clave de PlayersManager | RED: la prueba de habituales encuentra «1 jugador»; la de historial pasa. |
| Restaurar ambas claves | PASS: 2/2. |

Los dos fallos y el restore se verificaron con la misma prueba funcional; logs
locales `1230-red-saved.log` y `1230-red-players.log` en el directorio efímero de
la campaña. El tipado de las fixtures exige el contrato de registros locales.

El defecto confirmado es de conservación de estado local en el componente.
Esta prueba no navega un cambio de cuenta real en Next ni demuestra una fuga
de filas del servidor o un fallo de RLS.
