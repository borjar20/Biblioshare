# Pausa de la campaña de tickets — 2026-10-01

La campaña se pausa por petición de José Ángel. Se cerraron las dos PR abiertas,
[#1178](https://github.com/borjar20/Biblioshare/pull/1178) y
[#1261](https://github.com/borjar20/Biblioshare/pull/1261), conservando sus ramas.
Al cerrar, todas sus comprobaciones publicadas estaban en verde; las de #1178
eran del 10 de septiembre. No se deduce de ellas compatibilidad con el main
actual. El último ticket integrado fue #754 mediante PR #1259, main `9f5099d`.

## Trabajo conservado y aceptación pendiente

- **#1250:** implementación y documentación en `81ccae3`, con diez unitarios,
  tipos, lint, build de producción local y siete recorridos de navegador PASS.
  No se creó su PR antes de la pausa. La configuración de recuperación en
  producción se comprobó solo mediante consultas de objetos e indicadores,
  sin extraer secretos ni ejecutar una importación productiva.
- **#1260:** corrección independiente del proveedor sintético en la rama
  `codex/ci-provider-cache-1260`. El código de `7e101d2` pasó todos los controles
  publicados de PR #1261; la PR fue cerrada por petición del usuario. La issue
  sigue abierta y el cambio sigue pendiente de integración.
- **#1216:** implementación local y 21 pruebas de componentes PASS; el test
  previo dio 12 PASS y un FAIL porque no persistía al redimensionar con foco.
  La revisión estática plantea una posible doble escritura si llega resize
  seguido de blur; no se ha demostrado esa secuencia en navegador. Verificarla
  antes de publicar. La QA real quedó SKIPPED por un fallo del harness: faltaba
  `DETAIL_NOTES_NAMESPACE` al arrancar el proveedor. No se abrió el navegador
  ni se verificó la escritura real de `episode_watches`.
- **#1174:** tres esperas de login corregidas para exigir pathname efectivo y
  búsqueda vacía; lint y tipos PASS. No se ejecutaron sus recorridos e2e.

Las issues anteriores permanecen abiertas. Las sospechas Gzip siguen en
#1251; no se ha medido una fuga ni se han ocultado los avisos. Los registros
de FAIL, PASS y SKIPPED se conservan en `.scratch/ticket-campaign/`.

## Reanudación

El trabajo del checkout principal se conserva en la rama
`codex/ticket-campaign-paused-20261001`, con commits separados por cambio.
Los cambios preexistentes en `.claude/launch.json`, `.mcp.json` y `debug.log`
se preservan fuera de esos commits.

Al retomar, comprobar primero el estado real de GitHub y de las ramas. Integrar
#1260 separadamente de #1250, verificar #1216 en navegador con un namespace
válido y comprobar el orden resize/blur, y ejecutar los recorridos de #1174.
La compilación local de la pausa corresponde a #1250 y aún no incorpora #1216.
Supabase local conserva su estado; su arranque se hace con la CLI del proyecto,
sin reset ni cambios de credenciales compartidas.
