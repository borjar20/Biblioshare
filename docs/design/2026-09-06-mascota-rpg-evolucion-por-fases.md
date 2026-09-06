# Biblioshare — RPG de mascota: visión y hoja de ruta

> **[Diseño de producto · Parte I (visión) congelada el 2026-09-06 · Parte II (hoja de ruta) viva, revisada el 2026-09-06]**
>
> Esta redacción sustituye a la inicial del mismo día (commit `e47ca3d2` de la PR #1079) tras su
> revisión, y al alcance de la spec de combate del 2026-09-04
> (`docs/superpowers/specs/2026-09-04-mascota-jefes-combate-design.md`), que queda como antecedente.
> Contratos: R1 cerrado el 2026-09-06 (#1081 cerrada; lo que hereda R7 vive en #1084). Seguimiento: #1082.
> R2 implementado y verificado técnicamente el 2026-09-06; aceptación humana tras veinte combates pendiente en #1082. R3 aún no está activo.
>
> **Cómo leerlo.** La Parte I dice hacia dónde va el RPG; no cambia sin una entrada en
> `docs/requirements/decisiones.md`. La Parte II dice qué se construye a continuación y en qué
> orden; se edita al cerrar cada hito. Solo los hitos **R1–R4 y S1** llevan criterios de salida:
> son contrato. De R5 y S2 en adelante es dirección, no compromiso. Todos los números del documento
> (precios, tiempos, cantidades, coeficientes) son ejemplos para calibrar, no balance aprobado.
>
> **Regla de producto:** primero demostrar una sola decisión divertida; después añadir sistemas
> solo cuando esa decisión necesite más profundidad.

La dirección elegida es:

**combate automático con intervenciones de un toque + identidad mecánica por clase + ulti con
minijuego + progresión vinculada a Biblioshare + builds graduales + campaña por géneros + colección
cosmética sin dinero real.**

El objetivo no es construir desde el principio un «Diablo de ardillas», sino demostrar primero que
una pelea corta es divertida y después añadir profundidad de forma controlada.

---

# Parte I — Visión (congelada)

## 1. Visión del producto

Abres Biblioshare, registras lo que has leído o visto y descubres que tu mascota tiene nuevas
oportunidades de aventura.

Entras en una expedición corta. Tu mascota sabe luchar por su cuenta, pero tú decides cuándo
intervenir, con un toque: descargar la furia, cambiar de postura, elegir el glifo del siguiente
hechizo, proteger la amenaza que se anuncia, entrar en el compás, soltar al halcón.

Cuando la ulti está lista, el combate se pausa y aparece un pequeño minijuego coherente con la
identidad de la clase. El resultado modifica la técnica, pero nunca invalida toda la build por
fallar un puzle.

Al terminar puedes:

- continuar una ruta;
- conseguir bellotas;
- obtener equipo;
- descubrir un nuevo efecto de build;
- desbloquear una apariencia;
- avanzar en la campaña;
- acercarte a una especialización;
- completar una entrada del Códice de la Madriguera.

La relación entre ambos productos es clara:

> **Biblioshare genera crecimiento, oportunidades y contexto.
> El RPG convierte ese progreso en decisiones, builds, aventuras y colección.**

El combate nunca debe convertirse en una vía infinita para sustituir leer, ver películas, seguir
series o usar las herramientas culturales de la app.

---

## 2. Principios de diseño

### 2.1. Primero diversión, después complejidad

El orden de construcción está en la Parte II. La regla que lo gobierna:

> Cada sistema entra cuando la decisión anterior necesita más profundidad, no antes. Un hito no
> abre el siguiente hasta cumplir sus criterios de salida.

No se construirán desde el inicio:

- nueve ranuras de equipo;
- docenas de afijos;
- 18 especializaciones completas;
- seis minijuegos independientes;
- temporadas competitivas;
- PvP;
- crafting profundo;
- árboles enormes;
- gacha funcional;
- rankings complejos.

### 2.2. La actividad cultural mantiene el crecimiento vertical

La XP y el nivel proceden del uso de Biblioshare: sesiones de lectura válidas, películas
terminadas, progreso real de series, misiones, logros, objetivos semanales, hitos culturales.

El RPG ofrece progresión horizontal: aventuras, equipo, opciones de build, cosméticos, colección,
logros de combate.

La misma actividad puede entregar varias cosas, por ejemplo XP y bellotas, porque tienen funciones
distintas, pero deben mostrarse juntas de forma comprensible.

### 2.3. La clase define estilo; el nivel visible no se toca

Hoy el nivel visible sí depende de la clase: `xpFor` (`src/lib/pet/derive.ts`) multiplica el
atributo primario por 1,5 y `changeClass` (`src/lib/pet/actions.ts`) existe. Quitar ese bonus
bajaría la XP de todo el mundo, y el usuario más activo de producción está en el nivel 10 justo,
el umbral de adulta: volvería a joven. Rehacer el nivel es una tercera recalibración a cambio de
cero jugabilidad.

Decisión:

- **El nivel visible, la etapa y sus hitos no cambian en este roadmap.**
- El combate escala a los enemigos con un **poder de combate** interno, calculado sin bonus de
  clase a partir de los seis atributos (R1). No se muestra como «nivel».
- Se reabre solo si R2 demuestra que el nivel visible confunde o que la clase afín da una ventaja
  que no se puede compensar. Entonces se recalibra el divisor contra producción con una regla
  fija: **nadie baja de nivel ni de etapa en la migración**.

Las seis estadísticas existentes mantienen identidad:

- **FUE** — golpes contundentes, presión física;
- **CON** — aguante, defensa;
- **INT** — potencia y recursos mágicos;
- **SAB** — protección, control y efectos;
- **DES** — precisión, oportunidades y movilidad;
- **CAR** — inspiración, soporte y manipulación social/musical.

Influyen en el combate con límites. No se quiere que:

- publicar más notas vuelva obligatorio jugar Clérigo;
- ver muchas series sea requisito para una Maga;
- seguir clubes sea necesario para que una build sea viable;
- una actividad concreta de la app conceda una ventaja imposible de compensar.

La actividad cultural retrata al usuario, pero no dicta una build obligatoria.

### 2.4. Nada de pay-to-win

Las bellotas se obtienen dentro de Biblioshare. No se plantea dinero real para probar este
sistema. El gacha será exclusivamente cosmético. Nunca se bloqueará una build funcional detrás de
dinero, azar, banners temporales, duplicados obligatorios o pity de pago.

### 2.5. El cliente simula; el servidor decide

El cliente ejecuta el mismo motor determinista que el servidor para animar la pelea en vivo y
registra las intervenciones como entradas. El servidor crea el combate, vuelve a simularlo desde
el seed y las entradas, y solo de esa re-simulación salen el resultado, las recompensas y el
historial. El cliente nunca envía un resultado, un botín ni una puntuación; envía acciones
verificables. Detalle en §16.

---

## 3. Bucle principal

```text
Usar Biblioshare
      ↓
Ganar XP / bellotas / aventuras pendientes
      ↓
Elegir aventura
      ↓
Preparar clase + especialización + equipo
      ↓
Combate automático con intervenciones de un toque
      ↓
Ulti + minijuego
      ↓
Victoria / derrota / ruta
      ↓
Equipo / cosmética / progreso / Códice
      ↓
Cambiar build
      ↓
Volver a jugar
```

El bucle debe funcionar antes de añadir gacha, PvP o crafting. Hasta R4 el bucle es solo
entrenamiento: pelear sin aventura y sin recompensa.

---

## 4. Combate

### 4.1. Tres capas

**Capa 1 — Básica automática.** La mascota ataca por sí sola. Mantiene el carácter ligero y las
sesiones cortas.

**Capa 2 — Intervención de clase: un solo toque, nunca pausa.** Cada clase tiene una intervención
propia, pero todas se teclean con una de tres primitivas: **pulsar ahora**, **alternar** o
**elegir una de N**. Lo que diferencia a las clases es qué hace la intervención en la simulación,
no cómo se introduce. El jugador no pulsa constantemente: espera ventanas importantes y decide.

**Capa 3 — Ulti con minijuego: varios pasos, lo único que pausa.** La ulti se carga durante la
pelea. Al activarla se pausa la simulación, aparece un minijuego corto, el resultado modifica el
efecto y el combate continúa. La ulti siempre conserva un efecto base útil; un resultado excelente
añade daño, duración, protección, control, recurso o efecto secundario. Nunca debe ocurrir que diez
segundos de puzle anulen todo lo anterior. Familias y reglas en §6.

### 4.2. Duración objetivo (ejemplo para prototipo)

- 45–75 segundos;
- 2–3 decisiones relevantes;
- al menos una ulti;
- dos o tres enemigos legibles;
- pausa y control de velocidad;
- abandonar y retomar.

### 4.3. Telegraphs

Los enemigos anuncian sus acciones importantes: cargar un golpe fuerte, levantar una defensa,
preparar una curación, activar un contraataque, entrar en vulnerabilidad, invocar un aliado,
aplicar un debuff.

> **Un enemigo con un solo anuncio no crea decisión:** la respuesta óptima es siempre la misma.
> El mínimo es dos anuncios que pidan respuestas contrarias, por ejemplo una carga que conviene
> interrumpir y una guardia durante la que conviene esperar. Es lo que convierte «¿uso mi recurso
> ahora o lo guardo?» en una pregunta real.

Sin telegraphs legibles, el combate automático sería principalmente espectáculo.

---

## 5. Identidad de las seis clases

Cada clase comparte la estructura: ataque básico, recurso de clase, intervención, habilidad,
ultimate y especializaciones futuras. La diferencia no se limita a estadísticas ni a VFX.

| Clase | Intervención, la decisión | Primitiva | Familia de ulti |
|---|---|---|---|
| Maga | qué glifo carga el siguiente hechizo | elegir una de N | A, runas |
| Guerrera | postura Muro o Filo | alternar | B, escudos |
| Bárbaro | cuándo descargar la furia | pulsar ahora | A, orden de golpes |
| Clérigo | qué amenaza anunciada recibe el santuario | elegir una de N | B, sellos |
| Bardo | entrar en el compás, o pulsar libre sin ritmo | pulsar ahora | A, notas |
| Ranger | a quién marca, o cuándo suelta el halcón | alternar o pulsar ahora | B, trayectoria |

### 5.1. Bárbaro

**Fantasía:** presión, riesgo, fuerza y explosión.

- **Básica:** ataques pesados.
- **Recurso:** furia; sube con ataques y con daño recibido hacia una zona peligrosa.
- **Intervención (pulsar ahora):** descargar la furia. Gastar pronto es seguro; esperar da más
  potencia; pasarse penaliza o hace perder el control.
- **Habilidad:** descarga de furia / golpe de ruptura.
- **Ulti (familia A):** elegir el orden de golpes sobre puntos débiles.
- **Especializaciones previstas:** Rompehuesos (crítico, ventanas cortas), Skaldo (gritos, buffs),
  Quebrantasagas (rompe defensas, ejecución de enemigos grandes).

### 5.2. Guerrera

**Fantasía:** defensa activa, aguante y respuesta.

- **Básica:** presión estable con espada.
- **Recurso:** guardia.
- **Intervención (alternar):** postura **Muro** (defensa y absorción) o **Filo** (más presión).
  La decisión responde a lo que anuncia el enemigo.
- **Habilidad:** guardia perfecta / contraataque.
- **Ulti (familia B):** colocar escudos frente al patrón anunciado. Sin modo con tiempo (§6).
- **Especializaciones previstas:** Muro (barreras, control defensivo), Vengadora (devuelve daño,
  premia bloquear bien), Abanderada (protección de grupo, buffs).

### 5.3. Maga

**Fantasía:** preparación, combinaciones y control mágico.

- **Básica:** proyectiles.
- **Recurso:** glifos.
- **Intervención (elegir una de N):** qué glifo carga el siguiente hechizo. Ordenar varios glifos
  es cosa de la ulti, no de la intervención.
- **Habilidad:** explosión / interrupción / conversión de glifos.
- **Ulti (familia A):** runas; la combinación conseguida determina el efecto secundario.
- **Especializaciones previstas:** Piromante (quemadura, detonaciones), Cronomante (retrasar y
  acelerar ventanas, cooldowns limitados), Invocadora (páginas vivientes, criaturas de tinta).

### 5.4. Clérigo

**Fantasía:** protección, tiempo y priorización.

- **Básica:** daño sagrado moderado.
- **Recurso:** fe / sellos.
- **Intervención (elegir una de N):** qué amenaza anunciada recibe el santuario.
- **Habilidad:** escudo, cura o juicio según contexto.
- **Ulti (familia B):** sellos sobre las amenazas, decidiendo qué efecto priorizar.
- **Especializaciones previstas:** Santuario (escudos, mitigación), Inquisidor (castigo a marcados,
  afinidad contra arquetipos), Cronista (marcas internas convertidas en protección).

Las notas reales del usuario no se convierten en robo de vida ni en poder obligatorio.

### 5.5. Bardo

**Fantasía:** ritmo, apoyo y manipulación.

- **Básica:** notas musicales.
- **Recurso:** compás.
- **Intervención (pulsar ahora):** entrar en el compás. En modo sin ritmo, pulsar libre produce el
  mismo efecto: la accesibilidad es por construcción, no un modo aparte. Señal visual y vibración
  opcional.
- **Habilidad:** buff / debuff / robo de efecto.
- **Ulti (familia A):** secuencia de notas.
- **Especializaciones previstas:** Farándula (buffs de grupo), Sátiro (mofa, debuffs,
  interrupción), Juglar oscuro (roba buffs, distorsiona efectos).

### 5.6. Ranger

**Fantasía:** precisión, preparación y objetivo.

- **Básica:** disparos.
- **Recurso:** marca / halcón.
- **Intervención (alternar o pulsar ahora):** a quién marca, o cuándo suelta al halcón.
  «Posición» se descarta: exigiría una capa espacial que la vista de perfil no tiene; «objetivo»
  y «halcón» funcionan con la vista actual y con dos o tres enemigos en pantalla.
- **Habilidad:** disparo marcado / trampa / orden al halcón.
- **Ulti (familia B):** seleccionar puntos de una trayectoria o patrón.
- **Especializaciones previstas:** Rastreador (primer golpe, marcas), Cetrero (halcón, ataques
  coordinados), Trampero (control, respuesta a telegraphs).

---

## 6. Ultis: dos familias sobre un solo framework

Interacción de clase y minijuego de ulti son dos cosas distintas. Las seis clases tienen
intervenciones distintas (§5); las ultis comparten **dos familias** de minijuego:

- **Familia A — secuencia / patrón.** Maga (runas), Bardo (notas), Bárbaro (orden de golpes).
  Los huecos son posiciones ordinales; **puntúa el orden**.
- **Familia B — colocación / priorización.** Guerrera (escudos), Clérigo (sellos), Ranger
  (trayectoria). Los huecos son amenazas, carriles o puntos de la trayectoria; **puntúa la
  cobertura**.

Las dos son el mismo widget: **tocar ficha, tocar hueco**. Sin arrastre, sin cronómetro, cuatro
fichas como mucho. Una sola capa de accesibilidad, una sola validación, presentación temática
distinta. Reglas:

1. **Ninguna familia mide velocidad ni memoria.** Descarta el modo «con tiempo» de la ulti de la
   Guerrera y el «repite la secuencia» de estilo Simon: medirían capacidades reales (§17).
2. **En A, lo que hace correcto un orden es una elección con la información a la vista, no un
   recuerdo:** recetas conocidas por clase donde el orden cambia el efecto, por ejemplo quemar
   primero o proteger primero. Es contenido de diseño por clase. **En B la respuesta correcta sale
   sola de los telegraphs anunciados:** su contenido viene gratis con cada enemigo.
3. **Saltar el minijuego da el efecto base.** Es la resolución asistida que pide §17 y se deduce
   de «la ulti siempre conserva un efecto base útil». No hace falta otro modo.
4. **La instancia del puzle se genera desde el seed y el tick del combate**, nunca la elige el
   cliente. El servidor la regenera y puntúa la asignación enviada (§16.3).
5. **La identidad visual de cada ulti va por VFX** sobre la animación de ataque, no por una
   animación nueva por estado (§14).

Orden de construcción: R3 construye el widget con la familia A en tema genérico, igual para las
seis clases; la primera tanda de R6 retematiza A para la Maga y añade la puntuación B para la
Guerrera.

---

## 7. Especializaciones

La visión final contempla **6 clases × 3 especializaciones = 18 estilos**, sin implementarlos de
golpe. Primera validación: una sola clase con dos ramas contrastadas, por ejemplo Maga de fuego
(acumular y detonar quemadura, burst) frente a Maga de hielo (barreras, ralentización,
interrupciones, ventanas seguras). Cuando ambas exijan decisiones distintas contra el mismo enemigo,
se amplía.

Árbol de decisión inicial: una elección para la básica, una para la habilidad y una para la ulti,
cada una con dos opciones excluyentes. No se compra todo. Cambiar de rama es gratis fuera del
combate: la experimentación debe sentirse segura.

---

## 8. Ulti y relación con la lectura

La ulti se carga **durante el combate**. No se adopta «40 minutos leídos = 40 % de ulti inicial»:
un día con menos lectura volvería menos divertido el kit. La actividad real influye de formas más
suaves: dar una aventura, desbloquear una bendición inicial, ofrecer una elección adicional,
entregar bellotas, aumentar XP, completar una misión. Las reglas internas de combate se mantienen
estables.

---

## 9. Aventuras

Biblioshare concede **oportunidades de aventura** por actividad significativa. No son energía
comprada, no caducan y no obligan a entrar cada día. Ejemplos de disparadores: primera actividad
cultural válida del día, sesión de lectura significativa, película terminada, avance real de serie,
misión, objetivo semanal.

**La concesión se deriva; solo el gasto se guarda.** Una aventura por (usuario, día local,
disparador) con tope por periodo, calculada igual que el progreso de las misiones: sin libro mayor
de concesiones. Se guarda únicamente qué aventura se empezó, con qué seed y qué se reclamó, con un
identificador idempotente. Consecuencias:

- dividir una sesión en diez registros no da diez aventuras;
- borrar y volver a registrar contenido no da otra;
- editar o borrar la actividad después no revierte una aventura ya jugada;
- dos dispositivos no duplican, porque el gasto es idempotente por identificador.

### 9.1. Entrenamiento libre

El jugador puede repetir combates conocidos, probar equipo, cambiar especialización, practicar
minijuegos y comparar builds. No consume aventura ni entrega recompensas repetibles. **Hasta R4,
todo el combate es entrenamiento.**

---

## 10. Campaña por géneros

Cada zona representa un género: Terror, Misterio, Ciencia ficción, Fantasía, Romance, Aventura,
Clásicos, Distopía. Cada capítulo contiene nodos, eventos, enemigos temáticos, decisiones,
riesgo/recompensa y un jefe.

Ejemplos de familias: en **Terror**, Slasher (críticos fuertes, telegraphs agresivos), Fantasma
(ignora parte de la defensa), Posesión (altera buffs), Entidad de la casa (invoca amenazas) y un
jefe con fases propias. En **Misterio**, Detective (inspecciona y elimina buffs), Impostor (cambia de
comportamiento), Testigo (pistas falsas), Enigma viviente (telegraphs ambiguos).

Una aventura corta:

```text
Entrada
 ↓
Combate
 ↓
Elección
 ├── Ruta segura
 └── Ruta arriesgada
 ↓
Recuperación / evento
 ↓
Encuentro final
```

La admisión se consume una sola vez al empezar. Si el jugador cierra, se guarda el estado, vuelve
a la misma aventura, no obtiene un segundo resultado y no pierde la entrada.

---

## 11. Jefes de reto

Los jefes ligados a retos culturales (#1015) se separan del combate normal:

- las condiciones del encuentro (vida máxima, reglas, versión) se fijan al activarlo;
- editar, rebalancear o borrar el reto después no cambia una batalla histórica;
- el daño persiste entre intentos;
- el objetivo cultural y el trofeo de combate son dos logros distintos;
- hay que decidir a propósito si cumplir el reto garantiza derrotar al jefe, o si puede quedar
  vivo y se comunica aparte. No se esconde esa decisión dentro del balance.

Entran en R7, con los contratos R2, R3 y R7 heredados de #1081 en #1084.

---

## 12. Economía: bellotas

Moneda principal. Se obtiene mediante Biblioshare: actividad, misiones, logros, rachas, objetivos
semanales, campañas, ciertos hitos RPG. No se compra con dinero real.

> **Ninguna moneda existe sin su sumidero.** Las bellotas nacen en R5 junto con la tienda
> (adquisición directa de equipo); los cosméticos se suman como segundo sumidero en R10.

Ejemplo de calibración, no balance: primera actividad válida del día 10 bellotas, misión diaria 5
(hasta tres), objetivo semanal 25. Cuatro días activos, seis misiones y el semanal: 95 bellotas.
Sirve solo para medir cuánto tarda alguien en conseguir algo deseado.

---

## 13. Equipo, rarezas, afijos, Aspectos y Códice

### 13.1. V1 — dos ranuras

**Arma**: modifica una interacción principal. **Amuleto**: modifica una regla secundaria.

> **Los primeros objetos son agnósticos de clase:** modifican la habilidad genérica o la ulti,
> porque la identidad de clase llega en R6. Las armas de clase (Bastón de Ascuas: detonar quemadura
> produce una explosión secundaria; Bastón de Escarcha: interrumpir una preparación concede una
> barrera) entran con la tanda de R6 de su clase.

Ejemplo agnóstico: **Amuleto de la Última Página**, «usar la ulti concede una pequeña barrera».
Equipar es gratis fuera de combate y la comparación entre dos objetos debe leerse de un vistazo.

### 13.2. Tercera ranura y largo plazo

Un tercer slot funcional (accesorio de clase, reliquia, anillo único) solo cuando V1 demuestre
profundidad. El sistema puede evolucionar hacia cabeza, torso, patas, cola, mano, anillos, amuleto y
arma, pero **no se implementan nueve ranuras al inicio**.

### 13.3. Rarezas

Sirven primero para identidad, presentación, singularidad y complejidad del efecto; no significan
automáticamente más poder. Niveles futuros: Normal, Mágico, Raro, Legendario, Único. Las builds
importantes siguen teniendo vías de adquisición conocidas.

### 13.4. Afijos

Quedan para después. No se adoptan reglas como «velocidad de lectura = velocidad de ataque»,
«notas = robo de vida» o «racha = regeneración»: distorsionan cómo se usa Biblioshare. En fases
avanzadas, afinidades suaves (variedad de géneros → posibilidad de ciertos efectos temáticos),
nunca una obligación para jugar bien.

### 13.5. Aspectos

La principal idea a conservar del modelo tipo Diablo: un Aspecto cambia una regla. **Aspecto del
Marcapáginas**, «tu ulti deja un efecto persistente»; **Aspecto de la Página Quemada**, «detonar
quemadura propaga parte del efecto»; **Aspecto del Margen**, «bloquear justo antes de un ataque
genera guardia». Se pueden mover entre piezas bajo reglas controladas.

### 13.6. Códice de la Madriguera

Colección permanente de efectos descubiertos: al encontrar cierto objeto legendario se descubre su
Aspecto, queda registrado, se puede consultar su origen y pasa a la colección de builds. Convierte
drops no útiles en progreso de cuenta y encaja con la identidad bibliotecaria (catálogo, archivo,
colección, descubrimiento, consulta). Se introduce después de validar el equipo básico.

### 13.7. Crafting avanzado

Templado, reroll, restauración, obra maestra y gemas quedan fuera de las primeras fases. Solo se
consideran si existen suficientes builds, el loot tiene profundidad, los jugadores quieren optimizar
y no convierten el RPG en gestión tediosa. Nombres temáticos posibles: Encuadernación, Restauración,
Fragmentos de género.

---

## 14. Representación visual y presupuesto de arte

El pipeline trabaja con personajes completos PixelLab
(`docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`). No se rediseña el rig para
montar brazos, armas, ropa, sombreros o capas como piezas: está probado y descartado.

- **Primera solución.** Cada equipo tiene icono, tarjeta, nombre, rareza, efecto y VFX. El combate
  muestra su identidad mediante proyectiles, impactos, partículas, color y animación secundaria.
- **Segunda solución.** Aspectos completos curados (Maga de hielo, Piromante, Ranger Cetrero,
  Guerrera Muro): cada skin es un personaje visual completo. Equipo funcional y apariencia
  permanecen separados; elegir la skin favorita nunca empeora la build.

> **Regla de presupuesto.** El arte de un hito se genera cuando el hito anterior cumple sus
> criterios de salida, nunca antes. Los telegraphs multiplican: cada enemigo lleva idle, ataque,
> golpe y KO **más una animación por acción anunciada**. Referencia: la estimación previa era de
> unas 190 generaciones para los 18 estados de la mascota y 4 criaturas. Cada hito de la Parte II
> lleva su línea de arte.

---

## 15. Cosméticos y gacha

El gacha llega solo cuando existe un juego divertido, una moneda estable, suficientes cosméticos y
una colección con valor visible.

- **Contenido permitido:** atuendos completos, accesorios, caras, animaciones idle, fondos, marcos,
  efectos de victoria, skins de armas, VFX cosméticos. Cero stats.
- **Apertura y compra directa:** bellota misteriosa más barata (ejemplo, 100) y elección directa
  más cara (ejemplo, 250). Sorpresa sin bloquear el deseo concreto.
- **Duplicados:** protección, garantía de objeto nuevo o conversión en polvo de bellota que avanza
  hacia una pieza deseada. No se introduce otra moneda si puede evitarse.
- **Banners:** colección temática, semana de clase, temporada visual o banner permanente, sin FOMO
  agresivo. Los cosméticos importantes no desaparecen para siempre.
- **Pity:** probabilidades visibles, protección clara, progreso acumulado.
- **Nunca poder exclusivo:** ni armas funcionales, ni Aspectos necesarios, ni especializaciones,
  ni stats, ni acceso a contenido. Si un arma aparece en una apertura, existe adquisición directa, o
  la apertura entrega solo su apariencia, o hay garantía tras esfuerzo conocido.

---

## 16. Arquitectura

### 16.1. Motor determinista

Seed, estado inicial, entradas del jugador, eventos derivados, versión de reglas y hash del
contenido. Sin `Math.random`. Permite replay, depuración, consistencia, reintentos y auditoría.

### 16.2. Simulación en cliente, re-simulación en servidor

Se descarta la resolución por tramos (servidor simula 2–5 s, cliente anima, ventana, servidor
valida, nuevo tramo): en Vercel cada tramo sería una server action que carga, simula y persiste,
entre 10 y 30 idas y vueltas por pelea desde un móvil, y cada corte de red la detiene.

| | Por tramos (descartado) | Log de inputs (adoptado) |
|---|---|---|
| Quién simula en vivo | servidor | cliente, con el mismo motor determinista |
| Qué envía el cliente | una acción por ventana | seed + lista de (tick, acción) al terminar |
| Autoridad | servidor por tramo | servidor re-simula del seed y deriva resultado y botín |
| Idas y vueltas | 10 a 30 por pelea | 1 por pelea, más checkpoints opcionales |
| Pausa, abandono, offline | estado en BD por tramo | gratis: el log parcial es el estado |
| Minijuego | validación aparte | sus acciones verificables son más inputs |

```text
Servidor: crea el combate (seed, snapshot inmutable, versión) → identificador de combate
Cliente:  simula en vivo con el motor, anima, registra (tick, acción, payload)
Cliente → Servidor: identificador + log de inputs (+ acciones del minijuego)
Servidor: re-simula desde el seed y el log; deriva eventos, resultado y recompensas; persiste
```

Los cooldowns usan tiempo de simulación: al pausar no avanzan ticks. Abandonar y retomar es
guardar el log parcial y el tick. Riesgo residual: un cliente modificado que precalcule el momento
óptimo de intervenir; solo importa en PvP y rankings, fuera del roadmap activo. Nunca se acepta
botín, moneda ni puntuación calculados localmente.

### 16.3. Minijuegos verificables

El cliente nunca envía `score = 100`. Envía la asignación ficha → hueco (y las elecciones que
haga); el servidor regenera la instancia desde el seed y el tick, y la puntúa.

### 16.4. Offline

Consecuencia natural del modelo para el entrenamiento: pelear sin red es posible porque el cliente
simula. Las recompensas solo existen cuando el servidor re-simula. No se acepta loot local.

### 16.5. Persistencia: derivado frente a propio

Se mantiene la regla de la mascota: **solo se guarda lo que es una decisión o un hecho.**

- **Derivado (no se guarda):** atributos, nivel, etapa, humor, concesión de aventuras, progreso de
  misiones, logros.
- **Propio:** combates (seed, log de inputs, versión, resultado), aventura activa y su gasto,
  bellotas ganadas y gastadas (ledger), inventario y equipo, Aspectos, Códice, especialización,
  cosméticos, pity si existe, recompensas reclamadas.

### 16.6. Reintentos e idempotencia

Cada acción económica tiene un identificador estable por intención, reutilizado en los reintentos;
el servidor recupera el resultado antes de crear otro. Casos obligatorios: doble clic, retry de
red, dos dispositivos, cierre de app, recompensa ya concedida, compra repetida, aventura retomada,
actividad cultural editada, rollback, derrota y reintento, combate ya resuelto.

---

## 17. Accesibilidad

Los minijuegos no miden capacidades reales del usuario, y el diseño lo garantiza por construcción:
sin arrastre, sin cronómetro, sin memoria (§6). Además: señales visuales y no auditivas, vibración
opcional, saltar la ulti con efecto base, movimiento reducido que afecta también a desplazamientos y
números flotantes, pausa, control de velocidad, salto del replay y resumen accesible del resultado.
Una persona que use configuración accesible completa el mismo contenido.

---

## 18. Derrota

Perder no destruye progreso. La ardilla se duerme, vuelve a la madriguera, se recupera visualmente
y puede reintentar. No pierde equipo, XP, cosméticos ni el acceso a la aventura ya iniciada. La
derrota enseña, no castiga.

---

## 19. Fuera del roadmap activo: cooperativo, crafting profundo y PvP

Son visión, no plan. Se conservan aquí para que nadie los reimplemente leyendo un mockup viejo.

- **Cooperativo: jefe de club.** Cada persona contribuye usando Biblioshare, completando aventuras
  o combatiendo; el grupo comparte el progreso; las ausencias no restan vida, no dañan al equipo ni
  penalizan a los demás. Compartir build, replay, equipo, skin y logro.
- **PvP asíncrono (#1016).** Luchar contra la build guardada de otra persona; el defensor usa una
  política de IA declarada; el atacante no obtiene ventaja oculta; bandas de nivel, consentimiento,
  privacidad, bloqueo, reglas antiabuso, sin pérdida permanente. No se implementa añadiendo un
  rating al PvE. **Condiciones para volver al roadmap:** población real, R1–R7 cerrados y una
  defensa asíncrona definida frente a las intervenciones del atacante.
- **Crafting profundo:** §13.7.

---

## 20. Presencia social: compañía, no comparación

Decidido el 2026-09-06 (#1083). La mascota sale de tu pantalla para acompañar, no para competir:

- **Se ve a quien puede ver tu perfil.** Misma regla que sesiones, pases y biblioteca
  (`can_view_profile`: dueño, perfil público o seguimiento aceptado; nunca entre bloqueados). No
  hay reglas de visibilidad propias de la mascota.
- **De una mascota ajena se ve sprite, nombre, clase y etapa; nunca el nivel ni el humor.** El
  humor ajeno diría «esta persona lleva días sin usar la app»; el nivel es un número que ordena.
  Las vecinas salen siempre despiertas.
- **Sin ranking.** Un ranking por nivel es un ranking de lectura, contra «espejo, no máquina de
  culpa». Si algún día se quiere una clasificación, será dentro de un club, donde ya existe el
  patrón de tablero y su variante cooperativa, y por logros de combate, no por lectura.
- **Sin interacción sobre la mascota ajena** (reacciones, regalos, visitas) hasta que la compañía
  a secas demuestre valor.
- **Datos por RPC, no por política.** Las mascotas ajenas se leen con una función que devuelve
  exactamente esas columnas; `pet_state` sigue siendo solo del dueño.

La primera pieza es la **madriguera compartida** en /mascota (vía S de la Parte II).

---

# Parte II — Hoja de ruta (viva)

## Cómo se usa esta parte

- Hitos **R1–R10**. Los hitos R no renumeran las fases 1–3 de la mascota ya en producción (núcleo,
  misiones y logros, avisos push).
- **Vía S, presencia social**, en paralelo a los hitos R: no depende del combate ni del arte, y
  puede construirse antes de R1 o entre dos hitos R. S1 lleva criterios; S2 y S3 son dirección.
- **R1–R4 y S1 llevan criterios de salida y son contrato.** De R5 y S2 en adelante es dirección:
  se concreta cuando le toca.
- Cada hito arranca con su spec en `docs/superpowers/specs/` (brainstorming → spec → plan) y
  cierra con su entrada en `decisiones.md` y la casilla del backlog. Al cerrarlo se edita esta
  parte, no la Parte I.
- El arte de un hito se genera después de que el anterior pase sus criterios (§14).
- Hasta R4, todo lo que llega a producción es **entrenamiento**: sin recompensa, sin consumo.
- Validación con personas: las cuentas reales de producción y perfiles sintéticos construidos con
  `deriveAttributes` (lector de libros largos, espectador de películas, consumidor de series,
  usuario social, importador de historial). La hipótesis del GDD de referencia sigue vigente:
  observar combates cortos sigue siendo entretenido después de veinte.

## Resumen

| Hito | Entrega | Contrato | Arte |
|---|---|---|---|
| R1 Contratos y modelo de combate | la spec ejecutable de R2 — **cerrado 2026-09-06** | criterios | ninguno |
| R2 Combate mínimo universal | kit genérico para las seis clases, un enemigo con dos anuncios, simulación local y validación en servidor, replay, entrenamiento — **implementado; aceptación humana pendiente (#1082)** | criterios | ninguno: sprites actuales como marcador |
| R3 Ulti y segundo enemigo | widget de ulti con la familia A, pausa, segundo enemigo | criterios | animaciones de combate de los 18 estados y de los dos enemigos |
| R4 Aventuras y primer botín | aventuras derivadas, límites antifarm, dos ranuras y 4–6 objetos agnósticos | criterios | iconos y VFX de los objetos |
| R5 Bellotas y tienda | moneda con su primer sumidero | dirección | — |
| R6 Identidad de clase por tandas | Maga + Guerrera; después Bárbaro + Clérigo; después Bardo + Ranger | dirección | VFX de ulti y de clase, armas de clase |
| R7 Primera campaña por género | una región y los jefes de reto (#1015) | dirección | una familia de enemigos y su jefe |
| R8 Especializaciones | fuego / hielo, tres elecciones binarias | dirección | VFX |
| R9 Aspectos y Códice | catálogo pequeño | dirección | iconos |
| R10 Cosméticos y gacha | catálogo, apertura, compra directa | dirección | skins completas |
| S1 Madriguera compartida | las mascotas de tus seguidos junto a la tuya en /mascota; RPC de columnas exactas (#1083) | criterios | ninguno: sprites actuales en idle |
| S2 Mascota en el perfil | sprite, nombre y clase en la cabecera del perfil público y en la imagen OG | dirección | ninguno |
| S3 Madriguera del club | la misma escena con los miembros del club | dirección | ninguno |

## R1 — Contratos y modelo de combate

**Qué es.** No es un hito con entregable propio: es la spec técnica de R2. Solo lo que R2
necesita; la economía y la procedencia de aventuras se contratan en R4, y los jefes de reto en R7.

**Contenido:**

- **Autoridad.** El servidor crea el combate y re-simula; el cliente nunca envía un resultado.
  Ninguna RPC accesible al cliente inserta batallas (#1081 R1).
- **Seed y snapshot.** Seed generado en servidor; snapshot inmutable de la mascota al crear el
  combate.
- **Log de inputs.** `(tick, acción, payload)`; serialización canónica; unidades y precisión;
  orden de expiración de estados y resolución de golpes múltiples; conversión ticks ↔ segundos
  (#1081 R5).
- **Replay.** Eventos derivados de la re-simulación; checksum sin circularidad (el digest queda
  fuera del material firmado). Reproducir eventos guardados no es lo mismo que volver a simular.
- **Versión.** `rulesetVersion` y hash del contenido con el que se simuló, conservados con el
  combate.
- **Identificador de combate.** Estable por intención y reutilizado en los reintentos; el servidor
  recupera el resultado antes de crear otro (#1081 R4).
- **Poder de combate.** Magnitud interna sin bonus de clase para escalar al enemigo (#1081 R6),
  calibrada con perfiles sintéticos, no a ojo.
- **Instancia de minijuego** derivada de seed y tick, lista para R3.

**Criterios de salida:**

- Spec con un ejemplo normativo completo: seed → inputs → eventos → bytes del hash → resultado.
- Test de integración: un JWT normal que intenta fabricar una victoria es rechazado; otra cuenta,
  también.
- Simulador por CLI con perfiles sintéticos que ejecuta la re-simulación sin UI.

**Cerrado el 2026-09-06** (rama `feat/mascota-r1-contratos`): spec
`docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md`; motor, CLI, tabla y
tests en el repo. Hito activo: R2.

## R2 — Combate mínimo universal

**Estado a 2026-09-06.** Implementación técnica terminada y verificada. La aceptación con
personas sigue abierta en #1082: no se ha acreditado que repetir veinte combates resulte
interesante. R2 permanece activo y R3, incluidas sus animaciones, espera ese criterio.

**Entrega:**

- Motor puro en `src/lib/pet/battle/`, sin `Math.random`, compatible con las seis clases desde el
  primer día.
- Kit genérico igual para las seis: básica automática y una habilidad con cooldown (pulsar ahora).
- Un enemigo con **dos anuncios contrarios**: una carga que conviene interrumpir y una guardia
  durante la que conviene esperar.
- Simulación en cliente, re-simulación y validación en servidor, replay.
- Entrenamiento en `/mascota`: sin recompensa, sin consumo, repetible. Pausa y control de
  velocidad.
- Resultado legible: daño y una o dos causas; el log técnico completo como detalle.

**Arte:** ninguno nuevo. Los sprites actuales con movimiento por CSS (embestida, retroceso, caída)
hacen de marcador. Las animaciones de combate se generan en R3 solo si R2 pasa.

**Fuera:** ulti, minijuego, mecánicas propias por clase, aventuras, bellotas, equipo, arte nuevo.

**Criterios de salida, con personas:**

- Repetir varios combates sigue siendo interesante después de veinte.
- Guardar la habilidad es a veces mejor que pulsarla, y quien juega lo descubre solo.
- Cambiar la decisión cambia el resultado, y se entiende por qué se perdió.
- El replay reproduce exactamente; el servidor rechaza logs manipulados.
- Ninguna de las seis clases queda sin poder pelear.

**Implementación y evidencia técnica (2026-09-06).** Entrenamiento integrado en `/mascota`
mediante `src/lib/pet/training/` y `src/components/pet/training/`: pausa y velocidades
0,5×/1×/2×, simulación local y resultado validado por el servidor. Este autentica, genera
seed y snapshot, reutiliza la intención y resuelve con compare-and-set sobre `status = open`;
los reintentos devuelven el primer resultado. El replay muestra los eventos verificados por
el servidor y comprueba el digest. El ingreso actual exige payload vacío
(`NONEMPTY_PAYLOAD`) y snapshot válido (`INVALID_SNAPSHOT`, incluidos desbordamientos de
enteros), sin modificar el motor histórico congelado `r2.2`. No hay cambio de esquema.

Verificados 136 tests en 20 ficheros, TypeScript, build de producción por defecto con
Turbopack (70/70) y Playwright contra ese build con dos cuentas desechables: acceso sin
sesión, acciones sobre combates ajenos, inicio y resolución concurrentes de una intención,
reintento con el primer resultado y replay. Esta evidencia técnica no sustituye los
criterios con personas. El arreglo de #1085 está en código, pendiente de integrar la PR.

## R3 — Ulti y segundo enemigo

**Entrega:**

- Widget de ulti compartido (tocar ficha, tocar hueco; cuatro fichas como mucho; sin arrastre ni
  cronómetro) con la **familia A en tema genérico**; saltar da el efecto base; la ulti pausa.
- Instancia desde seed y tick; el servidor puntúa la asignación.
- **Segundo enemigo** con un patrón distinto (defensa temporal y ventana vulnerable, invocación o
  debuff).
- **Animaciones de combate reales:** los 18 estados en `east` (idle de combate, ataque, golpe, KO)
  y los dos enemigos. Referencia de presupuesto: unas 190 generaciones para 18 estados y 4
  criaturas en la estimación anterior.

**Criterios de salida:**

- La decisión cambia según el enemigo.
- El minijuego se entiende sin tutorial, y con la configuración accesible se completa igual.
- Un resultado excelente se nota; uno malo nunca anula la pelea.
- Ampliar los sheets no agranda la caja táctil de la compañera (#1074).

## R4 — Aventuras y primer botín

**Entrega:**

- **Aventuras derivadas** por (usuario, día local, disparador) con tope por periodo (§9); no
  caducan; gasto idempotente por identificador; el entrenamiento sigue libre.
- **Primer botín:** dos ranuras (arma y amuleto) y 4–6 objetos **agnósticos de clase** que modifican
  la habilidad genérica o la ulti; equipar gratis fuera de combate; comparación clara.
- Reanudación de aventura desde el log parcial.
- Iconos y VFX de los objetos.

**Criterios de salida:**

- Usar Biblioshare con normalidad da acceso suficiente; nadie necesita falsear registros.
- Dividir una sesión, borrar y volver a registrar, o usar dos dispositivos, no dan más aventuras ni
  duplican recompensas.
- Editar la actividad después no revierte una aventura jugada.
- Un objeto nuevo da ganas de probarlo, y ninguna build domina entre los 4–6.
- Ningún cambio de hábito negativo observado: no se dividen sesiones, no hay obligación diaria.

## R5 — Bellotas y tienda (dirección)

La moneda nace con su primer sumidero: la adquisición directa de equipo. Fuentes: actividad,
misiones, logros, objetivo semanal. Ledger propio; compras idempotentes. Un primer cosmético de
compra directa si hay uno listo. Parte de #1017.

## R6 — Identidad de clase por tandas (dirección)

Primera tanda: **Maga** (glifos; retematizar la familia A como runas) y **Guerrera** (postura;
añadir la puntuación B como escudos). Recurso de clase, intervención propia, armas de clase, VFX.
Después Bárbaro + Clérigo, y luego Bardo + Ranger. Cada tanda repite los criterios de R2 y R3 para
sus clases.

## R7 — Primera campaña por género (dirección)

Una región (Terror o Misterio), 5–8 nodos, tres enemigos, un miniboss, un jefe con fases y una
decisión de ruta. Los **jefes de reto** (#1015) con sus contratos: condiciones fijadas al activar,
historia inmutable, dos logros, política al completar el reto (#1081 R2, R3 y R7, heredados en #1084).

## R8 — Especializaciones (dirección)

Fuego / hielo como prueba; tres elecciones binarias; cambio gratis entre aventuras. Termina cuando
dos ramas son útiles contra el mismo contenido, exigen decisiones distintas y ninguna domina.

## R9 — Aspectos y Códice (dirección)

Aspectos, extracción, Códice de la Madriguera, 8–15 efectos iniciales. Termina cuando encontrar un
Aspecto nuevo genera curiosidad y se entiende qué build permite sin consultar una wiki.

## R10 — Cosméticos y gacha (dirección)

Catálogo pequeño, skins completas, marcos, VFX, apertura aleatoria, compra directa, duplicados
protegidos, probabilidades claras. Sin armas exclusivas de gacha, sin stats, sin power creep.
Cierra #1017.

## Vía S — Presencia social (en paralelo a R)

Independiente del combate: no necesita motor, economía ni arte nuevo, y puede construirse antes de
R1 o entre dos hitos R. Principios en §20.

### S1 — Madriguera compartida (contrato, #1083)

**Entrega:** sección «Madriguera» en /mascota, debajo de la ficha: tu mascota primero y después las
de tus seguidos aceptados que pasen `can_view_profile`, todas en idle; al tocar una, tarjeta con
nombre, clase, etapa y dueño con enlace a su perfil; mezcla diaria determinista, doce visibles
contando la propia y «Mostrar más» para expandir las vecinas cargadas; estados vacíos.
Máximo de 60 vecinas, sin paginación: si hay más, al expandir se indica «Mostrando 60 de N
mascotas de tus seguidos», sin contar la propia. Antes de eclosionar, la sección aparece
debajo del formulario y muestra hasta doce vecinas inicialmente, sin inventar mascota propia.
Un RPC (`get_burrow_pets()`, helper privado con privilegios de
definidor) que devuelve solo nombre, clase, etapa y dueño; sin cambios de política en `pet_state`.
Spec: `docs/superpowers/specs/2026-09-06-mascota-madriguera-compartida-design.md`.
Precisiones posteriores confirmadas: `docs/requirements/decisiones.md`, entrada
«Madriguera: límite explícito y acceso antes de eclosionar» del 2026-09-06; prevalecen sobre
la spec histórica en estos tres puntos. **Estado (2026-09-06): implementación verificada,
matriz SQL con cambio de rol ejecutada en local y migración aplicada en dev y producción,
con objetos y permisos verificados. Pendiente aceptación con dos cuentas reales de
producción en #1083.** La comprobación por RPC con sesiones reales y
el recorrido E2E de dos usuarios pasaron en dev. Detalles de funciones/ACL en
`docs/requirements/data-model.md` §8bis.6. S1 no se da por cerrado todavía.

**Criterios de salida:**

- Matriz de visibilidad en SQL: público seguido y privado con seguimiento aceptado se ven; privado
  pendiente, bloqueado y no seguido no; la propia se excluye; la bellota se incluye; tope y total
  correctos.
- Ninguna columna de `pet_state` fuera de nombre, clase y etapa sale por la API.
- Doce visibles incluyen la propia cuando existe; sin ella caben doce vecinas. Expandir
  conserva la propia primero, muestra hasta 60 vecinas y explica el límite si el total es mayor.
- Antes de eclosionar se pueden consultar las vecinas sin crear `pet_state` ni ocultar el
  formulario; los estados vacíos también funcionan en esta variante.
- Dos cuentas reales de producción se ven mutuamente al seguirse; el e2e con dos usuarios pasa.
- La ficha propia no espera a la madriguera (Suspense propio) y un fallo del RPC no rompe la
  página.

### S2 — Mascota en el perfil (dirección)

Sprite, nombre y clase en la cabecera de `/u/<username>` y en su imagen OG, con la misma función de
visibilidad y un RPC de una fila. Es lo que ve quien escanea una tarjeta NFC (`/go/<uuid>`).

### S3 — Madriguera del club (dirección)

La misma escena con los miembros del club, en la página del club. Es la pieza sobre la que se
apoyaría el cooperativo de club si algún día vuelve al roadmap (§19).

**Ampliaciones registradas, sin fecha:** humor ajeno con interruptor del dueño apagado por
defecto; interruptor «no mostrar mi mascota»; franja compacta de la madriguera en inicio.

## Fuera del roadmap activo

Cooperativo de club, crafting profundo y PvP asíncrono (§19). **#1016 queda como P3, posterior a
R10**, y solo vuelve al roadmap con población real, R1–R7 cerrados y la defensa asíncrona definida.

## Aplazado

**Nivel independiente de clase** (§2.3). Lo reabriría que R2 muestre que el nivel visible confunde
o que la clase afín da ventaja no compensable. Regla de migración: nadie baja de nivel ni de etapa.

## Métricas por hito

- **R2, combate:** ¿se entiende qué ocurre?, ¿se sabe por qué se perdió?, ¿la habilidad se usa
  siempre en cooldown o a veces se guarda?, ¿se desea repetir?
- **R3, enemigos:** ¿se cambia la decisión según el enemigo?, ¿el minijuego se entiende sin
  tutorial?
- **R4, Biblioshare y build:** ¿las recompensas alteran hábitos?, ¿se dividen sesiones?, ¿se siente
  obligación diaria?, ¿un objeto nuevo provoca ganas de probarlo?, ¿hay una build dominante?
- **R6, clases:** ¿otra clase se juega distinto?
- **R7, campaña:** ¿los géneros se sienten mecánicamente diferentes?, ¿los jefes se recuerdan?
- **R10, gacha:** ¿la compra directa se usa?, ¿la apertura sorprende sin frustrar?, ¿los duplicados
  generan rechazo?

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Sobreproducción: 18 especializaciones antes de validar dos | expandir clase por clase, por tandas |
| «Diablo administrativo»: ranuras, números y basura de inventario | pocos objetos, efectos fuertes y legibles |
| Actividad cultural manipulada para minmaxear | afinidades acotadas, concesión derivada con tope |
| Combate espectador: el autobattle no requiere pensar | telegraphs contrarios, intervención de clase, ulti |
| Combate manual disfrazado: una acción cada segundo | pocas ventanas relevantes, intervención de un toque |
| Gacha sin propósito: colección antes de apego | gacha en R10, después del juego |
| Cliente manipulable | el servidor re-simula; nada local cuenta |
| Arte imposible de mantener | iconos y VFX; skins completas curadas; arte después de los criterios |
| Moneda sin sumidero | las bellotas nacen con la tienda (R5) |
| Fase de contratos que no acaba | R1 es la spec de R2, no un hito propio |
| Decisión degenerada: un enemigo con un solo anuncio | dos anuncios contrarios desde R2 |
| Seis mecánicas de entrada a medida | tres primitivas para intervenir, dos familias de ulti, un widget |

## Relación con las issues

| Issue | Papel en este roadmap |
|---|---|
| #1081 | contratos: cerrada el 2026-09-06 con R1 (sus R1, R4, R5 y R6); sus R2, R3 y R7 pasan a #1084 para R7 |
| #1084 | contratos de los jefes de reto heredados de #1081 (raid, edición del reto, ventana e importación): se cierran en la spec de R7 |
| #1082 | seguimiento y validación del prototipo |
| #1015 | jefes de reto, en R7 |
| #1017 | cosméticos y economía: R5 en parte, R10 lo cierra |
| #1016 | PvP: fuera del roadmap activo, posterior a R10 |
| #1057 | paseo de la compañera: independiente de este roadmap |
| #1083 | madriguera compartida: S1 de la vía S, en paralelo a R |

## Qué cambia respecto a la redacción inicial del 2026-09-06

1. **Estructura.** Parte I congelada y Parte II viva; hitos R en vez de fases, para no chocar con
   las fases 1–3 ya implementadas ni con la «fase 4» de #1015; contrato solo en R1–R4.
2. **Orden.** Contratos → combate mínimo → ulti → aventuras y botín → bellotas → clases → campaña →
   especializaciones → Aspectos → cosméticos. Antes: progresión → combate con dos clases → clases →
   economía → campaña → equipo.
3. **Nivel independiente de clase:** aplazado. Era la primera fase.
4. **Arquitectura:** log de inputs con re-simulación en servidor sustituye a la resolución por
   tramos.
5. **Combate:** kit genérico para las seis clases; las dos clases contrastadas son prueba de
   validación, no puerta de entrada; el primer enemigo lleva dos anuncios contrarios.
6. **Intervenciones y ultis:** un toque y tres primitivas; dos familias de ulti sobre un solo
   widget; sin velocidad ni memoria; Ranger pasa de «posición» a objetivo y halcón.
7. **Equipo antes que campaña;** los primeros objetos son agnósticos de clase.
8. **Moneda con sumidero:** las bellotas pasan a R5, con la tienda.
9. **Aventuras:** concesión derivada, solo el gasto se guarda.
10. **Arte:** después de los criterios de salida, con presupuesto por hito.
11. **Cooperativo, crafting profundo y PvP:** fuera del roadmap activo.
12. **Vía S, presencia social** (añadida en la revisión de la tarde): madriguera compartida (S1,
    #1083), mascota en el perfil (S2) y madriguera del club (S3), en paralelo a R y sin ranking
    (§20).
