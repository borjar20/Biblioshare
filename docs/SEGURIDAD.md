# Seguridad — modelo de permisos y excepciones

> **[Canónico · verificado contra dev (con diff a prod) el 2026-08-19]**
>
> Cómo se decide quién puede leer/escribir qué, dónde viven las barreras y qué
> excepciones conocidas hay. Fuente: fase 2 de la auditoría 2026-08
> (`docs/audit/AUDIT-2026-08.md`, hallazgos `S2-###`). El detalle por tabla/policy
> está en `docs/requirements/data-model.md`. Lo roto y pendiente vive en issues.

## El modelo en una página

1. **RLS en todo.** Las 55 tablas de `public` tienen RLS activa y al menos una
   policy. No hay tabla abierta.
2. **Roles de aplicación** en `profiles.role`: `user` → `collaborator` → `admin`.
   `role` está blindado en BD por DOS triggers hermanos, uno por operación:
   `enforce_role_change_admin_only` (BEFORE UPDATE) y
   `enforce_role_insert_user_only` (BEFORE INSERT, `20260863`), más la policy de
   INSERT que exige `role='user'`. Los triggers son el cinturón que no depende de
   la policy: cubren REST, RPC, server action y SQL suelto. No se usan grants por
   columna aquí — `profiles` tiene grants de TABLA, y en PostgreSQL revocar una
   columna NO revoca el privilegio de tabla que la cubre (sería un no-op silencioso).
   El patrón de
   autorización del catálogo/curación es **doble barrera**: gate en servidor
   (`requireCollaborator`/`hasMinRole`) + gate en BD (trigger o policy con
   `has_min_role(...)`). Decisión 8-H.
3. **Visibilidad social**: el eje es `private.can_view_profile` (perfil público, o
   dueño, o seguidor aceptado) + `users_are_blocked` (bloqueos bidireccionales).
   Comentarios/reacciones exigen `can_view_interaction_target`.
4. **Transiciones sensibles solo por RPC** SECURITY DEFINER con gate de
   rol/ownership dentro (roles de club, transferencia de propiedad, aprobar
   solicitudes, pin, rondas, secuencia de saga). Regla: el gate de permisos va
   PRIMERO en el cuerpo de la RPC.
5. **Vistas identity** (`profile_identities`, `club_identities`, `club_stats`):
   SECURITY DEFINER **a propósito** — modelo Instagram: un anónimo puede ver
   nombre/avatar/bio de cualquier perfil y la existencia de clubes privados para
   las pantallas de «solicitar seguir/entrada». Son SOLO LECTURA (revoke ALL +
   grant SELECT). Es una decisión de producto registrada; sus dos flecos
   (descripción de club privado visible, bloqueos ignorados) están en revisión
   (S2-18, `tipo:acta` pendiente).
6. **Storage**: buckets `avatars`/`covers` públicos en lectura; la subida se
   valida en código (MIME allowlist jpeg/png/webp, tope 2 MB, path por
   `user.id`/UUID, content-type forzado) y las portadas oficiales además por
   allowlist de hosts. EXCEPCIÓN CONOCIDA: `uploadCover`/`uploadSagaCover`
   escriben con service-role y su única barrera es el gate TS previo (F1-012).
7. **Web**: cero `dangerouslySetInnerHTML` con datos de usuario y sin renderer de
   Markdown (sin sink de XSS); redirects validados (`safeNext`); export CSV sin
   IDOR. Búsqueda externa con hosts fijos (sin SSRF por ahí).

## Reglas que hay que conservar al tocar BD

