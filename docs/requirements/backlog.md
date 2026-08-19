# Backlog — trabajo pendiente

> **[Estado vivo · reconstruido contra código + issues el 2026-08-19]**
>
> **Las issues SON el backlog operativo** (regla de AGENTS.md): 246 abiertas a
> 2026-08-19, todas con área/tipo/prioridad. Este doc es el mapa de medio plazo:
> qué features NO existen aún y por dónde empezar. **Lo hecho ya no vive aquí**:
> el mapa de lo que existe es `docs/PROYECTO.md`. La narrativa de cómo se hizo
> cada cosa, en `docs/superpowers/specs/`.
>
> Reconstrucción 2026-08-19: se retiraron de «pendiente» tres items que ya
> estaban construidos (§7.4 colecciones, §7.15 listas curadas, §7.20 clubs con
> hitos anti-spoiler) y dos con redacción obsoleta (regenerar types por sagas;
> «compilar Android» bloqueado por un bloqueo que ya no existe).

## P0 — antes de seguir desarrollando

Cuatro problemas reales (dos pares de issues duplicadas a fusionar). **Estado al
2026-08-19: dos cerrados, uno a medias, uno pendiente de despliegue.**

1. ~~**#689/#687** — escalada user→admin en el alta de perfil pre-onboarding.~~
   **CERRADO 2026-08-19**: policy `20260861` (rescatada al repo) + trigger
   `enforce_role_insert_user_only` (`20260863`), verificado en dev y prod.
2. ~~**#690/#688** — escritura/borrado de reseñas ajenas vía la vista
   `pass_reviews`.~~ **CERRADO 2026-08-19**: la vista ya no tiene grants de
   escritura (`20260862`, rescatada al repo), verificado en dev y prod.
   `security_invoker` **descartado a propósito** — rompe la lectura, ver
   `decisiones.md` (2026-08-19).
3. **#677** — backup real de producción (PII) trackeado en git. **A medias**:
   destrackeado y `/backups/` ignorado el 2026-08-19; **queda decidir si se purga
   el historial** (los ficheros siguen en todos los commits anteriores).
4. **#674** — envenenamiento del catálogo global: **cerrado en dev, abierto en
   prod** hasta desplegar la migración F con el código nuevo (rama
   `fix/674-catalogo-server-authoritative`, sin PR a 2026-08-19).

## P1 — siguiente bloque (issues abiertas)

#699 (hydrate_book falla para rol user), #691 (default privileges ALL),
#678 (SSRF Web Push), #676 (DoS total_seasons), #675 (RPC sagas TMDB sin gate),
#654 (database.types.ts desincronizado — con #695/#625/#701),
#643 (nota media de saga en base 10), #609 (créditos huérfanos — cuantificado en
F1-008: ~80 % de `credits` en dev), #584 (e2e club tumba el dev server),
#582 (doc hora de Encuentro), #514 (PPR devuelve 200 en notFound), más los P1
móviles #679/#680. Y de la auditoría 2026-08 (issues por abrir): F1-001
(reseñas de serie invisibles), F1-002 (import crea pases sin fechas),
F1-003 (triggers escriben en `library_entries`), F4-001 (ficha de serie rota en
móvil), F4-010 (RatingDots inoperables a dedo), F4-018 (auto-zoom iOS),
F3-006/F3-010/F3-012 (CTA, IA de navegación, destructivo inline).

## Features que no existen (P2-P3, por dominio)

**Biblioteca y ejemplar**
- Etiquetas privadas del usuario (§7.5).
- Modo «en pausa» como estado explícito (§7.16 = issue #426; decisión 8-A).
- Método de adquisición / detalles del ejemplar (`copy_details`, §7.29).
- Modo sin spoilers GLOBAL (§7.30) — la infraestructura parcial existe
  (spoiler-flag en notas/posts, gate por progreso en clubes); falta el modo.
- OCR de citas (§7.27).

**Estadísticas y retos**
- Diario emocional / contexto del pase (§7.18; solapa con #427/#428).
- Retos personalizables (§7.23; #310 aporta el vocabulario de género).
- «Tu año en Biblioshare» (§7.24) y comparar bibliotecas (§7.25).

**Social y clubes**
- Listas colaborativas (§7.26; hoy solo existe `list_challenge` de club).

**Descubrimiento**
- Seguir editoriales (§7.6), tabla de adaptaciones/relaciones entre obras
  (§7.21; decisión 8-B), recomendador (§7.19).

**Notificaciones**
- Recordatorios personales (pausas largas, estrenos) (§7.17). La dependencia
  que citaba («falta push + pg_cron») YA existe y entrega en prod — es solo
  construir el dominio personal encima.

**Nativo**
- Capacitor iOS (no existe `ios/`; épica #497).
- Android: verificaciones en dispositivo real y release pendientes (#485, #541).

**Infra futura**
- Offline-first con escritura; IGDB/videojuegos como cuarto tipo.

## Deuda transversal priorizada por la auditoría 2026-08

El informe (`docs/audit/AUDIT-2026-08.md`, resumen ejecutivo final) ordena el
trabajo por impacto/riesgo/coste. Los ejes: hidratador polimórfico único
(F1-020+F1-016), fichas triplicadas (F1-021+F3-005), invariantes de `passes` sin
respaldo en BD (F1-011+F1-009), pasada de revalidación (F1-007/014/023/030),
sistema mínimo de UI (F3-006/012/014/015), targets táctiles (F4-015) y
contraste (F4-022).

## Cómo se usa este doc

- ¿Está hecho X? → `docs/PROYECTO.md`.
- ¿En qué estado está el bug/deuda Y? → issues (`gh issue list`).
- Al terminar una feature de esta lista: quitarla de aquí, añadirla a
  PROYECTO.md, y la narrativa a una spec. Lo que quede pendiente → issue.
