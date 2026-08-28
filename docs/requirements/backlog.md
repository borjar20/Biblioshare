# Backlog — trabajo pendiente

> **[Estado vivo · reconstruido contra código + issues el 2026-08-19 · §P0/§P1
> reverificadas contra issues y BD el 2026-08-24 · recuento de issues al
> 2026-08-28]**
>
> **Las issues SON el backlog operativo** (regla de AGENTS.md): **330 abiertas a
> 2026-08-28** —**0 P0**, 6 P1, 227 P2, 97 P3—, todas con área/tipo/prioridad;
> la suma cuadra con el total, así que no hay ninguna sin etiquetar. Las 66 que
> entran respecto al 2026-08-24 son casi todas del plan obra/edición/
> representación (bloque de abajo): una rama que abre 37 issues no es una rama
> que fuera mal, es el precio de trocear una pieza grande sin encadenar
> hallazgos a la PR en curso. Siguen sin haber P0. Este doc es
> el mapa de medio plazo: qué features NO existen aún y por dónde empezar. **Lo hecho ya no vive aquí**: el mapa de lo que existe es
> `docs/PROYECTO.md`. La narrativa de cómo se hizo cada cosa, en
> `docs/superpowers/specs/`.
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

**Puesta al día del 2026-08-24.** El párrafo que había aquí llevaba tres días
mintiendo: listaba como «issues por abrir» hallazgos que las acciones 3-8 ya
habían cerrado. Estado real:

- **#699 cerrado** (lo arregló #674, ver P0 arriba). **#679/#680 no son P1**: se
  reetiquetaron a P2 y viven con el resto de sueltos del bloque de abajo.
- **Cerrados en las acciones 3-5** (2026-08-20, `decisiones.md` de ese día):
  F1-001 → #713 (reseñas de serie invisibles), F1-002 → #714 (import sin fechas),
  F1-004 → #715, F1-005/006 → #716, y los triviales de móvil F4-001/002/012 más
  F4-011 → #722 (controles del mapa) y F4-018 → #724 (auto-zoom iOS).
- **Cerrados en las acciones 6-8** (2026-08-20/21): F4-010/013/015,
  F3-006/011/012/014/015 y F3-010/F4-007/F1-025. Detalle en el bloque P2.
- **F1-003 → #782, CERRADO el 2026-08-24 eliminando la feature.** Los dos
  triggers (`autoadd_library_on_activity_join/item`) escribían en
  `library_entries` —congelada, y que la app no lee— en vez de crear un pase, así
  que el «auto-añadir a biblioteca» de las actividades de club no hacía nada
  visible. Se eligió **borrarlos y levantar acta** en vez de reimplementarlos
  contra `passes`: esa tabla tiene máquina de estados propia y obligaba a
  resolver el choque con un pase preexistente desde un trigger *cross-user*.
  Migración `20260876`, aplicada a dev y prod; verificado contra `pg_proc` que ya
  **no queda ningún escritor** de la tabla. Las 153 filas de prod se dan por
  perdidas. Acta permanente en **#784** (`tipo:acta`) y razonamiento en
  `decisiones.md` (2026-08-24).

**#751 cerrado el 2026-08-24** (la hidratación perezosa de las fichas no corría
en producción: el cliente de la petición acababa dentro de `after()`). Mergeado
en la PR **#756**, detrás de la **#752** (acción 9), con las dos ramas puestas
al día contra `main` ese mismo día. Verificación: typecheck limpio, 1.912
unitarios, `next build` verde y los e2e **contra `next start`** —la única vía
que ve ese fallo—, con `busqueda-hidratacion` comprobando la columna
`hydrated_at` y no «la ficha sigue viva». De paso entra `after-guard.test.ts`,
que recorre los Server Components y falla si un callback de `after()` vuelve a
tocar el cliente de la petición.

**Con #782 cerrado no queda ningún P1 abierto en el repo** (0 de 264, comprobado
por etiqueta el 2026-08-24 — no con `gh issue list`, que trunca en silencio a
partir del `--limit`). El siguiente trabajo sale del bloque P2 de abajo.

Salió una issue nueva al verificar: **#785** (`tipo:sospecha`) —
`e2e/pase-hub.spec.ts` sale rojo cuando corre junto a otros specs y verde en
solitario, contra build de producción. No es una regresión de este cambio (la
rama es byte-idéntica a `main` en `src/`); se sospecha contención sobre la cuenta
compartida `devtest`, la misma familia que #750. Sin confirmar.

