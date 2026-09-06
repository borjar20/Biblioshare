# Arena Zero — GDD de referencia para el combate de la mascota

> **[Referencia · externa, congelada 2026-09-02]** Especificación funcional y técnica «Arena Zero» (RPG autobattler 1v1
> asíncrono inspirado en la fórmula de El Bruto), escrita por el dueño del proyecto el 2026-09-02 y aportada el
> 2026-09-04 al arrancar la fase 4 de la mascota (#1015). Es la **referencia de jugabilidad y de arquitectura del
> motor** (determinismo, replay por eventos, servidor autoritativo, pocas decisiones), no una spec de Biblioshare:
> lo que se adopta y lo que se adapta está en `docs/superpowers/specs/2026-09-04-mascota-jefes-combate-design.md`.
> Texto extraído tal cual del `.docx` original (`Especificacion_IA_Arena_Zero.docx`), sin las tablas maquetadas.

> **Precedencia actual · 2026-09-06:** la adaptación inicial enlazada arriba es histórica.
> El alcance que se continúa está en [Evolución del RPG por fases](../design/2026-09-06-mascota-rpg-evolucion-por-fases.md),
> que incorpora intervenciones durante el combate. Este GDD sigue siendo referencia, no un contrato de implementación.

---

ESPECIFICACION FUNCIONAL Y TECNICA · V1.0
Arena Zero
RPG autobattler 1v1 asincrono inspirado en la formula de El Bruto
Objetivo: Convertir la idea en una especificacion ejecutable por un equipo humano o una IA de desarrollo
Plataforma inicial: Web responsive; arquitectura preparada para cliente movil posterior
Alcance: MVP jugable, seguro, determinista, medible y ampliable
Estado: Base de producto para prototipo y validacion
Fecha: 2 de septiembre de 2026
Promesa del producto: Tu construyes al luchador. El se encarga de luchar. El jugador descubre una build unica, toma pocas decisiones de alto impacto y observa combates automaticos capaces de producir historias memorables.
Este documento toma como referencia la estructura conceptual del juego clasico, pero define una identidad, contenido, balance, datos y arquitectura propios. No autoriza copiar marcas, arte, textos, animaciones, codigo ni tablas exactas de terceros.
0. Como usar este documento
El documento funciona simultaneamente como Game Design Document (GDD), Product Requirements Document (PRD) y especificacion tecnica inicial. Puede adjuntarse completo a una IA con capacidad de programacion. La IA debe tratar las decisiones marcadas como obligatorias y convertir los puntos abiertos en preguntas o decisiones registradas, no en supuestos silenciosos.
Para analizar: revisar coherencia, riesgos, dependencias y alcance antes de proponer cambios.
Para implementar: trabajar por hitos, empezando por el motor de combate sin interfaz grafica.
Para balancear: usar simulaciones masivas y telemetria; nunca ajustar solo por sensaciones.
Para ampliar: conservar compatibilidad de replays mediante versiones de reglas y snapshots.
Regla de precedencia: Seguridad y determinismo > integridad competitiva > claridad de producto > contenido > pulido visual. Si una peticion contradice este orden, la IA debe advertirlo.
1. Resumen ejecutivo
Arena Zero es un RPG/autobattler 1v1 asincrono. El jugador crea un luchador, descubre su potencial procedural, elige mejoras al subir de nivel, selecciona rivales y observa combates resueltos por el servidor. La profundidad proviene de las interacciones entre estadisticas, armas, habilidades, companeros, actitud y personalidad, no de una interfaz cargada de controles.
El MVP debe probar una sola hipotesis: observar combates automaticos cortos sigue siendo entretenido despues de veinte partidas y las decisiones de progresion generan apego por el personaje. Si esa hipotesis falla, no se debe intentar compensar con clanes, monetizacion o mayor volumen de contenido.
Dimension
Decision base
Indicador de exito
Sesion
3-8 minutos; 5 combates clasificados diarios
Al menos 65% completa 3 combates en su primera sesion
Combate
Automatico, determinista, 20-60 s de reproduccion
Mas de 70% ve el replay completo en onboarding
Progresion
Dos elecciones de destino por nivel
Mas de 50% vuelve para alcanzar un segundo nivel
Competicion
Arena asincrona con informacion parcial
La eleccion de rival modifica resultados y no es trivial
Negocio
Cosmeticos; nunca poder directo
Sin ventaja competitiva comprable
2. Vision, objetivos y limites
2.1 Objetivos del producto
Onboarding inferior a dos minutos desde registro hasta primer combate.
Personajes que se sientan propios y diferentes sin requerir conocimiento previo.
Combates legibles, sorprendentes y reproducibles exactamente.
Decisiones escasas pero relevantes: rival, actitud y evolucion.
Backend autoritativo que impida que el cliente decida resultados.
Contenido definido por datos para ampliar armas y habilidades sin reescribir el motor.
Base medible: cada hipotesis de retencion y balance debe tener eventos de telemetria.
2.2 No objetivos del MVP
Combate en tiempo real controlado por el jugador.
Equipamiento manual con decenas de ranuras o inventario complejo.
Clanes, chat, temporadas, pase de batalla o mercado entre jugadores.
Aplicaciones nativas iOS/Android.
Campana narrativa extensa, mundo explorable o PvE de larga duracion.
Monetizacion pay-to-win, energia comprable o reintentos que alteren ranking.
2.3 Diferenciacion e identidad propia
Se conserva la idea general de un luchador procedural que combate solo, pero la expresion debe ser original. El tono recomendado combina deporte de arena, ciencia basura y objetos cotidianos absurdos. El nombre Arena Zero es provisional y debe validarse legal y comercialmente antes de publicarse.
Conservar como patron
Reinterpretar
No copiar
Autocombate y sesiones cortas
Arbol de destino con dos opciones
Nombre El Bruto / My Brute
Informacion parcial del rival
Actitud previa al combate
Arte, personajes, interfaz e iconos
Armas y rasgos inesperados
Companeros con costes de build
Textos, rangos y nombres distintivos
Torneos asincronos
Replays por eventos versionados
Codigo o tablas exactas de balance
3. Pilares y bucles de jugabilidad
Pilar
Funcion
Riesgo a evitar
Identidad
Cada luchador nace con seed, apariencia y futuro propios
Permitir reroll infinito hasta obtener una build perfecta
Espectaculo
El combate crea una historia visible y comprensible
Resolver el ganador y fingir despues una animacion inconexa
Anticipacion
El siguiente nivel revela opciones parcialmente
RNG opaco sin capacidad de decision
Escasez justa
Pocas partidas clasificadas hacen relevante elegir
Vender mas intentos competitivos
Comparacion
Ranking, historial y torneos dan contexto social
Premiar multicuentas o referidos con poder
3.1 Bucle principal
Entrar y revisar estado, recompensas y progreso del luchador.
Explorar seis rivales con informacion parcialmente oculta.
Elegir rival y una actitud: ofensiva, equilibrada o defensiva.
Solicitar el combate al servidor y reproducir su lista de eventos.
Recibir XP, variacion de rating e hitos.
Si hay subida de nivel, elegir una de dos opciones de destino.
Consultar historial, compartir replay o iniciar otro combate.
3.2 Bucles de retencion
Diario: cinco combates clasificados, primera victoria y progreso de nivel.
Semanal: clasificacion, reto de reglas y recompensa cosmetica no competitiva.
Largo plazo: completar ramas de destino, titulos y archivo de replays memorables.
4. Experiencia de usuario y flujos
4.1 Creacion del luchador
El jugador decide nombre y apariencia. El servidor crea fighterId, seed secreta, personalidad, estadisticas iniciales y grafo de destino. El nombre nunca forma parte de la seed para impedir busquedas offline de builds.
Generacion segura de identidad
fighter_seed = HMAC_SHA256(server_secret, account_id + fighter_id + ruleset_version)public_cosmetic_seed = random_uuid()
Un luchador gratuito por cuenta en MVP; ranuras adicionales quedan fuera del primer hito.
No se permite borrar y recrear durante 72 horas despues del primer combate clasificado.
El primer combate usa un rival tutorial generado por el sistema y no afecta rating.
4.2 Pantallas minimas
Pantalla
Contenido esencial
Accion primaria
Inicio
Luchador, XP, nivel, rating, intentos, proxima pista
Ir a Arena
Arena
Seis rivales, nivel, cuatro stats, rating, pistas de build
Retar
Precombate
Comparacion y selector de actitud
Confirmar
Replay
Animacion, velocidad 1x/2x, registro resumido
Continuar
Resultado
Ganador, XP, rating, progreso y eventos destacados
Siguiente rival
Destino
Dos mejoras excluyentes y vista previa clara
Elegir mejora
Perfil
Stats, arsenal, habilidades, companero, historial
Compartir
4.3 Informacion parcial del rival
Siempre se muestran nivel, HP, Fuerza, Agilidad, Velocidad y rating. Se muestran hasta dos pistas adicionales calculadas por el servidor: familia de arma mas probable, presencia de companero o una etiqueta de estilo. No se muestra la lista completa de habilidades antes de un combate clasificado.
5. Modelo del luchador
5.1 Estadisticas visibles
Stat
Rango inicial
Responsabilidad
Vigor
3-8
HP maximo y resistencia a estados
Fuerza
3-8
Dano base, armas pesadas y ruptura de bloqueo
Agilidad
3-8
Precision, evasion, critico, combo y desarme
Velocidad
3-8
Iniciativa, frecuencia de accion y recuperacion
5.2 Estadisticas derivadas y formulas MVP
Formulas normativas v1
MAX_HP = round(80 + 12*VIGOR + 3*(LEVEL-1))SPEED_MULT = clamp(1 + 0.025*SPEED, 1.00, 2.00)ACTION_INTERVAL = max(18, round(BASE_INTERVAL / SPEED_MULT))HIT_CHANCE = clamp(0.85 + 0.008*(AGI_A-AGI_D) + ACC_BONUS - EVA_BONUS, 0.45, 0.98)CRIT_CHANCE = clamp(0.03 + 0.004*AGI_A + CRIT_BONUS, 0.03, 0.30)ARMOR_MITIGATION = ARMOR / (ARMOR + 100)WEAPON_STR_SCALE = strengthScaleBp / 10000RAW_DAMAGE = WEAPON_BASE + STR_A*WEAPON_STR_SCALEFINAL_DAMAGE = max(1, round(RAW_DAMAGE * VARIANCE * CRIT_MULT * (1-ARMOR_MITIGATION)))
VARIANCE se obtiene del PRNG determinista en el intervalo entero [90, 110] y se aplica como porcentaje. CRIT_MULT es 1.50 por defecto. Todas las probabilidades se convierten a enteros de 0 a 10.000 antes de compararse para evitar diferencias de coma flotante.
5.3 Personalidad
Personalidad
Cambio de pesos de IA
Contrapartida
Agresivo
+20 atacar, +5 tecnica ofensiva
-15 defensa, -10 cambiar arma
Tactico
+15 tecnica, +15 cambiar arma
-15 atacar
Tenaz
+15 defensa bajo 35% HP
-10 tecnica al inicio
Caotico
+20 acciones raras
Mayor varianza de decisiones
La personalidad se genera al crear el luchador y se muestra al jugador. Forma parte de la build, pero no debe aportar una bonificacion neta de estadisticas.
6. Motor de combate determinista
Principio obligatorio: El servidor simula el combate completo. El cliente recibe BattleEvent[] y solo reproduce. Nunca se acepta del cliente el ganador, dano, XP, rating ni inventario resultante.
6.1 Entradas y versionado
Contrato puro del motor
simulateBattle({  battleId, rulesetVersion, battleSeed,  fighterASnapshot, fighterBSnapshot,  attitudeA, attitudeB}) -> { winnerId, outcome, durationTicks, events, checksum }
El snapshot contiene todos los valores necesarios y es inmutable.
battleSeed = HMAC del servidor sobre battleId y snapshots; nunca elegida por el cliente.
rulesetVersion selecciona formulas y contenido historicos para replays antiguos.
checksum firma el resultado y detecta corrupcion o ejecuciones divergentes.
6.2 PRNG
Para el MVP se recomienda xoshiro128** o PCG32 con implementacion propia, tests de vectores y estado serializable. No usar Math.random(). Cada consumo del PRNG debe realizarse en un orden documentado; agregar una tirada nueva exige aumentar rulesetVersion.
6.3 Reloj de acciones
Pseudocodigo del scheduler
initialize nextAction[A/B] = seededInitiativeJitter(0..5) - SPEED_BONUSwhile both alive and actionCount < 120 and battleTick < 1800:    actor = entity with lowest nextAction; ties resolved by seeded roll    action = chooseAction(actor, state, rng)    events += resolveAction(action, state, rng)    nextAction[actor] += action.intervalTicks    battleTick = min(nextAction of living entities)
Los companeros participan como entidades con su propio nextAction. Sacar arma, atacar, cambiar arma y usar tecnica consumen intervalos distintos. Las reacciones como bloqueo o contraataque no abren un turno completo salvo que la habilidad lo indique.
6.4 Seleccion de accion por IA
Accion
Peso base
Condiciones principales
Atacar
55
Requiere objetivo vivo; +personalidad y actitud
Sacar arma
25
Solo si esta desarmado y quedan armas
Tecnica
12
Solo tecnicas elegibles y fuera de cooldown
Cambiar arma
5
Solo si posee alternativa y hay motivo tactico
Defender
3
Aumenta con actitud defensiva o HP bajo
El algoritmo filtra acciones imposibles, aplica modificadores, limita cada peso a 0..200 y hace una seleccion ponderada con el PRNG. Las habilidades pueden anadir candidatas o alterar pesos; no pueden llamar directamente a una fuente aleatoria externa.
6.5 Resolucion de ataque
Emitir ACTION_STARTED con actor, objetivo, arma e intervalo.
Comprobar precision mediante HIT_CHANCE. Si falla, emitir DODGE o MISS segun el modificador dominante.
Si impacta, comprobar bloqueo. Un bloqueo reduce dano, no garantiza cero.
Calcular dano base, variacion, critico, armadura y escudos.
Aplicar dano y efectos onHit en orden de prioridad estable.
Evaluar desarme, contraataque y combo; cada reaccion tiene maximo una activacion por accion origen.
Resolver KO inmediatamente antes de programar acciones nuevas.
6.6 Limites y desempate
KO: gana el ultimo luchador principal con HP mayor que cero.
Limite: 120 acciones o 1.800 ticks; evita bucles defensivos.
Desempate 1: mayor porcentaje de HP del luchador principal.
Desempate 2: mayor dano total infligido a entidades enemigas.
Desempate 3: tirada determinista registrada como TIEBREAK.
6.7 Eventos de replay
Ejemplo de BattleEvent
{  "seq": 17, "tick": 238, "type": "DAMAGE_APPLIED",  "actorId": "fighter_a", "targetId": "fighter_b",  "sourceId": "weapon_sarten_ionica",  "amount": 19, "critical": true, "targetHpAfter": 42,  "tags": ["melee", "blunt"]}
Evento minimo
Uso de cliente
BATTLE_STARTED
Cargar escenario, combatientes y version
WEAPON_DRAWN / DISARMED
Cambiar objeto visual en mano
ACTION_STARTED
Elegir animacion y anticipacion
MISS / DODGE / BLOCK
Mostrar defensa sin inventar resultado
DAMAGE_APPLIED / HEALED
Actualizar barras y numeros
STATUS_APPLIED / EXPIRED
Iconos y efectos temporales
ENTITY_KO
Animacion de caida
BATTLE_ENDED
Resultado, razon y checksum
7. Contenido inicial del MVP
Todo el contenido se carga desde configuracion versionada. Los identificadores son estables y sin caracteres dependientes del idioma. Los nombres visibles se resuelven por localizacion.
7.1 Armas
Arma
Familia
Dano
Intervalo
Escala STR
Rasgo
Daga de taller
Rapida
7
34
0.55
+combo
Abanico de acero
Rapida
6
30
0.40
+evasion tras atacar
Espada de chatarra
Media
14
64
0.85
equilibrada
Lanza telescopica
Media
13
70
0.75
+precision
Baston magnetico
Defensiva
11
68
0.65
+bloqueo
Escudo-senal
Defensiva
9
76
0.60
+armadura
Mazo de reactor
Pesada
30
132
1.35
+ruptura; lenta
Ancla portatil
Pesada
34
150
1.45
muy lenta
Tuercas orbitales
Arrojadiza
5
25
0.35
6 municiones
Discos de taller
Arrojadiza
7
32
0.45
4 municiones
Sarten ionica
Extrana
18
78
0.95
+critico inicial
Baguette fosilizada
Extrana
12
55
0.70
puede romperse
7.2 Habilidades
Habilidad
Tipo
Efecto MVP
Limite
Piel ceramica
Rasgo
-12% dano recibido
Siempre
Manos expertas
Rasgo
+15% dano con armas
Con arma
Pulmon extra
Rasgo
+18% HP; -5% velocidad
Siempre
Vista calibrada
Rasgo
+8 puntos de precision
Siempre
Paso lateral
Reaccion
+15 puntos de evasion
Max. 2/combate
Replica
Reaccion
Contraataque al bloquear
25%; 1/accion
Rencor
Reaccion
+25% dano tras recibir critico
Siguiente accion
Agarre de emergencia
Reaccion
Evita un desarme
1/combate
Barrido
Tecnica
Dano a luchador y companero
Cooldown 150
Golpe de muneca
Tecnica
Intenta desarmar
Cooldown 180
Lanzamiento
Tecnica
Arroja arma para gran dano
Consume arma activa
Guardia cerrada
Tecnica
+35 armadura temporal
80 ticks
Cambio relampago
Tecnica
Cambia arma y ataca
Cooldown 220
Carga
Tecnica
+20% dano si es primera accion
1/combate
Furia triple
Super
Tres golpes al 65%
1/combate; HP <40%
Pulso de choque
Super
Dano y retraso a enemigos
1/combate
Segunda chispa
Super
Sobrevive a KO con 1 HP
1/combate
Lluvia de piezas
Super
4 proyectiles aleatorios
1/combate
7.3 Companeros
Companero
Funcion
Coste de build
Rata mecanica
Ataque rapido de 4 dano
-5% HP
Jabali de carga
Golpe inicial de 14 dano
-10% velocidad
Cuervo de interferencia
Reduce precision rival 6 puntos
-8% dano propio
Golem de bolsillo
Absorbe hasta 28 dano
-12% HP
7.4 Actitudes precombate
Actitud
Modificador
Lectura
Ofensiva
+10% dano causado; -8% mitigacion
Para presionar builds lentas
Equilibrada
Sin modificador
Opcion segura
Defensiva
+10% mitigacion; -8% dano causado
Para sobrevivir a fuerza alta
8. Progresion y sistema de destino
8.1 Experiencia
Reglas de XP MVP
XP_VICTORY = 3XP_DEFEAT = 1BONUS_STRONGER_RIVAL = +1 if opponentRating >= ownRating + 100FIRST_WIN_DAILY = +1XP_TO_NEXT(level) = 8 + floor(3.5 * level^1.35)
La derrota progresa porque el jugador no controla directamente el combate. No se entrega XP en amistosos. Contra el mismo rival solo los dos primeros combates clasificados del dia pueden otorgar XP, aunque el rating siempre se resuelve si el emparejamiento era valido.
8.2 Elecciones por nivel
Cada nivel presenta dos opciones excluyentes generadas previamente desde fighterSeed y rulesetVersion. La eleccion es permanente durante la temporada. El servidor guarda el nodo ofrecido y la eleccion; nunca regenera opciones en respuesta a refrescos del cliente.
Tipo de mejora
Ejemplos
Peso inicial
Estadistica
+3 Fuerza; +2 Velocidad +1 Agilidad
45%
Arma
Una nueva arma no duplicada
25%
Habilidad
Rasgo, reaccion o tecnica
25%
Companero
Uno, con coste asociado
5%
8.3 Restricciones del generador
Las dos opciones de un nivel no pueden ser identicas ni estrictamente equivalentes.
No ofrecer un arma ya poseida salvo que el sistema de mejora de armas se implemente despues del MVP.
Maximo un companero activo y maximo dos ofertas de companero antes de nivel 15.
Garantizar al menos un arma entre niveles 2 y 4 y una habilidad entre niveles 3 y 6.
Evitar tres niveles consecutivos con solo estadisticas.
Registrar la razon de cada restriccion aplicada para depuracion.
8.4 Vista parcial del futuro
En el nivel actual se muestran las dos opciones completas. Del nivel siguiente se muestran solo las categorias, por ejemplo 'arma o estadistica'. No se muestran valores exactos antes de tiempo. Esto crea anticipacion sin permitir planificar todo el arbol desde fuera.
9. Modos de juego y competicion
9.1 Arena clasificada
Cinco combates por dia UTC; el contador no se puede comprar.
Seis rivales generados bajo demanda y bloqueados durante 15 minutos.
El defensor usa su snapshot actual y actitud equilibrada en el MVP.
El atacante no puede cambiar de actitud despues de crear el battleId.
9.2 Amistosos
Ilimitados, sin XP ni rating. Permiten probar builds, compartir enlaces y reproducir combates. Deben pasar por el mismo motor y medidas de rate limiting para evitar usar la infraestructura como generador gratuito de simulaciones masivas.
9.3 Torneos posteriores al MVP
El esquema debe admitir torneos asincronos por eliminatorias, pero su interfaz y orquestacion quedan para una segunda fase. Cada ronda congela snapshots, genera seeds independientes y conserva todos los replays. La inscripcion nunca debe bloquear el uso normal del luchador.
10. Matchmaking, rating y antiabuso
10.1 Seleccion de rivales
Reglas de candidatos
candidate pool:  same ruleset and active season  level difference <= 2  rating window starts at +/-150, expands to +/-300 if needed  exclude same account, blocked users, recent 24h duplicates > 2return 6 candidates diversified by rating and visible build tags
10.2 Rating
Usar Glicko-2 si el equipo dispone de una implementacion probada; para el prototipo se admite Elo con K=24, expectativa logistica y delta limitado a +/-32. El rating se actualiza dentro de la misma transaccion que el resultado del combate. Los amistosos nunca alteran rating.
10.3 Controles de abuso
Abuso
Control MVP
Creacion masiva
Verificacion de cuenta, rate limit y cooldown de borrado
Farming de rival
XP limitado por pareja/dia y diversidad de candidatos
Manipulacion de cliente
Servidor autoritativo; validacion de actitud y battleId
Replay alterado
Snapshots, seed, version y checksum firmados
Bots de API
Cuotas por cuenta/IP, idempotencia y deteccion de velocidad imposible
Explotacion de seed
HMAC secreto y ninguna seed competitiva expuesta antes del resultado
11. Arquitectura tecnica
11.1 Stack recomendado
Capa
Tecnologia sugerida
Motivo
Cliente
Next.js + React + TypeScript
Web responsive, routing y entrega rapida
Replay
PixiJS o Phaser
Animacion 2D por eventos; desacoplada del resultado
API
Node.js/TypeScript
Comparte tipos con motor sin compartir autoridad con cliente
Motor
Paquete TypeScript puro
Determinismo, tests y simulador CLI
Datos
PostgreSQL
Transacciones, historial y consultas de ranking
Colas
Opcional tras MVP
Torneos, lotes y simulaciones; no necesaria para arena simple
Cache
Opcional Redis
Rate limit distribuido y rankings calientes
11.2 Modulos
Estructura de monorepo propuesta
apps/  web/                 # UI y reproductor  api/                 # autenticacion, arena, progresionpackages/  battle-engine/       # puro; sin DB, red, reloj ni Math.random  battle-content/      # armas, skills, companions, rulesets  contracts/           # DTOs y validacion runtime  db/                  # esquema, migraciones, repositorios  telemetry/           # eventos de productotools/  balance-simulator/   # lotes, informes y regresiones
11.3 Fronteras obligatorias
battle-engine no importa codigo de React, base de datos, red, fecha actual ni variables de entorno.
battle-content se carga por rulesetVersion y se valida al arrancar.
api crea snapshots y persiste resultados; el motor no persiste.
web no recibe fighterSeed privada ni reglas ocultas del rival antes del combate.
12. Modelo de datos
Tabla
Campos esenciales
Notas
users
id, handle, status, created_at
Cuenta y moderacion
fighters
id, user_id, name, seed_ciphertext, level, xp, rating, stats, personality
Un registro activo por luchador
fighter_weapons
fighter_id, weapon_id, acquired_level
IDs de contenido estables
fighter_skills
fighter_id, skill_id, acquired_level
Sin blobs de logica
fighter_companions
fighter_id, companion_id, active
Maximo uno activo
destiny_nodes
fighter_id, level, option_a, option_b, chosen
Opciones inmutables
battles
id, mode, ruleset, seed_ciphertext, snapshots, attitudes, winner, checksum
Cabecera y resultado
battle_events
battle_id, seq, tick, type, payload
JSONB o blob comprimido segun volumen
daily_fight_counters
fighter_id, day_utc, used
Actualizacion atomica
rating_history
fighter_id, battle_id, before, after
Auditoria competitiva
12.1 Invariantes transaccionales
battleId es idempotente: repetir la solicitud devuelve el mismo resultado.
Consumir intento, crear combate, otorgar XP y actualizar rating ocurre en una transaccion o mediante un flujo recuperable con estados.
Una eleccion de destino pasa de null a A/B una sola vez.
Los snapshots y eventos no se modifican tras finalizar el combate.
Cada fighter pertenece a exactamente un user y no puede luchar contra otro fighter de la misma cuenta en clasificado.
13. Contrato de API
Metodo y ruta
Entrada
Salida / efecto
POST /v1/fighters
name, cosmeticChoices
Crea luchador y destino inicial
GET /v1/fighters/:id
-
Perfil publico o privado segun actor
GET /v1/arena/candidates
fighterId
Seis candidatos y token de oferta
POST /v1/battles
fighterId, opponentId, attitude, offerToken, idempotencyKey
Simula y persiste combate
GET /v1/battles/:id
-
Resultado, snapshots permitidos y eventos
POST /v1/fighters/:id/destiny
level, choice, idempotencyKey
Aplica mejora una vez
GET /v1/fighters/:id/history
cursor
Historial paginado
13.1 Errores de dominio
Codigos estables; los mensajes se localizan en cliente
FIGHTER_NOT_OWNED | DAILY_LIMIT_REACHED | OFFER_EXPIREDINVALID_OPPONENT | INVALID_ATTITUDE | DESTINY_ALREADY_CHOSENRULESET_UNAVAILABLE | BATTLE_IN_PROGRESS | RATE_LIMITED
13.2 Semantica de creacion de combate
Autenticar y comprobar propiedad del luchador.
Validar offerToken, rival, actitud, limite diario e idempotencyKey.
Bloquear contador diario y cargar ambos luchadores.
Crear snapshots y battleSeed dentro del servidor.
Ejecutar simulateBattle con timeout y limite de memoria.
Persistir resultado, eventos, XP y rating de forma atomica.
Responder con battleId y datos de replay; no con animacion pre-renderizada.
14. Seguridad, privacidad e integridad
Cifrar seed privada y secretos; nunca escribirlos en logs de aplicacion.
Validar DTOs en runtime y rechazar campos desconocidos en endpoints de mutacion.
Usar consultas parametrizadas y permisos de minimo privilegio.
Aplicar CSRF segun el modelo de sesion, cookies seguras y rotacion de tokens.
Limitar tamano de nombres, payloads, historial y frecuencia de endpoints costosos.
Separar identificadores publicos de claves internas cuando reduzca enumeracion.
Mantener registro de administracion, correcciones de rating y cambios de ruleset.
Prohibicion: No ejecutar codigo generado por usuarios dentro del motor. Armas y habilidades se expresan con operaciones permitidas o plugins internos revisados, nunca con scripts enviados por cliente.
15. Balance, simulacion y telemetria
15.1 Simulador
El mismo paquete battle-engine debe ejecutarse por CLI sin graficos. El simulador genera poblaciones por nivel, enfrenta pares con seeds multiples y produce CSV/JSON con win rate, duracion, dano, frecuencia de skills y extremos.
Interfaz esperada
pnpm balance:run --ruleset v1 --battles 100000 --levels 1-15 --seed 42Salida minima:weapon_id, skill_id, companion_id, level_band, battles, win_rate, avg_ticks, p95_ticks
15.2 Umbrales iniciales
Metrica
Objetivo
Accion si falla
Win rate por arma
45%-55% global
Revisar por nivel y sinergia antes de nerfear
Sinergia frecuente
42%-58% con muestra suficiente
Ajustar interaccion, no necesariamente piezas aisladas
Duracion mediana
25-45 s visuales
Ajustar HP, intervalos o velocidad de reproduccion
Combates al limite
<1%
Reducir bucles defensivos
Ventaja por eleccion
Ninguna opcion >65% en mismo nodo
Reequilibrar la pareja de destino
15.3 Eventos de producto
Taxonomia minima
fighter_created, tutorial_started, tutorial_completedarena_viewed, candidate_selected, attitude_selectedbattle_requested, replay_started, replay_completed, replay_skippedlevel_reached, destiny_viewed, destiny_chosenshare_clicked, friendly_battle_created, session_ended
Cada evento incluye userId seudonimizado, fighterId, sessionId, rulesetVersion, clientVersion y timestamp. No incluir seed privada ni snapshots completos en analitica.
16. Estrategia de pruebas
Nivel
Pruebas obligatorias
Unidad
Formulas, clamps, pesos, cooldowns, estados, desarme y KO
Determinismo
Misma entrada produce mismo checksum en 1.000 ejecuciones
Vectores PRNG
Estado y secuencia conocidos por version
Propiedades
HP nunca negativo en eventos; probabilidades en rango; seq monotono
Regresion
Golden replays por ruleset; no cambian sin version nueva
Integracion
API + DB: idempotencia, limites, XP, rating y destino
Carga
Picos de creacion de combate; p95 y saturacion
E2E
Crear luchador -> tutorial -> arena -> replay -> nivel -> destino
16.1 Criterios de calidad del motor
Cero dependencias de reloj, red, DB o aleatoriedad global.
Cobertura de ramas criticas superior al 90%.
100.000 combates sin excepciones, NaN, bucles infinitos ni eventos invalidos.
Un combate tipico se simula por debajo de 10 ms en hardware de desarrollo; validar con benchmark real.
Cada bug de determinismo se convierte en un golden test.
17. Alcance exacto del MVP
Incluido
Excluido
Registro y un luchador
Clanes y chat
4 stats, 4 personalidades, 3 actitudes
Torneos operativos
12 armas, 18 habilidades, 4 companeros
Pase, tienda y pagos
Motor determinista y replays
Apps nativas
Arena clasificada y amistosos
PvE y campana
Niveles y destino
Mercado e intercambio
Historial y perfil compartible
Herramientas sociales avanzadas
Simulador y telemetria
Contenido de temporada
17.1 Criterio de salida del MVP
El MVP esta listo para beta cerrada cuando el flujo E2E funciona en produccion de prueba, los replays son deterministas, no existen exploits conocidos para obtener intentos/XP/rating extra, el simulador no detecta outliers graves y una prueba con usuarios confirma que el combate se entiende sin explicacion externa.
18. Plan de implementacion por hitos
Hito
Entregable
Puerta de salida
H0. Decisiones
Repos, stack, reglas v1, DTOs, ADRs
Especificacion aprobada y riesgos asignados
H1. Motor
PRNG, scheduler, dano, 4 armas, tests
10.000 combates deterministas
H2. Contenido
12 armas, 18 skills, companeros, simulador
Informe de balance reproducible
H3. Persistencia
Esquema, migraciones, snapshots, idempotencia
Integracion DB verde
H4. API
Fighters, candidatos, battles, destino
Contrato y seguridad validados
H5. Cliente
Pantallas, replay 2D, resultados
Flujo E2E usable en movil
H6. Operacion
Telemetria, limites, observabilidad, despliegue
Beta cerrada monitorizada
H7. Validacion
Prueba usuarios, tuning, bugs
Decision go/no-go basada en metricas
18.1 Orden obligatorio
No comenzar por animaciones finales. Primero motor puro y simulador; despues persistencia/API; por ultimo reproductor y pulido. Se admite un visualizador temporal de eventos para depurar, pero no debe condicionar el modelo de combate.
19. Definition of Done
La funcionalidad tiene criterio de aceptacion verificable y tests automaticos.
Las mutaciones son idempotentes cuando puedan repetirse por red.
Los eventos y errores tienen nombres estables y estan documentados.
No se exponen secretos, seeds privadas ni datos ocultos del rival.
Se han registrado telemetria, logs utiles y alertas para fallos operativos.
Los cambios de reglas que afectan replays incrementan rulesetVersion.
La UI tiene estados de carga, error, vacio, reintento y accesibilidad basica.
El resultado ha pasado revision de seguridad, balance y experiencia segun su impacto.
20. Riesgos y decisiones pendientes
Tema
Decision provisional
Validacion necesaria
Nombre
Arena Zero provisional
Marca, dominios y tono
Arte
2D estilizado y comico
Prueba de legibilidad con 10+ eventos
Rating
Elo en prototipo; Glicko-2 despues
Volumen real y experiencia del equipo
Intentos
5 clasificados diarios
Retencion vs. frustracion
Destino
Dos opciones permanentes
Percepcion de agencia y arrepentimiento
Defensor
Actitud equilibrada
Permitir actitud defensiva guardada mas adelante
Contenido absurdo
Objetos originales de ciencia basura
Coherencia visual y rating por edades
Replays
Eventos JSONB inicialmente
Costo/volumen antes de comprimir
Decision de producto clave: No ampliar el alcance hasta responder con usuarios si mirar veinte combates sigue siendo divertido y si las elecciones de destino generan apego.
Apendice A. Instrucciones para una IA implementadora
El siguiente bloque puede usarse como mensaje de sistema o primera instruccion junto con este documento. Debe mantenerse unido a la especificacion.
Prompt maestro
ROLActua como arquitecto y desarrollador principal de Arena Zero. Usa este documento como fuente normativa del MVP.OBJETIVOAnaliza la especificacion, identifica contradicciones o decisiones bloqueantes y construye el producto por hitos. Prioriza un motor de combate puro, determinista y probado antes que la interfaz final.REGLAS DE TRABAJO1. No copies nombres, arte, textos, codigo ni balance exacto de El Bruto/My Brute.2. No amplíes el alcance con clanes, pagos, temporadas o PvE durante el MVP.3. No uses Math.random ni estado global en el motor.4. El servidor es autoritativo. El cliente nunca calcula ni declara resultados.5. Conserva snapshots, seed, rulesetVersion, eventos y checksum para replays.6. Todo endpoint de mutacion debe validar entrada e idempotencia.7. Todo cambio que altere un replay existente crea una nueva rulesetVersion.8. Separa decisiones confirmadas, supuestos y preguntas abiertas.9. Implementa contenido mediante configuracion validada y IDs estables.10. Tras cada hito, ejecuta tests, simulaciones y presenta evidencia.PRIMERA RESPUESTA ESPERADA- Resumen de la arquitectura propuesta.- Lista de contradicciones o preguntas realmente bloqueantes.- ADRs iniciales que se deben registrar.- Plan de H0 y H1 con archivos, interfaces, pruebas y criterios de salida.- Riesgos de seguridad y determinismo.PRIMER ENTREGABLE DE CODIGOUn paquete battle-engine sin UI, DB, red ni reloj; PRNG con vectores; tipos FighterSnapshot/BattleEvent; scheduler; ataque basico; cuatro armas; golden tests; CLI capaz de ejecutar 10.000 combates y producir un resumen reproducible.FORMATO DE AVANCEPara cada cambio informa: objetivo, archivos, decision, pruebas ejecutadas, resultado, deuda y siguiente paso. No declares completado un hito sin cumplir su puerta de salida.
Apendice B. Esquemas de configuracion
Tipos conceptuales
type WeaponConfig = {  id: string; ruleset: string; family: WeaponFamily;  baseDamage: number; baseIntervalTicks: number; strengthScaleBp: number;  ammo?: number; tags: string[]; hooks: EffectRef[];};type FighterSnapshot = {  fighterId: string; level: number; stats: Stats; personality: Personality;  weapons: string[]; skills: string[]; companionId?: string;  derived: DerivedStats; contentHash: string;};
Ejemplo de arma definida por datos
{  "id": "weapon_sarten_ionica",  "ruleset": "v1",  "family": "strange",  "baseDamage": 18,  "baseIntervalTicks": 78,  "strengthScaleBp": 9500,  "tags": ["melee", "blunt", "absurd"],  "hooks": [{"event": "first_hit", "effect": "crit_bonus_bp", "value": 600}]}
Fin de la especificacion. Cualquier desviacion debe registrarse como decision de arquitectura o cambio de producto con fecha, responsable, motivo y efecto sobre compatibilidad.
