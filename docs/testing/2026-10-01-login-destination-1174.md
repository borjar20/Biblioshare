# Esperar al destino efectivo del login — #1174

> [Verificado localmente · 2026-10-01] · Chromium y Supabase locales.

Los dos casos de mascota y el de Cuaderno comparan `URL.pathname` con el
destino y exigen query vacía. La expresión anterior que terminaba en
`/mascota` o `/notas` también aceptaba `/login?next=/mascota` y
`/login?next=/notas`, antes de tener sesión.

El harness ejecutó las tres expresiones `page.waitForURL` extraídas de los
specs reales. Retuvo el POST del login después de pulsar el botón: la URL de
login satisfacía el matcher antiguo y la espera nueva siguió pendiente.
Al liberar el mismo POST sin alterar su respuesta, las tres esperas llegaron
al pathname correcto sin query y al contenido autenticado de la mascota o
del Cuaderno. No hubo errores de página. Evidencia:
`.scratch/ticket-campaign/qa1174-local/1790841392759/result.json` y capturas.

También se ejecutó `critical-flows.spec.ts`: 2/2 PASS en 4,9 s, incluido login,
búsqueda móvil del Cuaderno y retorno a Biblioteca. Tipos y lint de los tres
specs: PASS. Las fixtures propias de perfil, mascota, misiones, combates y
cuenta terminaron sin filas; no se usaron las cuentas persistentes de dev.

La comprobación focal de mascota cubre su login y llegada al campamento, no
el combate completo ni la comparación de equipo. Esos dominios no cambian.
El servidor servido fue el build de producción local
`PY9Lk-Om0rzSws3aetVUP`, que incluía la corrección de #1216 ya integrada.
Los controles publicados de la PR construyen el candidato correspondiente.