**Corrección del 2026-08-25: el «cero P1» duró un día.** Ese mismo 2026-08-24, al
cerrar la rama de reacciones con emoji libre, se abrieron **#787 y #788** — dos
e2e sociales en rojo, ambos `P1`. **Cerrados el 2026-08-25** reparando los specs,
no la app: ninguno era una regresión, los dos afirmaban un producto que se había
cambiado a propósito. `thoughts.spec.ts` esperaba el hilo desplegable dentro de
la tarjeta del feed (posts Spec 2b lo movió a `/post/[id]`) y
`social-interaction-targets.spec.ts` esperaba un pase sin post visible en el feed
(#558 lo dio por invisible para v1) y un botón «Me gusta» que el `ReactionBar` de
emoji libre había sustituido. Razonamiento en `decisiones.md` (2026-08-25). La
lección, que es la que vale para la próxima: **un cambio de superficie deja tests
mintiendo en specs que no toca, y no se ve hasta que la suite entera corre.**

Al verificar salieron **seis tests más en rojo, todos preexistentes en `main`** y
todos de la misma familia, con tres causas distintas que NO se mezclan:
**#802** (P1, `posts.spec.ts` ×3: la copia de la campana de #799),
**#801** (P1, `social-optimista` + `social-safety:159`: «Me gusta» renombrado a
«corazón rojo» por el catálogo de emoji) y **#803** (P2, `social-safety:92`:
reportar/borrar detrás del «···» por F3-012). Ninguno es un bug de producto: el
aviso se crea, reaccionar funciona y reportar funciona — lo que miente es la
aserción. Salió además **#800** (P2): los e2e dejan catálogo desechable en `dev`
cuando mueren por timeout (22 libros, 5 sagas, 5 personas, 6 perfiles huérfanos,
el más viejo del 2026-07-10).

**#802, #801 y #803: cerradas también el 2026-08-25**, en un segundo pase sobre
los mismos seis tests. Los tres arreglos son de localizador y de copia; el
producto no se toca. Queda **#800** abierta (limpieza de `dev`, no bloquea nada).
Lo que se lleva de aquí, y va contra la causa y no contra el síntoma: **el nombre
accesible de un emoji es un contrato entre `reaction-constants.ts` y los specs**,
y copiarlo a mano rompió `social-optimista.spec.ts` dos veces seguidas (#750 y
#801). Ahora los specs importan `QUICK_REACTION_NAMES`, así que renombrar un
emoji falla en el typecheck y no tres semanas después en la suite.

**#800 también cerrada el 2026-08-25**, con el diagnóstico corregido: la issue
culpaba al `finally` que no corre tras un timeout, y esa causa existe, pero la
que más filas dejaba era otra — los `deleteUser` de los specs no miran `res.ok` y
el borrado rebota contra cinco FK **ON DELETE NO ACTION**, así que el usuario se
queda aunque el test pase en verde. `e2e/global-setup.ts` barre ahora el rastro
desechable antes de la suite (`e2e/support/sweep-disposable.ts`): la primera
pasada se llevó 62 usuarios, 43 libros, 5 sagas, 5 personas, 18 `club_posts` y 10
posts huérfanos; `dev` quedó a cero en las cinco medidas. Quedan abiertas **#806**
(que el borrado del usuario falle ruidosamente también DENTRO de la pasada),
**#807** (catálogo sin prefijo, fuera del barrido) y **#805** (`splash.spec.ts`
prueba un overlay retirado en #446: un test rojo y otro verde que no prueba nada).

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

**Acción 8 — IA de navegación + página de Ajustes: HECHA el 2026-08-21.**
F3-010/F4-007/F1-025 (la app tenía ~8 áreas y 4 entradas de nav: se estrena
`/ajustes` como página real —perfil, visibilidad, contraseña, importar/exportar,
avisos, admin y salir— y un segundo nivel «Tú» que sale del menú del avatar en
`sm+` y de una fila de accesos en el perfil en móvil; Sagas pasa a ser un destino
visible en Buscar). La barra principal NO se toca a propósito. **F1-024 se cierra
como acta, no como trabajo:** su diagnóstico estaba caducado —el autor de un
libro enlaza a `/persona/[id]` desde el 2026-08-13 (`2ed0dc8f`), con e2e propio—
y montar `CreditsSection` en libro duplicaría el panel de metadatos. Decisiones
en `decisiones.md` (2026-08-21); cobertura en `e2e/ia-navegacion.spec.ts`.

**Acción 9 — pasada de revalidación: HECHA el 2026-08-21.** F1-014 (la campana
dejó de purgar el layout raíz en cada apertura: el contador no está cacheado en
ninguna parte, así que no había nada que invalidar), F1-023 (las etiquetas
`credits:*` y `saga-membership:*` se declaraban y no las invalidaba nadie; ya lo
hacen el enriquecimiento —vía `after()`— y los seis escritores de curación de
sagas), F1-030 (cero `revalidatePath` sueltos fuera del módulo central, con un
test que lo impone) y F1-027 (`getCurrentUser()` memoizado en los seis lectores
RSC, y `getClub` envuelto en `cache()` — se ejecutaba dos veces enteras por
petición en `/club/[slug]`). Decisiones en `decisiones.md` (2026-08-21 tarde).
Salieron de aquí dos issues que NO se encadenan: #751 (P1: la hidratación
perezosa de las fichas nunca corre en producción) y #750 (spec de e2e caducado).

