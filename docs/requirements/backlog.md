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

Cuatro problemas reales (dos pares de issues duplicadas a fusionar). **Todos
cerrados el 2026-08-19** — se conservan aquí como registro de qué eran y de cómo
se cerraron, no como trabajo pendiente.

1. ~~**#689/#687** — escalada user→admin en el alta de perfil pre-onboarding.~~
   **CERRADO 2026-08-19**: policy `20260861` (rescatada al repo) + trigger
   `enforce_role_insert_user_only` (`20260863`), verificado en dev y prod.
2. ~~**#690/#688** — escritura/borrado de reseñas ajenas vía la vista
   `pass_reviews`.~~ **CERRADO 2026-08-19**: la vista ya no tiene grants de
   escritura (`20260862`, rescatada al repo), verificado en dev y prod.
   `security_invoker` **descartado a propósito** — rompe la lectura, ver
   `decisiones.md` (2026-08-19).
3. ~~**#677** — backup real de producción (PII) trackeado en git.~~ **CERRADO
   2026-08-19**: destrackeado y `/backups/` ignorado. El dueño del repo decide
   **no purgar el historial** (repo privado, cuentas de prueba). A revisar si el
   repo pasa a ser público — los ficheros siguen en los commits anteriores.
4. ~~**#674** — envenenamiento del catálogo global.~~ **CERRADO 2026-08-19**: las
   seis migraciones en dev y prod, con `f` aplicada tras el deploy en verde.
   Comprobado en prod: `INSERT` directo → `42501`, alta por RPC → shell vacía.
   Arregla de paso #699 (hidratación de libros bloqueada para el rol `user`).
   Ver `data-model.md` §2.1.

**Los cuatro P0 de la auditoría 2026-08 quedan cerrados el 2026-08-19.**

## P1 — siguiente bloque (issues abiertas)

**Barrida del 2026-08-19: los diez P1 de escritorio quedan CERRADOS** (#691, #678,
#676, #675, #654, #643, #609, #584, #582, #514). Mergeada en #711 y **aplicada a
producción el mismo día**, con las migraciones DESPUÉS del deploy del código (son
restrictivas sobre caminos que el código viejo sí usaba). Detalle del esquema en
`data-model.md` §8.1 y de las decisiones no obvias en `decisiones.md` (2026-08-19).
Dos se cierran corrigiendo su diagnóstico: **#654 ya no reproduce** (los tipos de
`main` son idénticos a una regeneración desde dev y `next build` sale limpio; lo
arregló #674) y **#514 no es una fuga** (el 200 sirve el contenido del 404, con
`noindex`, y es comportamiento documentado de Cache Components — no se arregla).
Salieron cinco issues nuevas: #706, #707, #708, #709, #710.

Sigue abierto #699 (hydrate_book falla para rol user) y los P1
móviles #679/#680. Y de la auditoría 2026-08 (issues por abrir): F1-001
(reseñas de serie invisibles), F1-002 (import crea pases sin fechas),
F1-003 (triggers escriben en `library_entries`), F4-001 (ficha de serie rota en
móvil), F4-010 (RatingDots inoperables a dedo), F4-018 (auto-zoom iOS),
F3-006/F3-010/F3-012 (CTA, IA de navegación, destructivo inline).

## P2 — mantenimiento (acciones 6-9 del roadmap)

**Acción 6 — hit-areas + RatingDots táctiles: HECHA el 2026-08-20.** F4-010
(puntuar a dedo pasa a ser un arrastre con la nota visible), F4-013 (check de
episodio visto) y F4-015 (regla de sistema `tap-44`, aplicada al trigger de
`ActionMenu`, el cierre de sheets, las flechas de reordenar y la píldora
«Saltar»). Decisiones en `decisiones.md` (2026-08-20 noche) y la regla en
`UI-GUIA.md` §«Reglas móviles y táctiles» 1 y 9.

**Acción 7 — sistema mínimo de UI: HECHA el 2026-08-20.** F3-006 (el CTA
principal deja de cambiar de color por tipo de medio), F3-014 (`Button` cierra
en cinco variantes, con `danger`; la tarjeta de club entera es el enlace),
F3-012 (lo destructivo se va detrás del «···» y pregunta cuando arrastra otros
datos), F3-015 (`EmptyState` gana talla `panel` y llega a búsqueda, clubes,
agenda y colecciones vacías) y F3-011 (glosario canónico en
`docs/UI-GLOSARIO.md`: «Biblioteca» y «Cuaderno»). Decisiones en
`decisiones.md` (2026-08-20 tarde) y las reglas 3, 4, 7 y 8 de `UI-GUIA.md`.
Quedan fuera a propósito F3-013 (unificar `WorkCard`) y F3-009 (los cuatro
patrones de navegación secundaria): son refactores con su propio alcance.

Quedan de este bloque:
acción 8 (IA de navegación + página de Ajustes — F3-010, F4-007, F1-025,
F1-024), acción 9 (pasada de revalidación — F1-014/023/030/027), y los sueltos:
contraste y `<main>`/skip-link (F4-022/023), security headers + rate limiting
(S2-08/S2-11), formula injection (#681), trigger de curación (S2-14), regenerar
`graph.json` y `database.types.ts` (#695, #701, #625), y las migraciones
fantasma de F1-017 (5 RPCs de hidratación solo en dev).

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
