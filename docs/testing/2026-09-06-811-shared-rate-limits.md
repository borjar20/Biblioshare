# #811 — cuotas compartidas

**Estado, 2026-09-07:** migración aplicada primero en dev y después en producción con autorización expresa, y verificada en ambos entornos. Base de revisión `5c6e501`. No se cambian dependencias ni secretos. El código de la aplicación sigue en la PR, sin fusionar.

## Contrato

Ventanas fijas desde el primer consumo, separadas por usuario autenticado y operación. Un UPSERT bloquea una sola fila y serializa peticiones de distintas instancias. Como toda ventana fija, puede admitir dos ventanas de actividad cerca de su frontera; no pretende ser un límite deslizante ni protección global contra múltiples cuentas.

| Operación | Capacidad / ventana |
|---|---|
| Apertura/alta desde búsqueda sin catalogId | 60 / minuto |
| Intentos de INSERT de catálogo, incluidas RPC | 6000 / hora |
| Parsear CSV | 6 / hora |
| Procesar filas CSV y resolver filas | 6000 filas / hora |
| Guardar pendientes CSV | 6000 filas / hora, independiente del procesamiento |
| Posts / comentarios / reacciones / follows | 20 / 60 / 120 / 30 por minuto |
| Registro/actualización de push devices | 20 / 10 minutos |
| get_activities_progress / get_club_round_state | 120 por minuto cada una |
| save_saga_sequence | 30 / minuto |

Las actions cargan el contador antes del trabajo externo; si la consulta falla, detienen la operación. Una carga admitida consume el presupuesto aunque después falle el proveedor. Los triggers y RPC consumen dentro de su transacción: si toda ella revierte, también revierte el contador. Se limitan las escrituras confirmadas y las lecturas RPC exitosas, no se persisten intentos de transacciones fallidas. Los INSERT con conflicto pueden consumir antes de detectar duplicados; push UPSERT puede ejecutar INSERT y UPDATE y cobrar ambos.

No se limita DELETE: retirar contenido, dispositivos o follows sigue disponible. El siguiente INSERT de un ciclo follow/unfollow sí consume. Service/background sin JWT no consume cuotas de usuario y conserva la autorización preexistente. La búsqueda externa es el alcance separado de #684.

No se exponen tablas de cuota ni parámetros de capacidad. La RPC cliente solo acepta operaciones fijas y costes positivos acotados; llamar a ella consume la cuota propia, nunca la recupera. Cada usuario ocupa como máximo 13 filas, que desaparecen al borrar su cuenta.

## Verificación

- RED SQL: la regresión falla por ausencia de `consume_request_quota` antes de implementar.
- GREEN SQL local: importación de 3000 filas, agotamiento, aislamiento entre dos identidades, vencimiento, permisos, coste negativo, ausencia de sesión, triggers de catálogo/follow/push, presencia de los nueve triggers y guard de las tres RPC; fixtures con rollback.
- Concurrencia local: 25 conexiones reales, exactamente 20 admitidas y 5 rechazadas; fixture eliminado y contador en cascada comprobado.
- Bootstrap vacío: 237 etapas, contratos y privilegios PASS; siete pruebas del generador PASS.
- TDD de actions de catálogo: tres fallos iniciales, siete pruebas finales entre catálogo/CSV PASS. Se verifica que rechazar cuota evita crear/hidratar y que 3000 filas usan una sola carga de coste 3000.
- Typecheck PASS; lint afectado sin errores (un warning preexistente `_prevState` en importar/actions).
- Primera suite completa: 322 ficheros PASS y 9 fallos en `manual-resolution.test.ts` por no simular la nueva RPC. Se corrige el simulador para admitir cuota y se conserva la comprobación de metadatos sobre la llamada de registro, identificada por nombre en vez de posición.
- Suite completa tras ajustar el simulador: 323 ficheros, 3304 pruebas PASS (131,85 s). Después, tres pruebas adicionales de push PASS: RED antes de añadir la cuota a las actions que escriben con service_role y GREEN después. Typecheck y lint del delta PASS.
- Revisiones independientes Standards y Spec: cero hallazgos en cada eje, incluida segunda revisión del delta de push.
- Superficie 6 local: 13 tablas con grants parciales preexistentes; no cambian columnas/grants públicos. La nueva tabla privada queda sin SELECT/INSERT/UPDATE/DELETE para roles cliente, comprobado por la regresión.

## Aplicación

El registro push usa `service_role`, por lo que su action consume la cuota usando el cliente autenticado ANTES del DNS y del borrado/alta privilegiado. El trigger cubre en paralelo la escritura directa con JWT. Una denegación previa conserva el dispositivo ya registrado; las bajas siguen disponibles.

`20260906213325_shared_rate_limits.sql` aplicada mediante `apply_migration` en dev (`tyvzpuhxfwxrnkcpzxyg`) y, tras verificarlo, en producción (`vmutcradmodhiltuohys`). Ambas aplicaciones devolvieron éxito. La RPC requerida por el nuevo bundle ya existe en ambos entornos.

Verificación remota de solo lectura contra objetos reales, no contra el ledger:

- Nueve triggers `request_quota` activos en ambos entornos.
- RLS activo en la tabla privada; `authenticated` sin lectura/escritura y `anon` sin lectura. `consume_request_quota` ejecutable por `authenticated`, no por `anon`; helper privado no ejecutable por `authenticated`.
- Las tres funciones guardadas conservan exactamente OID, firma, ACL, search_path y cuerpo previo de consulta; solo se añade el guard. Las tres quedan VOLATILE/SECURITY DEFINER.
- No se ejecutaron fixtures ni pruebas de agotamiento sobre datos remotos: la comprobación funcional/concurrente corresponde a la base local desechable.
- Advisors de seguridad consultados en ambos entornos. La tabla privada genera el aviso informativo [RLS sin policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), intencional: ningún cliente accede al contador. La RPC autenticada genera el aviso genérico de SECURITY DEFINER; exige `auth.uid()`, operaciones/costes cerrados y conserva la tabla sin grants. No se interpreta el listado global de avisos sobre objetos ajenos como una auditoría resuelta por #811.

Las tres funciones remotas se inspeccionaron por `pg_proc`: mismas firmas/lenguajes esperados; `get_club_round_state` difiere entre dev y producción solo por un comentario. La migración conserva el cuerpo existente en cada entorno, su firma/OID y ACL; inserta el guard sin reconstruir las consultas desde una copia desactualizada. Los lectores pasan a VOLATILE porque ahora escriben el contador. Los clientes actuales usan RPC POST.