**Los sueltos de SEGURIDAD del bloque: HECHOS el 2026-08-25 (tarde).** S2-08 →
**#808** (la app se servía sin ninguna cabecera: ahora CSP de enmarcado,
`nosniff`, HSTS, `Referrer-Policy` y `Permissions-Policy`, con e2e propio),
S2-14 → **#809** (el trigger de curación dejaba fuera `openlibrary_work_key`,
`hydrated_at` y `editions_synced_at`: se gatea la TRANSICIÓN, no la columna, para
no repetir #699), **#681** (formula injection en el CSV de exportación) y
**#683** (`saveUnmatchedBatch` sin el tope `MAX_ROWS`). Decisiones en
`decisiones.md` (2026-08-25 tarde) y el esquema en `data-model.md`.

Salieron tres issues que NO se encadenan: **#810** (la CSP no puede llevar
`script-src`: el nonce exige render dinámico y choca con Cache Components),
**#811** (el resto del rate limiting de S2-11 — alta de catálogo, escritura
social, RPC caras; la #684 solo cubría la búsqueda) y **#812** (la migración
`20260878` está aplicada y verificada en dev, **no en prod**).

Quedan de este bloque los sueltos que NO son de seguridad: **#815** (contraste:
`--muted-foreground` a 3,4:1 y `--foreground-faint` a 2,6:1 sacan axe *serious*
en las 17 rutas) y **#816** (`<main>` + skip-link, ausentes en 15 de 17), que son
F4-022/023 y hasta hoy no tenían issue; y regenerar `graph.json` y
`database.types.ts` (#695, #701, #625).

- [x] **#815 — contraste de los dos tokens (F4-022).** Cerrado el 2026-08-25.
  `--muted-foreground` pasa a `#6b6255` en claro (5,11:1 sobre `--background`); en oscuro no se
  toca, medido y ya pasaba. `--foreground-faint` **no se retoca: se saca del texto** — subirlo a
  AA lo funde con muted (L\* 42,0 contra 42,6), así que los 59 `text-foreground-faint` pasan a
  `text-muted-foreground` y solo quedan 3 dots `aria-hidden`. Bloqueado por
  `contraste-tokens.test.ts` en los tres bloques de tema. Ver `decisiones.md` (2026-08-25, noche).
- [x] **#816 — landmark `<main>` y skip-link (F4-023).** Cerrado el 2026-08-25.
  El landmark subió a `AppShell`, así que lo tienen las 17 rutas de una vez y no
  hay forma de olvidarlo al crear la siguiente; los cuatro `<main>` de página
  (estadísticas ×2, género, notas) pasaron a `<div>` para no dejar dos anidados.
  El skip-link es el primer enfocable de cualquier ruta. Verificado sobre el
  build de producción —las 50 rutas prerenderizadas siguen siéndolo— y cubierto
  por `e2e/a11y-landmark-main.spec.ts`. Ver `decisiones.md` (2026-08-25, noche).

**Las «migraciones fantasma» de F1-017 ya NO son trabajo pendiente: el hallazgo
está caducado.** Comprobado el 2026-08-25 función a función —las 88 de
`pg_proc` en el esquema `public` de dev contra `supabase/`— y **ninguna se ha
quedado sin definición en el repo**. Los cinco RPC que la fase 5 daba por
perdidos (`hydrate_movie`/`series`/`screens_bulk`,
`register_catalog_item(s_bulk)`) viven en `20260818_catalog_c_hydrate_screen.sql`
y `20260818_catalog_e_register.sql` —se rescataron con el resto del juego de
#674 el 2026-08-19— y las tres que no salen en `migrations/`
(`has_min_role`, `current_user_role`, `enforce_role_change_admin_only`) están en
`schema-baseline.sql`, que es su sitio. Límite de la comprobación, y conviene
decirlo: **cubre FUNCIONES, no policies, triggers, grants ni columnas**; para eso
sigue estando `docs/DRIFT-CHECK.md`.

### Obra / edición / representación — HECHO en código el 2026-08-28, SIN desplegar

Plan `docs/superpowers/plans/2026-08-26-obra-edicion-representacion.md` (spec del mismo nombre
en `superpowers/specs/`). Catálogo work-first: la búsqueda sigue sin escribir, la obra se
representa ES→EN→otro con procedencia por campo, y las ediciones dejan de sincronizarse en masa.
Lo cerrado, con la migración o el fichero que lo sostiene:

- [x] **Representación ES→EN→otro con procedencia.** `books.repr_meta` (`20260882`) guarda por
  campo (`title`/`cover`/`synopsis`/`pages`) su idioma y su fuente. `hydrate_book` pasó de
  fill-only a **fill-or-upgrade por rango de idioma** (`20260883`) — un título español pisa a uno
  inglés, y solo eso.
- [x] **La curación se marca sola.** Trigger `trg_stamp_books_repr_manual` (`20260884`): estampa
  `source:'manual'` cuando cambia una columna de representación con sesión de usuario y fuera de
  `app.hydrating`. Ningún camino de curación puede olvidarse de marcar la procedencia, tampoco
  los que se añadan después. Y el alta manual **nace ya marcada** (`20260885`).
- [x] **Las RPC de hidratación de libros son solo de `service_role`** (`20260884`, precedente
  #725). Con fill-or-upgrade, el bypass de `app.hydrating` habría dejado a cualquier
  `authenticated` reescribir el catálogo COMPARTIDO declarando `"lang":"es"`. Verificado contra
  `has_function_privilege`, no contra el ledger.
- [x] **Muere el sync masivo de ediciones y con él la edición primaria como criterio.**
  `book_editions.is_primary` sigue en la tabla pero **ya no la lee nadie**; la precedencia de
  páginas queda en 2 niveles (edición del pase → `books.total_pages` orientativas). El selector
  consulta OpenLibrary **en vivo** y persiste **solo la tirada elegida**.
- [x] **Identidad inter-idioma (Wikidata/Inventaire) y fusión de obras.** Tercera pasada de
  búsqueda con colapso por QID, y `merge_book_into` (fusión cobarde, repunta las 18 referencias
  a libro) más el barrido de reconciliación.
- [x] **Google Books como enriquecedor**, no como fuente primaria: sinopsis en español y, en
  último recurso, alta por ISBN cuando OpenLibrary no lo conoce.
- [x] **Cobertura e2e de los tres flujos nuevos** (`e2e/obra-edicion-representacion.spec.ts`,
  2026-08-28): alta desde `/buscar` dejando procedencia en `repr_meta`, identificar la edición
  eligiendo una candidata en vivo, e importar un CSV con ISBN poblando `passes.edition_id`. Los
  tres validados por MUTACIÓN.

**Lo que NO está hecho, y es lo que hay que mirar antes de dar la pieza por cerrada:** la **fase
destructiva (Task 16) no se ejecutó** y **ninguna migración de la rama está en prod**. Prod sigue
con `books` en 14 columnas, sin `repr_meta` ni `wikidata_id`, con `get_widget_snapshot` nombrando
`is_primary` y con las 61 shells vacías sin hidratar. Eso vive en **#900** (aplicar `20260892`),
**#912** (barrido QID), **#894** (backfill de shells), **#877** (borrar los triggers de primaria)
y **#866** (borrar el esquema de respaldo). El resto de lo que quedó abierto está etiquetado y
es rastreable por `area:catalogo`.

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
