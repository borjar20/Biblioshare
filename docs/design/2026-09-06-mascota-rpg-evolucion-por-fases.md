# Biblioshare — RPG de Mascota Unificado

> **Propuesta de producto · 2026-09-06**
>
> Este documento unifica las dos propuestas existentes para convertir la mascota de Biblioshare en un RPG ligero, profundo y conectado con el uso cultural de la app.
>
> La dirección elegida es:
>
> **combate automático con intervenciones significativas + identidad mecánica por clase + ulti con minijuego + progresión vinculada a Biblioshare + builds graduales + campaña por géneros + colección cosmética sin dinero real.**
>
> El objetivo no es construir desde el principio un “Diablo de ardillas”, sino demostrar primero que una pelea corta es divertida y después añadir profundidad de forma controlada.

---

## 1. Visión del producto

Abres Biblioshare, registras lo que has leído o visto y descubres que tu mascota tiene nuevas oportunidades de aventura.

Entras en una expedición corta. Tu mascota sabe luchar por su cuenta, pero tú decides cuándo intervenir: guardar una habilidad, reaccionar a una amenaza, cambiar una postura, ordenar glifos, colocar un santuario, gestionar furia o preparar una ultimate.

Cuando la ulti está lista, el combate se pausa y aparece un pequeño minijuego coherente con la identidad de la clase. El resultado modifica la técnica, pero nunca invalida toda la build por fallar un puzzle.

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

El combate nunca debe convertirse en una vía infinita para sustituir leer, ver películas, seguir series o usar las herramientas culturales de la app.

---

# 2. Principios de diseño

## 2.1. Primero diversión, después complejidad

El orden de desarrollo será:

1. combate interesante;
2. progresión coherente;
3. conexión con Biblioshare;
4. equipo que cambie cómo se juega;
5. especializaciones;
6. campaña más profunda;
7. colección cosmética;
8. sistemas de largo recorrido;
9. juego social;
10. PvP, solo si todo lo anterior funciona.

No se construirán desde el inicio:

- nueve slots;
- docenas de afijos;
- 18 especializaciones completas;
- seis minijuegos independientes;
- temporadas competitivas;
- PvP;
- crafting profundo;
- árboles enormes;
- gacha funcional;
- rankings complejos.

---

## 2.2. La actividad cultural mantiene el crecimiento vertical

La XP y el nivel general proceden principalmente del uso de Biblioshare.

Ejemplos:

- sesiones de lectura válidas;
- películas terminadas;
- progreso real de series;
- misiones;
- logros;
- objetivos semanales;
- hitos culturales.

El RPG ofrece:

- aventuras;
- equipo;
- opciones de build;
- cosméticos;
- colección;
- logros de combate;
- progresión horizontal.

La misma actividad puede entregar varias cosas —por ejemplo XP y bellotas— porque tienen funciones distintas, pero deben mostrarse juntas de forma comprensible.

---

## 2.3. La clase define estilo, no nivel

El nivel será común e independiente de la clase.

Cambiar de clase no debe cambiar artificialmente el nivel.

Las seis estadísticas existentes mantienen identidad:

- **FUE** — golpes contundentes, presión física;
- **CON** — aguante, defensa;
- **INT** — potencia y recursos mágicos;
- **SAB** — protección, control y efectos;
- **DES** — precisión, oportunidades y movilidad;
- **CAR** — inspiración, soporte y manipulación social/musical.

Estas estadísticas pueden influir en el combate, pero con límites.

No se quiere que:

- publicar más notas vuelva obligatorio jugar Clérigo;
- ver muchas series sea requisito para una Maga;
- seguir clubes sea necesario para que una build sea viable;
- una actividad concreta de la app conceda una ventaja imposible de compensar.

La actividad cultural retrata al usuario, pero no dicta una build obligatoria.

---

## 2.4. Nada de pay-to-win

Las bellotas se obtienen dentro de Biblioshare.

No se plantea dinero real para probar este sistema.

El gacha será exclusivamente cosmético.

Nunca se bloqueará una build funcional detrás de:

- dinero;
- azar;
- banners temporales;
- duplicados obligatorios;
- pity de pago.

---

## 2.5. El cliente no decide recompensas

La economía, el progreso, las compras, el inventario, las especializaciones y los resultados competitivos requieren autoridad del servidor.

El cliente:

- anima;
- recibe el estado;
- envía intervenciones;
- muestra el replay;
- puede simular de forma visual.

El servidor:

- valida;
- consume recursos una sola vez;
- resuelve resultados;
- persiste recompensas;
- controla reintentos;
- evita dobles cobros y duplicaciones;
- verifica las acciones del minijuego.

El modo offline puede explorarse más adelante, pero no debe convertir al cliente en autoridad sobre loot, moneda o ranking.

---

