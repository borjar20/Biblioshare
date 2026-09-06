# Implementación de #929, #923, #921, #900 y #879

> **[Evidencia de sesión · 2026-09-06 · base 08e7a950 · entrega para commit y PR]**

Los cinco tickets quedaron asignados a `maxteryo`. No se han cerrado tickets. Se prepara la publicación de cambios
de código. Se preservaron los cambios previos en CLAUDE.md, docs/TESTING.md y docs/agents/.

## Resultado por ticket

| Ticket | Resultado | Límite |
| --- | --- | --- |
| #923 | Verificación de autoría, preferencia exacta común a libros/películas, evaluación local+API y no desempate automático entre obras diferentes. ISBN intacto. | Las filas sin match usan la resolución manual existente; código aún sin desplegar. |
| #921 | Igualdad de título conserva orden/repetición y exige también igualdad Unicode de la búsqueda. | No se ejecutó el barrido #912. Títulos editoriales con palabras distintas exigen revisión. |
| #929 | Proxy con getClaims; conserva cookies renovadas y cabeceras anticaché en redirects. | Mitigación local: no demuestra la causa del incidente ni elimina red para refresh/firma simétrica o lecturas canónicas de usuario. |
| #900 | Ya aplicada: verificado el objeto real tanto en dev como en producción. Documentación corregida. | No se reaplicó ni se verificó el resto de la fase destructiva. |
| #879 | Migración privada para propagar href al reasignar obra, con reparación histórica y regresión SQL integrada en el bootstrap. | Aplicada y verificada en dev y producción con autorización explícita. |

## Pruebas y evidencias

Node 22.23.1, Next 16.3.0, Supabase CLI 2.116.0. Sin cambios en dependencias ni archivos .env.

- **TDD:** reproducidos antes de corregir: autor incorrecto aceptado; título local parcial
  elegido antes del exacto de API; selección silenciosa entre obras; fusión por orden de
  palabras; fusión por pérdida de caracteres Unicode; bloqueo del proxy por getUser;
  pérdida de cookies renovadas en redirects; href de sesión desactualizado al reasignar pase.
- **Suite completa:** `vitest run --maxWorkers=1 --no-file-parallelism`: 316 archivos,
  3270 pruebas PASS, 0 fallos. Duración 145,49 s. Avisos de navegación no implementada de
  jsdom, sin fallos. Tras la revisión: 121 pruebas específicas PASS; tras ajustar el tipo
  de un fixture: las 46 pruebas de reconciliación PASS.
- **Typecheck y compilación:** primer build FAIL por fixture de prueba cuyo título estaba
  tipado como nullable; corregido a un literal. `tsc --noEmit` y segundo `next build` PASS.
  El build utilizó variables de proceso de Supabase local, sin sobrescribir .env.local.
- **Lint:** PASS en los seis archivos TS cambiados/añadidos.
- **Base desde vacío:** 236 pasos (inicial + 235 migraciones), 7 pruebas del generador PASS;
  `scripts/db/verify.mjs` PASS, incluida la regresión SQL nueva con rollback.
- **SQL #879:** sesiones, comentarios, respuestas con parent_id, query de comunidad,
  anclas individuales, cambio de tipo de obra, reparación histórica, post ajeno intacto
  y propietarios/audiencias conservados. Helper privado sin EXECUTE para anon/authenticated.
- **SDK real + next start:** usuario local desechable, login real, validación de claims,
  cookie de onboarding, redirect de invitado, redirect desde login y respuesta autenticada
  de /coleccion con «Mi Biblioteca»: PASS. Usuario eliminado al terminar. El comprobador
  se ajustó a redirects relativos y al título real de la página.
- **Aviso residual:** el servidor registró HANGING_PROMISE_REJECTION de Auth durante el
  prerender de /coleccion, aunque el recorrido HTTP pasó. Es el mismo digest documentado
  en #1098 para /mascota; no se ha demostrado que tenga la misma causa ni que lo introduzca
  este cambio. #929 conserva su investigación pendiente.
- **Arquitectura:** graph.json y map.html sincronizados y validados.

Los logs locales están en `.superpowers/triage-2026-09-06/`: unit.log, build.log (FAIL),
build-2.log (PASS), start.log y el comprobador puntual verify-proxy.ts.

## Estado remoto verificado por lectura

`get_widget_snapshot()` en dev y producción: `md5(prosrc)`
`358c7aa6950f1b71a5790541fe39a89b`, longitud 10083, sin referencia a is_primary. Coincide con
la definición prevista por #900.

Antes de aplicar #879, la consulta que deriva los mismos href esperados por la migración
arrojó: dev 354 targets examinados / 0 cambios; producción 649 / 0 cambios. Es una fotografía,
no una garantía sobre escrituras futuras. El fallo sí se reprodujo con un pase sintético local.

La revisión automática rechazó aplicar #879 al proyecto `biblioshare-dev`
(`tyvzpuhxfwxrnkcpzxyg`), alegando falta de autorización específica para modificar funciones
SECURITY DEFINER y ejecutar la reparación. El mensaje lo describió como producción; se
confirmó por get_project que el destino solicitado era dev. No se reintentó por otra vía.

Los advisors de dev ya mostraban avisos previos sobre vistas y funciones ajenas al cambio;
no se interpreta su lista como un gate global en verde. Tras la autorización, los advisors de ambos entornos no identifican las funciones de esta migración; siguen existiendo avisos ajenos al cambio.
Referencia de la regla de [funciones expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Standards

Primera revisión: un recuento documental obsoleto y una recomendación de compartir la
preferencia de título exacto. Ambos atendidos. Revisión posterior: **0 hallazgos pendientes**.

## Spec

Revisión independiente: **0 hallazgos sustantivos** de requisitos ausentes, desviación de
alcance o comportamiento incorrecto dentro de los límites declarados.

Ambas revisiones usaron Terra medium y la base acordada por el usuario; fueron de solo lectura.
El usuario autorizó la aplicación en dev y producción, el commit y la PR. Los tickets permanecen abiertos hasta la integración; #929 conserva la investigación pendiente. Servidor y contenedores locales detenidos.

Referencia del cambio Auth: [guía oficial de Supabase para Next.js](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).

## Aplicación remota autorizada

El 2026-09-06, tras autorización explícita, se aplicó #879 primero en dev y después en producción.
Ambas llamadas a apply_migration devolvieron success=true. Los objetos reales coinciden:
refresh_pass_interaction_hrefs: md5(prosrc) 17db42a6f7fe8d2c4cc2e5aa3521e49b;
sync_pass_interaction_targets: md5(prosrc) 3c402eb1a92f263b98f077a96042fb3d.
Ambas funciones tienen search_path vacío y carecen de EXECUTE para anon/authenticated.
Después: dev 354 targets / 0 href obsoletos; producción 649 / 0.

La regresión sintética remota en dev fue bloqueada por execute_sql con ERROR 25006
(read-only transaction) en el primer INSERT. No se sorteó la restricción. Su resultado
funcional es PASS local; la verificación remota cubre objetos, permisos y datos existentes.
No se ejecutaron fixtures en producción.