- **Toda vista nueva nace con grants mínimos, y `security_invoker` salvo que
  exista una razón escrita para lo contrario.** El defecto de Supabase concede
  ALL (incl. escritura) a `anon`+`authenticated` en cada relación nueva (#691):
  una vista recreada sin re-revocar vuelve a ser escribible. Ese defecto es la
  raíz del P0 de `pass_reviews`, no la falta de `security_invoker`.
  **Desde `20260866` (2026-08-19) ese defecto está corregido en dev y en PROD**: el
  default de `postgres` ya no concede escritura, así que una vista recreada nace de
  solo lectura sola. El `revoke` explícito en cada recreación **sigue siendo la regla**
  —el default del grantor `supabase_admin` no se pudo endurecer (#710) y un
  cinturón de más no cuesta nada—, pero deja de ser lo único que separa a la app
  de reabrir #690.
- **Excepción con nombre: las vistas de enmascarado NO pueden ser
  `security_invoker`.** `pass_reviews` (y el mismo patrón en las vistas identity)
  existe para ser la única vía de lectura de columnas que la tabla base NO concede
  a nadie — `passes.review`, `dropped_reason`, `dropped_reason_note` están fuera de
  los grants por columna de `passes` a propósito. Con `security_invoker=true` la
  vista lee con los privilegios del que consulta y revienta con «permission denied
  for table passes» (comprobado en dev el 2026-08-19); hacerla funcionar exigiría
  conceder SELECT sobre `review`, o sea exponer por REST justo lo que enmascara.
  En estas vistas la barrera es **ser de solo lectura**: `grant select` + `revoke
  insert, update, delete` en CADA recreación. Ver migración `20260862` e issue #690.
- **Todo SECURITY DEFINER lleva `search_path` con `pg_temp`** (plantilla de
  `20260808_secdef_search_path_pg_temp.sql`). A 2026-08-19 hay 15 funciones sin
  él (S2-19) — re-ejecutar el barrido al tocar BD.
- **Grants por columna**: varias tablas tienen grant fino; una columna nueva sin
  su grant rompe la escritura ENTERA de la tabla (issue #375, dos veces).
  Superficie 6 de `docs/DRIFT-CHECK.md`.
- **dev primero, prod después**; el ledger de migraciones NO es fuente de verdad
  — verificar contra `pg_proc`/`pg_class`.

## Excepciones y riesgos abiertos (estado 2026-08-19)

Rastreados en issues; aquí solo el mapa. Detalle y explotación: fase 2 del
informe de auditoría.

| Riesgo | Issue | Estado |
|---|---|---|
| Escalada user→admin en alta pre-onboarding | #689/#687 | **Cerrado 2026-08-19** (policy `20260861` + trigger `20260863`, verificado en dev y prod) |
| Escritura de reseñas ajenas vía vista `pass_reviews` | #690/#688 | **Cerrado 2026-08-19** (revoke de escritura `20260862`, verificado en dev y prod; `security_invoker` descartado, ver regla de arriba) |
| Backup real de prod (PII) trackeado en git | #677 | **Cerrado 2026-08-19**: destrackeado + `/backups/` ignorado. El dueño decide NO purgar el historial (repo privado); a revisar si el repo se hace público |
| Catálogo global insertable por cualquier autenticado | #674 | **Cerrado 2026-08-19** en dev y prod: alta por RPC definer + hidratación fill-only, INSERT directo revocado (`42501` comprobado en prod). Arregla de paso #699 |
| Default privileges ALL a anon/authenticated | #691 | **Cerrado 2026-08-19 en dev y PROD** (`20260866`: el default de `postgres` pasa a `rxm`; las 4 vistas quedan en `anon=r`/`authenticated=r` — `pass_reviews` conservaba `rDxtm` también en prod). Resto: el grantor `supabase_admin` no se puede tocar desde `postgres` → #710 |
| RPC sagas TMDB sin gate de rol | #675 | **Cerrado 2026-08-19 en dev y PROD** (`20260864`: `link_tmdb_saga_item`/`sync_tmdb_saga_items` solo `service_role`; las llama el servidor con la colección ya resuelta contra TMDB). Verificado además por el advisor: desaparecen de `authenticated_security_definer_function_executable`. Queda abierto el INSERT de `sagas` → #709 |
| SSRF ciego vía endpoint de Web Push | #678 | **Cerrado 2026-08-19** (solo código, en prod con el deploy de #711): allowlist de host + rechazo de rangos privados al registrar, misma validación al enviar (cubre filas viejas) y `https.Agent` con `lookup` propio contra DNS-rebinding. Los 4 endpoints web de prod son `fcm.googleapis.com`: ninguno se queda fuera |
| DoS por `total_seasons` sin límite | #676 | **Cerrado 2026-08-19 en dev y PROD** (`20260865` + código): revoke de las columnas de tamaño (prod `series` 10→7, `movies` 8→7), CHECK de rango, concurrencia acotada y contar temporadas contra TMDB, no contra la fila |
| INSERT arbitrario en `credits`/`people`/`series_episodes` (`with_check true`) | S2-05 (issue pendiente de abrir) | P2 |
| CSV formula injection en export | #681 | P2 |
| Sin security headers/CSP ni middleware | S2-08 (pendiente de abrir) | P2 |
| Sin rate limiting en toda la app | S2-11 (pendiente de abrir) | P2 |
| Trigger de curación no cubre columnas `openlibrary_work_key`/`hydrated_at`/`editions_synced_at` | S2-14 (pendiente de abrir) | P2 |
| `hydrate_*` permiten a un `user` rellenar fichas vacías | #699 | **Es lo deseado y ya está resuelto (2026-08-19)**: son fill-only y solo rellenan huecos con datos del proveedor oficial; el flag `app.hydrating` las deja pasar el trigger de curación, que sigue exigiendo `collaborator+` para la edición manual. Verificado en prod |
| SW cachea HTML privado sin purga en logout | #680 | P1 |
| Tokens Supabase en Android | #679 | Código: AES-GCM con Android Keystore, archivo atómico en noBackupFilesDir y exclusión de preferencias antiguas de backup/transferencia. Verificado en emulador Android 16 (API 36): migración, tombstone, clave inválida y contención refresh/logout. Destino Supabase fijado y redirecciones desactivadas. Distribución del APK pendiente en #679; el merge no actualiza instalaciones existentes. |
| Saga raíz creable por cualquier user / HIBP desactivado | S2-13/S2-20 (pendientes) | P3 |

## Qué se verificó y está sano (no re-auditar sin motivo)

Escalada de `role` por UPDATE bloqueada; `follows` no filtra solicitudes a
terceros; RPCs de club/eventos con gate correcto y validación de entrada;
moderación (`content_reports`) bien acotada; sin mass-assignment; auth de
export; uploads validados en código. Lista completa: sección «Cobertura y
límites» de la fase 2 del informe.