# 3. Bucle principal

```text
Usar Biblioshare
      ↓
Ganar XP / bellotas / aventuras pendientes
      ↓
Elegir aventura
      ↓
Preparar clase + especialización + equipo
      ↓
Combate automático con intervenciones
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

El bucle debe funcionar incluso antes de añadir gacha, PvP o crafting.

---

# 4. Combate

## 4.1. Modelo base

El combate combina tres capas:

### Capa 1 — Básica automática

La mascota ataca por sí sola.

Esto mantiene el carácter ligero del sistema y permite sesiones cortas.

### Capa 2 — Intervención manual

Cada clase dispone de una forma propia de intervenir.

El jugador no pulsa botones constantemente: espera ventanas importantes y toma decisiones.

### Capa 3 — Ultimate con minijuego

La ulti se carga durante la pelea.

Cuando se activa:

1. se pausa la simulación;
2. aparece un minijuego corto;
3. el resultado modifica el efecto;
4. el combate continúa.

La ulti siempre conserva un efecto base útil.

Un resultado excelente añade:

- daño;
- duración;
- protección;
- control;
- recurso adicional;
- efecto secundario.

Nunca debe ocurrir que diez segundos de puzzle anulen todo lo anterior.

---

## 4.2. Duración objetivo inicial

Primer prototipo:

- **45–75 segundos**;
- 2–3 decisiones relevantes;
- al menos una ulti;
- dos o tres enemigos legibles;
- botón de pausa;
- posibilidad de abandonar y retomar.

Son cifras para prototipo, no balance definitivo.

---

## 4.3. Telegraphs enemigos

Los enemigos anuncian sus acciones importantes.

Ejemplos:

- cargar un golpe fuerte;
- levantar una defensa;
- preparar una curación;
- activar un contraataque;
- entrar en vulnerabilidad;
- invocar un aliado;
- aplicar un debuff.

Esto crea la pregunta central:

> «¿Uso mi recurso ahora o lo guardo?»

Sin telegraphs legibles, el combate automático sería principalmente espectáculo.

---

# 5. Identidad de las seis clases

Cada clase comparte la estructura:

- ataque básico;
- recurso de clase;
- habilidad;
- ultimate;
- interacción manual propia;
- especializaciones futuras.

La diferencia no debe limitarse a estadísticas o VFX.

---

## 5.1. Bárbaro

**Fantasía:** presión, riesgo, fuerza y explosión.

### Básica
Ataques pesados.

### Recurso
**Furia.**

Se acumula con ataques y daño recibido.

### Intervención
La furia sube hacia una zona peligrosa.

El jugador decide cuándo descargarla.

- gastar pronto = seguridad;
- esperar = más potencia;
- pasarse = penalización o pérdida de control.

### Habilidad
Descarga de furia / golpe de ruptura.

### Ulti
Secuencia de impactos sobre puntos débiles.

El jugador elige el orden de golpes.

No se basa en machacar botones.

### Especializaciones previstas

**Rompehuesos**
- crítico;
- daño explosivo;
- ventanas cortas.

**Skaldo**
- gritos;
- buffs;
- sinergia de grupo.

**Quebrantasagas**
- rompe defensas;
- presión contra jefes;
- ejecución de enemigos grandes.

---

## 5.2. Guerrera

**Fantasía:** defensa activa, aguante y respuesta.

### Básica
Presión estable con espada.

### Recurso
**Guardia.**

### Intervención
Elige postura:

- **Muro** — defensa y absorción;
- **Filo** — más presión ofensiva.

La decisión debe responder a lo que anuncia el enemigo.

### Habilidad
Guardia perfecta / contraataque.

### Ulti
Colocar escudos frente a un patrón anunciado.

Debe existir:

- modo con tiempo;
- modo con tiempo ampliado;
- alternativa por pulsaciones.

### Especializaciones previstas

**Muro**
- absorber amenazas;
- barreras;
- control defensivo.

**Vengadora**
- devuelve parte del daño;
- recompensa bloquear bien.

**Abanderada**
- protección del grupo;
- buffs;
- futura utilidad cooperativa.

---

## 5.3. Maga

**Fantasía:** preparación, combinaciones y control mágico.

### Básica
Proyectiles.

### Recurso
**Glifos.**

### Intervención
Ordenar o seleccionar glifos para modificar el siguiente hechizo.

### Habilidad
Explosión / interrupción / conversión de glifos.

### Ulti
Puzzle corto de runas.

La combinación conseguida determina el efecto secundario del hechizo.

### Especializaciones previstas

**Piromante**
- quemadura;
- DoT;
- detonaciones.

**Cronomante**
- retrasar acciones;
- acelerar ventanas;
- manipular cooldowns de forma limitada.

**Invocadora**
- páginas vivientes;
- criaturas de tinta;
- presión indirecta.

---

## 5.4. Clérigo

**Fantasía:** protección, tiempo y priorización.

### Básica
Daño sagrado moderado.

### Recurso
**Fe / sellos.**

### Intervención
Colocar un santuario o protección en la línea temporal de ataques enemigos.

### Habilidad
Escudo, cura o juicio según contexto.

### Ulti
Ordenar sellos y decidir qué efecto priorizar.

### Especializaciones previstas

**Santuario**
- escudos;
- supervivencia;
- mitigación.

**Inquisidor**
- daño;
- castigo a enemigos marcados;
- afinidad temática contra ciertos arquetipos.

**Cronista**
- transforma recursos narrativos o marcas internas en protección/curación.

Las notas reales del usuario no deben convertirse directamente en robo de vida o poder obligatorio.

---

## 5.5. Bardo

**Fantasía:** ritmo, apoyo y manipulación.

### Básica
Notas musicales.

### Recurso
**Compás.**

### Intervención
Mantener una secuencia musical.

La accesibilidad es prioritaria:

- señal visual;
- vibración opcional;
- modo sin ritmo;
- pulsaciones simples.

### Habilidad
Buff / debuff / robo de efecto.

### Ulti
Secuencia musical corta.

### Especializaciones previstas

**Farándula**
- buffs de grupo;
- inspiración.

**Sátiro**
- mofa;
- debuffs;
- interrupción.

**Juglar oscuro**
- roba buffs;
- distorsiona efectos enemigos.

---

## 5.6. Ranger

**Fantasía:** precisión, preparación y posicionamiento.

### Básica
Disparos.

### Recurso
**Marca / posición.**

### Intervención
Gestionar posición, objetivo o compañero.

Puede usar un halcón como elemento visual y mecánico.

### Habilidad
Disparo marcado / trampa / orden al halcón.

### Ulti
Seleccionar puntos de una trayectoria o patrón.

Debe existir alternativa sin arrastre fino.

### Especializaciones previstas

**Rastreador**
- primer golpe;
- marcas;
- precisión.

**Cetrero**
- halcón;
- ataques coordinados;
- reposicionamiento.

**Trampero**
- control;
- preparación;
- respuesta a telegraphs.

---

# 6. Especializaciones

La visión final contempla:

**6 clases × 3 especializaciones = 18 estilos.**

Pero no se implementarán las 18 de golpe.

## Primera validación

Se prueba una sola clase con dos estilos contrastados.

Ejemplo:

### Maga de fuego

- acumula quemadura;
- busca detonarla;
- juega alrededor de burst.

### Maga de hielo

- barreras;
- ralentización;
- interrupciones;
- ventanas seguras.

Cuando ambas exijan decisiones distintas contra el mismo enemigo, se amplía.

---

## Árbol de decisión inicial

Una especialización puede empezar con solo:

- 1 elección para la básica;
- 1 elección para la habilidad;
- 1 elección para la ulti.

Cada elección tiene dos opciones excluyentes.

No se compra todo.

Cambiar de rama es gratis fuera del combate.

La experimentación debe sentirse segura.

---

# 7. Ultimate y relación con la lectura

La ulti se carga **durante el combate**.

No se adopta como regla principal:

> “40 minutos leídos = 40 % de ulti inicial”.

Esa fórmula haría que un día con menos lectura vuelva directamente menos divertido el kit.

La actividad real puede influir de formas más suaves:

- dar una aventura;
- desbloquear una bendición inicial;
- ofrecer una elección adicional;
- entregar bellotas;
- aumentar XP;
- completar una misión.

Las reglas internas de combate deben mantenerse estables.

---

# 8. Aventuras pendientes

Biblioshare concede **oportunidades de aventura** por actividad significativa.

No son energía comprada.

No caducan.

No obligan a entrar cada día.

Ejemplos de triggers:

- primera actividad cultural válida del día;
- sesión de lectura significativa;
- película terminada;
- avance real de serie;
- misión;
- objetivo semanal.

Se aplican límites por periodo.

Dividir una sesión en diez registros no genera diez recompensas.

Borrar y volver a registrar contenido tampoco.

---

## 8.1. Entrenamiento libre

El jugador puede:

- repetir combates conocidos;
- probar equipo;
- cambiar especialización;
- practicar minijuegos;
- comparar builds.

Esto no consume aventura.

Pero tampoco entrega recompensas repetibles.

---

# 9. Campaña por géneros

La campaña adopta una estructura cultural.

Cada zona representa un género.

Ejemplos:

- Terror;
- Misterio;
- Ciencia ficción;
- Fantasía;
- Romance;
- Aventura;
- Clásicos;
- Distopía.

Cada capítulo contiene:

- nodos;
- eventos;
- enemigos temáticos;
- decisiones;
- riesgo/recompensa;
- jefe.

---

## 9.1. Ejemplo: Terror

**Slasher**
- críticos fuertes;
- telegraphs agresivos.

**Fantasma**
- ignora parte de la defensa.

**Posesión**
- altera buffs.

**Entidad de la casa**
- invoca amenazas.

**Jefe**
- mecánica propia;
- varias fases;
- telegraphs únicos.

---

## 9.2. Ejemplo: Misterio

**Detective**
- inspecciona y elimina buffs.

**Impostor**
- cambia de comportamiento.

**Testigo**
- genera pistas falsas.

**Enigma viviente**
- telegraphs ambiguos.

---

## 9.3. Rutas

Una aventura corta puede tener:

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

La admisión se consume una sola vez al empezar.

Si el jugador cierra:

- guarda estado;
- vuelve a la misma aventura;
- no obtiene un segundo resultado;
- no pierde la entrada.

---

# 10. Jefes especiales y retos

Los jefes ligados a retos culturales se separan del combate normal.

Pueden usar daño persistente entre intentos.

Las condiciones del encuentro se fijan al activarlo.

Editar después un reto no cambia una batalla histórica.

El objetivo cultural y el trofeo de combate se consideran dos logros distintos.

---

# 11. Economía

## 11.1. Bellotas

Moneda principal.

Se obtiene mediante Biblioshare:

- actividad;
- misiones;
- logros;
- rachas;
- objetivos semanales;
- campañas;
- ciertos hitos RPG.

No se compra con dinero real en esta propuesta.

---

## 11.2. Ejemplo de economía para prototipo

Valores de prueba:

- primera actividad válida del día → **10 bellotas**;
- misión diaria → **5 bellotas**;
- hasta tres misiones;
- objetivo semanal → **25 bellotas**.

Ejemplo:

4 días activos + 6 misiones + objetivo semanal:

```text
40 + 30 + 25 = 95 bellotas
```

No es un balance definitivo.

Solo sirve para medir cuánto tarda alguien en conseguir algo deseado.

---

# 12. Equipo

El equipo debe cambiar cómo se juega.

No se quiere empezar por un inventario enorme de números.

---

## 12.1. V1 — Dos slots

### Arma

Modifica una interacción principal de clase.

Ejemplos:

**Bastón de Ascuas**
> Detonar Quemadura con la habilidad produce una explosión secundaria.

**Bastón de Escarcha**
> Interrumpir una preparación enemiga concede una barrera.

### Amuleto

Modifica una regla secundaria.

Ejemplo:

**Amuleto de la Última Página**
> Usar la ulti concede una pequeña barrera.

---

## 12.2. V2 — Tercer slot funcional

Solo cuando V1 demuestre suficiente profundidad.

Puede añadirse:

- accesorio de clase;
- reliquia;
- anillo único.

---

## 12.3. Visión de largo plazo

El sistema puede evolucionar eventualmente hacia slots como:

- cabeza;
- torso;
- patas;
- cola;
- mano;
- anillos;
- amuleto;
- arma.

Pero **no se implementarán nueve slots al inicio**.

---

# 13. Rarezas

La rareza sirve primero para:

- identidad;
- presentación;
- singularidad;
- complejidad del efecto.

No significa automáticamente “más poder”.

Posibles niveles futuros:

- Normal;
- Mágico;
- Raro;
- Legendario;
- Único.

Las builds importantes deben seguir teniendo vías de adquisición conocidas.

---

# 14. Afijos

Los afijos profundos quedan para una fase posterior.

No se adoptan inicialmente reglas como:

- velocidad de lectura = velocidad de ataque;
- notas = robo de vida;
- racha = regeneración.

Estas relaciones son temáticamente atractivas pero pueden distorsionar cómo se utiliza Biblioshare.

En fases avanzadas se pueden explorar afinidades suaves.

Ejemplo:

> variedad de géneros → posibilidad de encontrar ciertos efectos temáticos.

Pero nunca una obligación para jugar bien.

---

# 15. Aspectos

Los Aspectos son la principal idea a conservar del modelo tipo Diablo.

Un Aspecto cambia una regla.

Ejemplo:

**Aspecto del Marcapáginas**
> Tu ulti deja un efecto persistente.

**Aspecto de la Página Quemada**
> Detonar Quemadura propaga parte del efecto.

**Aspecto del Margen**
> Bloquear justo antes de un ataque genera Guardia.

Se pueden mover entre piezas bajo reglas controladas.

---

# 16. Códice de la Madriguera

El **Códice de la Madriguera** es una colección permanente de efectos descubiertos.

Cuando encuentras cierto objeto legendario:

1. descubres su Aspecto;
2. queda registrado;
3. puedes consultar su origen;
4. pasa a formar parte de tu colección de builds.

Esto convierte drops no útiles en progreso de cuenta.

También encaja con la identidad bibliotecaria de Biblioshare:

- catálogo;
- archivo;
- colección;
- descubrimiento;
- consulta.

El Códice se introduce después de validar el equipo básico.

---

# 17. Crafting avanzado

Sistemas inspirados en:

- templado;
- reroll;
- restauración;
- obra maestra;
- gemas;

quedan explícitamente fuera de las primeras fases.

Solo se consideran si:

1. existen suficientes builds;
2. el loot tiene profundidad;
3. los jugadores quieren optimizar;
4. no convierten el RPG en gestión tediosa.

Posibles nombres temáticos futuros:

- **Encuadernación** — modificar una propiedad;
- **Restauración** — mejorar una pieza;
- **Fragmentos de género** — engarces.

---

# 18. Representación visual del equipo

El pipeline actual trabaja con personajes completos.

No se rediseña inicialmente el rig para montar:

- brazos;
- armas;
- ropa;
- sombreros;
- capas;

como piezas independientes.

---

## 18.1. Primera solución

Cada equipo tiene:

- icono;
- tarjeta;
- nombre;
- rareza;
- efecto;
- VFX.

El combate muestra su identidad mediante:

- proyectiles;
- impactos;
- partículas;
- color;
- animación secundaria.

---

## 18.2. Segunda solución

Aspectos completos curados.

Ejemplos:

- Maga de hielo;
- Piromante;
- Ranger Cetrero;
- Guerrera Muro.

Cada skin es un personaje visual completo.

Equipo funcional y apariencia permanecen separados.

Elegir la skin favorita nunca empeora la build.

---

# 19. Gacha cosmético

El gacha llega solo cuando:

- existe un juego divertido;
- hay una moneda estable;
- hay suficientes cosméticos;
- la colección tiene valor visible.

---

## 19.1. Contenido permitido

- atuendos completos;
- accesorios;
- caras;
- animaciones idle;
- fondos;
- marcos;
- efectos de victoria;
- skins de armas;
- VFX cosméticos.

Cero stats.

---

## 19.2. Apertura y compra directa

Modelo recomendado:

### Bellota misteriosa
Más barata.

Ejemplo:

**100 bellotas**

### Elección directa
Más cara.

Ejemplo:

**250 bellotas**

Así existe sorpresa sin bloquear el deseo concreto.

---

## 19.3. Duplicados

Opciones:

- protección contra duplicado;
- garantía de objeto nuevo;
- convertir duplicado en polvo de bellota.

El polvo sirve para avanzar hacia una pieza deseada.

No se introduce otra moneda innecesaria si puede evitarse.

---

## 19.4. Banners

Se puede experimentar con:

- colección temática;
- semana de clase;
- temporada visual;
- banner permanente.

Pero no se utilizará FOMO agresivo.

Los cosméticos importantes no necesitan desaparecer permanentemente.

---

## 19.5. Pity

Si existe azar:

- probabilidades visibles;
- protección clara;
- progreso acumulado.

El pity no debe esconder una economía abusiva.

---

# 20. El gacha nunca entrega poder exclusivo

No se obtiene exclusivamente mediante gacha:

- armas funcionales;
- Aspectos necesarios;
- especializaciones;
- stats;
- mejoras verticales;
- acceso a contenido.

Si alguna arma aparece en una apertura:

- debe existir adquisición directa;
- o la apertura entrega solo su apariencia;
- o existe garantía tras esfuerzo conocido.

---

# 21. Derrota

Perder no destruye progreso.

La ardilla:

- se duerme;
- vuelve a la madriguera;
- necesita recuperarse visualmente;
- puede reintentar.

No pierde equipo.

No pierde XP.

No pierde cosméticos.

No pierde acceso a la aventura ya iniciada.

La derrota debe enseñar, no castigar arbitrariamente.

---

# 22. PvE antes que PvP

El primer objetivo es un PvE sólido.

Orden:

1. enemigo simple;
2. enemigos con telegraphs;
3. rutas;
4. jefes;
5. familias por género;
6. builds;
7. cooperativo;
8. PvP asíncrono.

---

# 23. Cooperativo

Primer sistema social recomendado:

## Jefe de club

Cada persona contribuye cuando:

- utiliza Biblioshare;
- completa aventuras;
- combate contra el jefe.

El grupo comparte el progreso.

Las ausencias no:

- restan vida;
- dañan al equipo;
- penalizan a los demás.

También se puede compartir:

- build;
- replay;
- equipo;
- skin;
- logro.

---

# 24. PvP asíncrono

Solo se diseña después.

Concepto posible:

- luchas contra la build guardada de otra persona;
- el defensor usa una política de IA;
- se declara claramente cómo actúa;
- el atacante no obtiene ventaja oculta;
- matchmaking por bandas;
- consentimiento;
- privacidad;
- bloqueo;
- reglas antiabuso.

No se implementa simplemente añadiendo un rating al PvE.

---

## 24.1. Posibles reglas futuras

Si se valida:

- bandas de nivel;
- bots para completar escalera;
- temporadas;
- recompensas cosméticas;
- sin pérdida permanente;
- sin degradaciones punitivas.

Todo esto queda como visión, no como requisito inicial.

---

# 25. Servidor y simulación

## 25.1. Motor determinista

El combate puede usar:

- seed;
- eventos;
- estado inicial;
- intervenciones;
- resolución por tramos.

Esto permite:

- replay;
- depuración;
- consistencia;
- reintentos;
- auditoría.

---

## 25.2. Resolución por tramos

Ejemplo:

```text
Estado inicial
 ↓
