# Trampas conocidas

Cosas que ya han costado horas en este proyecto, con la señal que las delata. **Léelo antes
de depurar algo raro** — la mitad de estas se han "descubierto" dos y tres veces.

Ordenadas por lo caras que salieron.

---

## 1. `library_entries` está congelada

**Síntoma:** un contador o un progreso sale a 0 % o con datos viejos, aunque la app muestre
bien el estado en otra pantalla.

`library_entries` fue la tabla de progreso, **ya no lo es**. Su `status` y su `position` no
se actualizan desde el pase-hub. El estado vivo está en `passes`.

Sobrevive solo para `pinned_order`, `queue_order` y `queue_id`.

**Regla:** cualquier feature que necesite el estado del usuario lo deriva de `passes`.
Ya causó el avance de sagas al 0 % (PR #96) y el hero descuadrado (#91).

---

## 2. «No se actualiza sin recargar»

Cuatro causas distintas, y **se comprueban en este orden**:

1. **El service worker sirviendo payloads RSC de caché.** Es la más traicionera porque
   parece un bug de React. **Descarta el SW ANTES de culpar a React o a Next** (PR #66).
2. Un componente que **duplica** estado del servidor en vez de derivarlo de props.
3. Falta el `router.refresh()` que reconcilia tras la mutación.
4. Una consulta que lee de `library_entries` (ver §1).

**Regla general:** derivar de props y reconciliar con `router.refresh()`; no duplicar estado
del servidor en el cliente.

---

## 3. La regla de los dos árboles (`:visible`)

**Síntoma:** un test falla con "element is hidden" sobre algo que en pantalla se ve
perfectamente.

Cuando una pantalla pinta lo mismo en dos árboles por breakpoint (`lg:hidden` /
`hidden lg:block`), **el que no toca se queda en el DOM, apagado**. La suite corre a 1280, y
`getByTestId(...)` o `.first()` cazan el oculto.

**Regla:** con dos árboles, **todo locator lleva `:visible`** —
`page.locator("h1:visible")`, `locator("visible=true")`.

Ha roto tests tres veces: 5 asserts en la ficha (#50), 2 en el feed (#69), y otra vez en
Inicio. El patrón de dos árboles solo es seguro para **duplicados sin estado**.

---

## 4. Un `loading.tsx` mata el 404

Un `loading.tsx` es una frontera de Suspense de ruta: arranca el streaming y **compromete el
200**, así que `notFound()` ya no puede devolver 404.

**Regla:** solo en rutas que **no** llaman a `notFound()` — hoy `(home)`, `buscar`,
`clubes`, `coleccion`, `estadisticas`.

El de Inicio vive en el route group `(home)` a propósito: uno en la raíz se filtra a **toda**
la app y le roba el 404 a todas las rutas.

---

## 5. E2E: mira la carga de la máquina antes que tu código

**Síntoma:** cae media suite de golpe, con asserts inconexos entre sí.

Casi siempre es el entorno, no el código:

- Supabase es **remoto también en dev** (~240 ms/consulta, picos de 1,3 s).
- Con varias sesiones en paralelo, el home autenticado pasa de 4 s a 20 s.
- En una máquina de 8 GB, `next dev` + Chromium no caben: el server muere a mitad de suite y
  los workers caen con `worker process exited unexpectedly (code=3221225794)`.

**Señales para distinguirlo:**

| Señal | Significa |
|---|---|
| El test que falla **se mueve** en cada pasada | Entorno |
| Falla **siempre el mismo assert** y no se mueve | Bug real |
| `worker process exited unexpectedly` | El proceso murió, no es un assert |
| `page.goto` que no llega | Server caído, no producto |

**Un fallo puede parecer producto y no serlo**: `.react-flow__node` con `toHaveCount → 0`
("el grafo no se pinta") era el server agonizando. Repetido en tandas de 2–3 specs sobre un
server sano: 16/16 verde.

**Forma barata de zanjarlo:** worktree de baseline sobre `origin/main` y correr **solo** el
test que falla en las dos ramas. Y no montes un A/B con el server exhausto en una rama y
recién arrancado en la otra: eso mide el cansancio, no tu cambio.

---

## 6. Antes de arreglar un fallo, mira si falla lo que lo MIDE

Ha pasado tres veces con tres instrumentos distintos:

- **`grep -oE '^…KEY='`** — con `-o` grep imprime solo lo que casa, y la regex acababa en
  `=`, así que mostraba la clave tuviera valor o no. Llegó a contaminar 2 PRs y un plan con
  la afirmación falsa de que las API keys estaban vacías.
  Para ver si una var tiene valor: `awk -F= '/^CLAVE=/ {print length($2)}'`.
- **`innerText`** devuelve el texto ya transformado por CSS: buscar `includes("Para más
  tarde")` falla si el rótulo va en `uppercase`.
- **`getComputedStyle().borderTopWidth`** devuelve **0,8px tanto para `border` (1px) como
  para `border-[1.5px]`** en el Chrome de Playwright. No sirve para verificar anchos de
  borde, y casi provoca "arreglar" una clase correcta.
- **`git stash push <ruta>`** NO guarda ficheros untracked: falla entero y te deja creyendo
  que revertiste. Un A/B así da el mismo número dos veces y parece que el fix no hace nada.
  Usa `--include-untracked`.

---

## 7. Tailwind: clases enteras y valores arbitrarios ambiguos

- **Las clases se escriben enteras, nunca interpoladas** — el JIT escanea texto. Por eso
  `media-accent.ts` lista `"border-type-book/30"` completo en vez de construirlo.
- **`border-[1.5px]` sí funciona**; `border-[length:1.5px]` **no** (para esa variante no se
  emite regla). Si dudas de si una utilidad se generó, búscala en `document.styleSheets`, no
  midas el valor computado (ver §6).

---

## 8. Storage no valida JWT ES256

**Síntoma:** subir una imagen da 400 o un error de RLS que parece de permisos.

Supabase Storage no reconoce los JWT ES256 que emite el proyecto. **Las subidas van por
service-role desde server actions**, nunca desde el cliente (PR #75).

---

## 9. Importar: una fila por visionado no es una fila por obra

**Arreglado el 2026-07-20, pero la forma del error se repite.**

`diary.csv` de Letterboxd trae **una fila por visionado**, así que una película
vista tres veces aparece tres veces. `commit-row.ts`, en cambio, espera una fila
por OBRA con todas sus fechas en `diaryDates` — el pase activo se queda la más
reciente y el resto entran como históricos.

Al no agrupar, cada visionado llegaba solo con su fecha, el insert del pase
activo chocaba con `passes_one_active` y esa fecha **se descartaba en silencio**:
los revisionados se perdían y se reportaban como «duplicado», que suena inocuo.

Segundo camino del mismo fallo: `addHistoricalPasses` recibía un `skip` con la
fecha más reciente **aunque el pase activo ya existiera de antes**. Al reimportar
un CSV sobre una biblioteca con historial, el visionado nuevo se saltaba. El
`skip` solo es legítimo cuando el pase activo se acaba de crear CON esa fecha.

**La lección general:** cuando un parser y su consumidor discrepan sobre qué es
una fila —visionado vs. obra—, el síntoma no es un error, es **datos que faltan
sin avisar**. Y «duplicado» en un informe de importación merece desconfianza:
puede significar «lo tiré».

## 10. `rereadCount` no es el ordinal del pase

Cuenta los pases **cerrados**; el actual es +1. La primera lectura siempre sale bien, así que
el fallo **pasa desapercibido hasta que alguien relee**.

---

## 11. Las series no tienen `progress_sessions`

Se miden en episodios. Cualquier orden por "última sesión" manda **todas** las series al
final si no se contempla — y entonces ninguna puede ser la destacada.

---

## 12. Migraciones: el ledger miente

- **"No aparece en `list_migrations`" ≠ "no está en prod".**
  `20260716_list_challenge_completion_mode.sql` está aplicada pero **sin registrar**. Para
  saber si algo existe de verdad, mira los **objetos** (`pg_proc`, `pg_class`), no el ledger.
- El orden de `schema-baseline.sql` es el de **aplicación real en prod**, no el alfabético de
  ficheros.
- Antes de decidir "esto no se arregla sin `pg_dump`", comprueba si las migraciones que
  faltan tienen `.sql`: si lo tienen, el append fiel gana.

---

## 13. Las maquetas son documentos vivos

`Ficha` pasó de 7 a 12 frames, `Clubes` de 8 a 12, y `Perfil` fue reescrito entero en un v2
que **deroga** las maquetas anteriores.

**Antes de calcar, comprueba la fecha del `.html`.** Y cuidado al mezclar frames de distinta
época: dos maquetas que nunca se vieron entre sí producen choques (pasó con el rail de Inicio
contra el bloque de hoy, y con los dos shells de escritorio de la ficha).

---

## 14. Los docs de plan apuntan a ficheros que se movieron

Ha pasado en **tres planes seguidos** (02, 03, 04): rutas que ya no existen, o un componente
dado por ausente que sí estaba.

**Verificar las rutas del plan antes de codificar es obligatorio, no opcional.** En el plan
03, seguir el doc al pie de la letra habría restyleado las listas de seguidores por error.

---

## 15. Preparar datos por la UI no funciona

De 8 intentos de "Seguir" hechos navegando (buscar → ficha) solo cuajó 1.

**Para preparar datos, SQL directo** contra obras que ya estén en catálogo, anotando ids para
borrarlos exactos. La UI es para **verificar**, no para sembrar.

---

## 16. Otras dos, cortas

- **Un `.next` a medias** (p. ej. borrar `.next/dev/types` con el server vivo) hace que
  **todas** las rutas den 404, `/` incluida. Se cura con `rm -rf .next`.
- **`test-results/error-context.md` guarda la contraseña del login en claro.** Está
  gitignorado, pero no lo pegues en una conversación ni en una PR.