Servidor simula 2–5 s
 ↓
Cliente anima
 ↓
Ventana de intervención
 ↓
Jugador actúa
 ↓
Servidor valida
 ↓
Nuevo tramo
 ↓
...
```

El cooldown usa tiempo de simulación.

Al pausar, no sigue corriendo.

---

## 25.3. Minijuegos

El cliente nunca envía simplemente:

```text
score = 100
```

Debe enviar acciones verificables.

Ejemplo:

- orden de glifos;
- posiciones;
- secuencia;
- elecciones;
- timestamps con tolerancia cuando sea necesario.

El servidor reconstruye el resultado.

---

# 26. Offline

La campaña offline es una posibilidad futura, no la arquitectura base.

Puede permitirse más adelante para:

- entrenamiento;
- práctica;
- combates sin recompensa;
- contenido firmado;
- resultados que el servidor pueda verificar razonablemente.

No se acepta de forma ciega loot generado localmente.

---

# 27. Persistencia

Se necesita estado persistente para:

- bellotas;
- compras;
- inventario;
- equipo;
- Aspectos;
- Códice;
- especialización;
- aventura activa;
- recompensas reclamadas;
- cosméticos;
- pity si existe;
- historial de combate.

No puede derivarse todo del inventario visible.

---

# 28. Reintentos y consistencia

Casos obligatorios:

- doble click;
- retry de red;
- dos dispositivos;
- cierre de app;
- recompensa ya concedida;
- compra repetida;
- aventura retomada;
- actividad cultural editada;
- rollback;
- derrota y reintento;
- combate ya resuelto.

Cada acción económica importante necesita idempotencia.

---

# 29. Accesibilidad

Los minijuegos no miden capacidades reales del usuario.

Se ofrecen:

- menos presión temporal;
- controles simples;
- modos por pulsaciones;
- alternativa al arrastre fino;
- señales visuales;
- señales no auditivas;
- resolución asistida viable.

Una persona que use configuración accesible debe poder completar el contenido.

---

# 30. Fases de implementación

# Fase 1 — Progresión coherente

## Objetivo

> «Entiendo qué hace crecer a mi mascota.»

### Implementar

- nivel independiente de clase;
- afinidades acotadas;
- migración de mascotas actuales;
- simulación de perfiles;
- conservación de hitos.

### Termina cuando

- cambiar de clase no cambia el nivel;
- hábitos distintos siguen siendo viables;
- se entiende la siguiente mejora;
- los contratos de autoridad y persistencia están definidos.

---

# Fase 2 — Primera pelea divertida

## Objetivo

> «Mi mascota sabe luchar; yo sé cuándo ayudarla.»

### Implementar

- dos clases;
- dos o tres enemigos;
- ataques automáticos;
- habilidad manual;
- telegraphs;
- ulti;
- un minijuego;
- pausa;
- replay determinista.

### Recomendación

Probar:

- Maga;
- Guerrera.

Son contrastadas y fáciles de leer.

### Termina cuando

- repetir varios combates sigue siendo interesante;
- guardar una habilidad puede ser mejor que pulsarla;
- cambiar la decisión cambia el resultado.

---

# Fase 3 — Identidad de clase

## Objetivo

> «Elegir otra clase cambia cómo juego.»

### Implementar

- recurso de clase;
- interacción propia;
- segundo minijuego;
- feedback visual;
- accesibilidad.

### Validación

Maga:

- glifos.

Guerrera:

- postura/guardia.

Después:

- Bárbaro;
- Clérigo;
- Bardo;
- Ranger.

---

# Fase 4 — Biblioshare genera aventuras

## Objetivo

> «Lo que hago en la app me da motivos para volver al RPG.»

### Implementar

- bellotas;
- aventuras pendientes;
- misiones;
- objetivos semanales;
- límites antifarm;
- reanudación;
- entrenamiento sin recompensa.

### Termina cuando

- usar Biblioshare normalmente da suficiente acceso;
- no hace falta falsear registros;
- no caduca progreso innecesariamente;
- dos dispositivos no duplican recompensas.

---

# Fase 5 — Primera campaña

## Objetivo

> «Estoy recorriendo un mundo, no abriendo combates sueltos.»

### Implementar

- una región;
- un género;
- 5–8 nodos;
- 3 enemigos;
- 1 miniboss;
- 1 boss;
- 1 decisión de ruta.

### Género recomendado

**Terror** o **Misterio**.

Permiten enemigos muy diferenciados.

---

# Fase 6 — Primera build

## Objetivo

> «He conseguido algo y quiero probar otra forma de pelear.»

### Implementar

- arma;
- amuleto;
- 6–10 objetos;
- efectos claros;
- comparación;
- equipar gratis fuera de combate.

### No implementar aún

- nueve slots;
- reroll;
- gems;
- masterworking;
- cuatro afijos por pieza.

---

# Fase 7 — Especializaciones

## Objetivo

> «Mi Maga no juega como otra Maga.»

### Implementar

Primero:

- Piromante;
- una segunda rama contrastada.

Después:

- tercera especialización.

### Árbol inicial

3 elecciones binarias.

### Termina cuando

- dos ramas son útiles contra el mismo contenido;
- requieren decisiones diferentes;
- no existe una opción claramente dominante.

---

# Fase 8 — Aspectos y Códice

## Objetivo

> «Encontrar objetos sigue siendo progreso aunque no equipe el drop.»

### Implementar

- Aspectos;
- extracción;
- Códice de la Madriguera;
- colección permanente;
- 8–15 efectos iniciales.

### Termina cuando

- encontrar un nuevo Aspecto genera curiosidad;
- el jugador entiende qué build puede crear;
- no es necesario consultar una wiki externa.

---

# Fase 9 — Colección cosmética

## Objetivo

> «Tengo ganas de gastar bellotas.»

### Implementar

- pequeño catálogo;
- skins completas;
- marcos;
- VFX;
- apertura aleatoria;
- compra directa;
- duplicados protegidos;
- probabilidades claras.

### No implementar

- armas exclusivas de gacha;
- stats;
- power creep.

---

# Fase 10 — Más campaña y cooperativo

## Objetivo

> «Mi mascota tiene un recorrido y puedo compartirlo.»

### Implementar

- nuevos géneros;
- familias de enemigos;
- jefes especiales;
- jefe cooperativo;
- builds compartibles;
- replays.

---

# Fase 11 — Endgame opcional

Solo si existe demanda.

Posibles sistemas:

- más slots;
- rarezas avanzadas;
- afijos;
- Encuadernación;
- Restauración;
- fragmentos de género;
- temporadas PvE;
- desafíos.

Cada sistema se añade solo si resuelve una necesidad real.

---

# Fase 12 — PvP asíncrono

Última gran fase.

Requiere:

- política de IA defensiva;
- consentimiento;
- privacidad;
- matchmaking;
- balance atacante/defensor;
- detección de abuso;
- integridad competitiva;
- recompensas cosméticas.

---

# 31. Prioridad consolidada

| Sistema | Prioridad | Primera versión |
|---|---:|---|
| Nivel independiente de clase | Muy alta | Nivel común + afinidades limitadas |
| Combate automático | Muy alta | Básica automática |
| Intervención manual | Muy alta | Habilidad y telegraphs |
| Identidad por clase | Muy alta | Maga + Guerrera |
| Ulti + minijuego | Alta | 1–2 minijuegos reutilizables |
| Bellotas | Alta | Recompensas directas |
| Aventuras pendientes | Alta | Acumulables, sin caducidad |
| Campaña por géneros | Alta | 1 género |
| Equipo | Alta | Arma + amuleto |
| Especializaciones | Media-alta | 2 ramas de una clase |
| Aspectos | Media-alta | Pequeño catálogo |
| Códice | Media | Tras validar Aspectos |
| Cosméticos | Media | Skins completas |
| Gacha cosmético | Media | Sorpresa + compra directa |
| Rarezas profundas | Baja al inicio | Más tarde |
| 9 slots | Baja al inicio | Solo si el loot lo necesita |
| Crafting profundo | Baja | Endgame |
| Cooperativo | Media a largo plazo | Jefe de club |
| PvP | Muy baja inicialmente | Última fase |

---

# 32. MVP real

El primer lanzamiento no necesita:

- gacha;
- 18 especializaciones;
- Códice;
- nueve slots;
- PvP;
- temporadas;
- crafting;
- skins por piezas.

Sí necesita:

1. una mascota que pelee bien;
2. una decisión manual clara;
3. dos clases que se sientan diferentes;
4. una ulti memorable;
5. un enemigo que obligue a pensar;
6. recompensas comprensibles;
7. una conexión clara con Biblioshare;
8. persistencia segura.

---

# 33. Primer vertical slice recomendado

## Contenido

### Clases

**Maga**
- proyectiles;
- glifos;
- explosión;
- ulti de runas.

**Guerrera**
- ataques automáticos;
- Guardia;
- postura Muro/Filo;
- ulti defensiva.

### Enemigos

**Bandido**
- ataque normal;
- ataque fuerte anunciado.

**Espectro**
- defensa temporal;
- ventana vulnerable.

**Bibliotecario Corrupto**
- boss;
- alterna daño y protección;
- obliga a usar las dos clases de forma distinta.

### Equipo

4 armas.

4 amuletos.

### Campaña

Una pequeña ruta de Terror/Misterio.

### Recompensa

- bellotas;
- primer cosmético;
- primer objeto de build.

### Duración

Una sesión completa debe poder experimentarse en pocos minutos.

---

# 34. Métricas de producto

Antes de añadir complejidad se observa:

## Combate

- ¿se entiende qué ocurre?
- ¿se sabe por qué se perdió?
- ¿la habilidad se usa siempre en cooldown?
- ¿se cambia la decisión según enemigo?
- ¿se desea repetir?

## Build

- ¿un nuevo objeto provoca ganas de probarlo?
- ¿se entiende qué cambia?
- ¿hay una sola build dominante?

## Biblioshare

- ¿las recompensas alteran negativamente hábitos?
- ¿la gente divide sesiones artificialmente?
- ¿se siente obligación diaria?

## Gacha

- ¿la compra directa se usa?
- ¿la apertura sorprende sin frustrar?
- ¿los duplicados generan rechazo?

## Campaña

- ¿los géneros se sienten mecánicamente diferentes?
- ¿los bosses se recuerdan?

---

# 35. Riesgos principales

## Riesgo 1 — Sobreproducción

Crear 18 especializaciones antes de validar 2.

### Mitigación
Expandir clase por clase.

---

## Riesgo 2 — “Diablo administrativo”

Demasiados slots, números y basura de inventario.

### Mitigación
Pocos objetos, efectos fuertes y legibles.

---

## Riesgo 3 — Actividad cultural manipulada

Usuarios registrando cosas para minmaxear.

### Mitigación
Afinidades acotadas y límites antifarm.

---

## Riesgo 4 — Combate espectador

El auto-battle no requiere pensar.

### Mitigación
Telegraphs + intervención por clase + ulti.

---

## Riesgo 5 — Combate manual disfrazado

Una acción obligatoria cada segundo.

### Mitigación
Pocas ventanas relevantes.

---

## Riesgo 6 — Gacha sin propósito

Colección antes de existir apego.

### Mitigación
Gacha después del juego.

---

## Riesgo 7 — Cliente manipulable

Loot o moneda calculados localmente.

### Mitigación
Servidor autoritativo.

---

## Riesgo 8 — Arte imposible de mantener

Spritesheet por cada combinación.

### Mitigación
Iconos + VFX + skins completas curadas.

---

# 36. Filosofía final

Biblioshare no necesita convertirse en un MMO.

Necesita un RPG que aproveche lo que ya hace especial a la app:

- identidad cultural;
- colección;
- hábitos reales;
- amistad;
- biblioteca;
- descubrimiento;
- una mascota propia.

El juego debe sentirse como una extensión natural de esa identidad.

La visión completa puede llegar a tener:

- seis clases;
- 18 especializaciones;
- campaña por géneros;
- jefes;
- builds;
- Aspectos;
- Códice;
- cosméticos;
- cooperativo;
- PvP asíncrono.

Pero el camino correcto sigue siendo:

> **una pelea divertida → una elección interesante → una recompensa que apetezca usar → una build propia → una campaña que dé ganas de continuar.**

Solo después se añade el resto.

---

# 37. Resumen ejecutivo

## Núcleo

**Auto-combat + decisiones manuales + ulti/minijuego.**

## Clases

6 clases con identidad de interacción propia.

## Especializaciones

3 por clase como visión final; expansión gradual.

## Progresión

Biblioshare mantiene nivel y crecimiento principal.

## Economía

Bellotas sin dinero real.

## Aventuras

Se obtienen mediante actividad cultural y se acumulan.

## Campaña

Mapa por géneros literarios/culturales.

## Equipo

Empieza con arma + amuleto.

## Endgame

Aspectos + Códice antes de sistemas de crafting profundo.

## Gacha

Solo cosmético, con compra directa y protección contra duplicados.

## Arquitectura

Servidor autoritativo y motor determinista.

## Social

Cooperativo antes que PvP.

## Regla de producto

> **No construir profundidad que todavía no tiene un núcleo divertido al que servir.**