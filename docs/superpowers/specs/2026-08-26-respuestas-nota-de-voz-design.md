# Diseño: respuestas por nota de voz en los hilos sociales

- **Fecha**: 2026-08-26
- **Estado**: propuesta, aprobada para plan de implementación
- **Área**: `area:social`
- **Origen**: petición del usuario — permitir responder a un post con una nota de voz además
  del texto, para hacer las conversaciones «más humanas, expresivas y espontáneas, sin
  perjudicar la rapidez con la que se consumen los comentarios». Hipótesis: las notas de voz
  cortas aumentan cercanía y calidad de conversación, especialmente en posts personales o de
  opinión.

## 1. Concepto

Una nota de voz **es un comentario** con otro cuerpo: misma tabla, mismo hilo, mismas
reacciones, mismo reporte y mismos bloqueos. No es una entidad nueva ni una feature aparte.
La voz enriquece el hilo sin cambiar su estructura, y todo el aparato social existente
(RLS, notificaciones, moderación, hilos anidados) se hereda gratis.

**Superficie**: posts de club, reseñas y pensamientos (`posts` con `kind='thought'`).
Fuera: pases/registros automáticos (`started|finished|progressed|watched`) y episodios.
Dentro del hilo, el audio vale **en raíz y en respuestas** — la contención del abuso se hace
con frenos suaves (ver §4), no prohibiendo niveles.

**Sin transcripción en el MVP** (decisión explícita del usuario, coste/alcance). La
transcripción es la primera evolución de fase 2 y el diseño le reserva sitio (§5 y §9).

## 2. Decisiones tomadas

| Decisión | Elegido | Alternativa descartada |
|---|---|---|
| Modelo de datos | 3 columnas nuevas en `comments` | Tabla/entidad propia de audio (duplicaría RLS, reporte, notifs) |
| Patrón de grabación | Grabadora inline en el composer, preview obligatoria | Hold-to-record estilo WhatsApp (publica al soltar: accidentes, sin preview, gesto frágil en web); bottom-sheet dedicado (paso extra, se siente feature aparte) |
| Mic en pantallas pequeñas | Mic visible solo con campo vacío; al teclear lo sustituye «Enviar»; borrar el texto lo recupera | Mic siempre presente (roba espacio al texto) |
| Nivel de hilo | Audio en raíz y respuestas con frenos suaves por usuario | Solo raíz (encorsetado, dijo el usuario) |
| Transcripción | Fase 2 (API cloud barata tipo Groq/Whisper) | En MVP (coste y alcance); Web Speech API (calidad irregular es, solo Chrome) |
| Acceso al archivo | Bucket privado + URL firmada generada en servidor | Bucket público (saltaría bloqueos y privacidad del comentario) |
| Subida | Server action con service-role, valida → sube → inserta | Subida directa desde cliente (Storage no valida JWT ES256 en este proyecto) |
| Waveform | 64 picos calculados en cliente al grabar, guardados en la fila | Procesado en servidor (infra nueva sin necesidad) |
| Reproducción simultánea | Un solo audio a la vez, global | Varios a la vez (caos) |
| Estado «escuchado» | Solo local (localStorage), sin sincronizar | «Visto» notificado al autor (presión social, privacidad) |
| Autoplay | Nunca en MVP | Auto-avance de hilo (fase 2, opt-in) |

## 3. Experiencia de grabación

### Descubrimiento
- Mic en el composer (raíz y respuestas) con campo vacío; al teclear se convierte en «Enviar».
- Tooltip de primera vez, una sola: «Ahora puedes responder con tu voz». Sin onboarding.

### Flujo
1. Tap mic → permiso de micrófono (solo primera vez). Denegado: mensaje inline con enlace a
   ajustes; el mic queda deshabilitado-informativo, no desaparece.
2. El composer se transforma en grabadora inline: punto rojo pulsante, timer ascendente,
   waveform en vivo, pausa, parar, X cancelar. Graba desde el tap, sin pantalla intermedia.
3. Pausa reanudable (segmentos concatenados).
4. A 45s el timer pasa a cuenta atrás ámbar; a 60s corte automático → previsualización
   (no se descarta nada).
5. Parar → **previsualización obligatoria**: waveform estática + play/pause + duración +
   «Regrabar» + «Publicar». Nunca se publica sin pasar por aquí.
6. Regrabar descarta y vuelve a grabar; cancelar descarta. Ambos piden confirmación solo si
   hay >15s grabados.
7. Publicar → comentario optimista en el hilo con waveform atenuada y «Publicando…».

### Errores y conexión
- **Grabación**: 100 % local (`MediaRecorder`); perder red durante la grabación no afecta.
- **Fallo de subida / sin conexión al publicar**: el blob vive en el cliente; el comentario
  optimista pasa a «No se pudo publicar · Reintentar / Descartar». 2 reintentos automáticos
  silenciosos antes de mostrar el error.
- **Permiso revocado a mitad**: se detiene y lo grabado pasa a previsualización.
- **Navegar/cerrar con grabación activa**: aviso («Tienes una nota de voz sin publicar»).

### Wireframes conceptuales (móvil)

```
Reposo (vacío):          Tecleando:
┌──────────────────┐    ┌──────────────────┐
│ Escribe algo… 🎙 │    │ Hola, yo cre…  ➤ │
└──────────────────┘    └──────────────────┘

Grabando:                Previsualización:
┌──────────────────────┐ ┌──────────────────────┐
│ ✕  ●REC ▂▅▃▇▂ 0:12  │ │ ▶ ▂▅▃▇▅▂▃  0:23     │
│      [⏸]  [⏹ Parar] │ │ [Regrabar] [Publicar]│
└──────────────────────┘ └──────────────────────┘
```

## 4. Consumo y jerarquía

### El chip de audio
- Misma tarjeta de comentario (avatar, nombre, fecha, reacciones, menú); el cuerpo es un chip
  de una línea: `[▶] waveform [0:23] [1x]`, altura ≈ 2 líneas de texto. Un audio nunca ocupa
  más pantalla que un comentario medio.
- La waveform es la barra de progreso (se rellena al reproducir; tap = seek).
- Punto de no-escuchado sutil; estado solo en localStorage, jamás notificado al autor.

### Reproductor
- Play/pause en el chip; velocidad cicla 1x → 1.5x → 2x, preferencia recordada (localStorage).
- Un solo audio sonando a la vez: play en otro pausa el anterior.
- La reproducción sobrevive al scroll: si el chip sale del viewport, mini-barra flotante sobre
  el composer (`[▶∥] nombre · 0:41/0:58 [✕]`; tap en el nombre vuelve al comentario).
  Navegar a otra ruta detiene la reproducción (MVP).
- Autoplay: nunca.

### Jerarquía
- El chip vive en las dos superficies existentes con la sangría que cada una ya aplica:
  `ReviewInteractions` (feed, aplanado a 2 niveles) y `PostThread` (árbol con sangría corta
  ~16 px/nivel capada a `MAX_THREAD_DEPTH = 4`, `comment-tree.ts:65`). Sin reglas de nivel
  propias; audio-a-audio no tiene tratamiento visual especial.
- A profundidad 4 el chip pierde ~64 px: la waveform es el elemento flexible (se comprime);
  play, duración y velocidad son fijos. Ancho mínimo útil ~200 px — cabe anidado en 360 px.

### Frenos suaves contra el hilo-todo-audios
1. **Fricción asimétrica**: texto es el default del composer; audio es acción extra.
2. **3 audios por usuario y hilo**: al llegar, mic atenuado con «Ya has dejado 3 notas de voz
   en este hilo — sigue por texto». Texto ilimitado.
3. **No 2 audios consecutivos del mismo autor** en el hilo (por target completo, no por
   rama): si tu último comentario es un audio sin respuesta de nadie, mic atenuado hasta que
   otro intervenga.
4. **Sin límite global por hilo**: los frenos actúan sobre tu comportamiento, nunca castigan
   al hilo por lo que hicieron otros.

### Wireframe (hilo, móvil)

```
┌────────────────────────────────┐
│ ⬤ Marta · hace 2h              │
│ Pues a mí el final me pareció… │
│ ♥ 3 · Responder                │
│   ┌──────────────────────────┐ │
│   │ ⬤ Jorge · hace 1h        │ │
│   │ [▶] ▂▅▇▅▂▃▅ 0:41 [1x] ● │ │
│   │ ♥ 1 · Responder          │ │
│   └──────────────────────────┘ │
│ ⬤ Ana · hace 30min             │
│ [▶] ▂▃▅▂▇▅▂ 0:18 [1.5x]      │
│ ♥ · Responder                  │
└────────────────────────────────┘
   ┌─────────────────────────┐
   │ [∥] Jorge · 0:22/0:41 ✕ │   ← mini-barra si scroll
   └─────────────────────────┘
```

## 5. Transcripción (fase 2, diseño reservado)

- Proveedor: API cloud barata (Groq Whisper u OpenAI Whisper, ~0,006 $/min o menos) desde el
  servidor tras la subida; columna `audio_transcript text null` cuando llegue.
- Presentación: bajo el chip, línea contraída con la primera frase en gris + «Ver
  transcripción»; expandida muestra el texto completo. **Contraída por defecto siempre** — el
  chip manda. El layout del chip del MVP ya deja ese hueco para no re-maquetar.
- Usos: leer sin reproducir, accesibilidad, búsqueda, moderación y resumen de hilos.
- Regla de moderación cuando exista: la transcripción ayuda pero **nunca exonera** — el
  reporte humano se juzga sobre el audio, no sobre su texto (las transcripciones fallan).

## 6. Arquitectura

### Datos
- `comments` + 3 columnas: `audio_path text null`, `audio_duration_ms int null`,
  `audio_peaks smallint[] null`.
- CHECK: cuerpo de texto **o** audio, no ambos ni ninguno (MVP sin audio+caption).
- Herencia total del aparato social: `parent_id`, spoiler, fijado, reacciones,
  notificaciones (llega la normal de «comentó»), RLS de bloqueos, `report_comment`.
- ⚠️ **Grants por columna** (issue #375, dos roturas en prod): las 3 columnas necesitan su
  grant fino + superficie 6 de `docs/DRIFT-CHECK.md`. Migración en dev primero, prod después.

### Storage
- Bucket **privado** `voice-notes`, ruta `<user_id>/<comment_id>.<ext>`.
- Reproducción vía URL firmada generada en servidor al renderizar el hilo (caducidad 1 h):
  el audio respeta bloqueos y privacidad exactamente igual que el comentario que lo contiene.
- Subida: server action con service-role (Storage no valida JWT ES256 en este proyecto).
  Secuencia: validar → subir objeto → insertar fila; si el insert falla, borrar el objeto.
- Borrado de comentario: la fila cae con la cascada existente; el objeto lo borra el mismo
  action de borrado (no hay trigger BD→Storage).

### Cliente
- `MediaRecorder`: `audio/webm;codecs=opus` (Chrome/Android/WebView Capacitor),
  `audio/mp4` AAC (Safari/iOS). El servidor acepta ambos y guarda tal cual, sin transcodificar.
  Ambos reproducen en todos los navegadores actuales.
- Capacitor Android: MediaRecorder funciona en el WebView sin plugin, pero requiere
  `RECORD_AUDIO` en el manifest y la pasarela de permisos del WebView (agente
  capacitor-android en el plan).
- Waveform en vivo y los 64 picos persistidos salen del mismo pipeline
  `AudioContext` + `AnalyserNode`.

## 7. Límites del MVP (validados en server action, no solo en UI)

| Límite | Valor |
|---|---|
| Duración | 2 s – 60 s |
| Tamaño | 2 MB (60 s opus ≈ 200 KB; margen para AAC) |
| Formatos | `audio/webm` (opus), `audio/mp4` (AAC) |
| Por usuario y hilo | 3 audios |
| Consecutivos | No 2 seguidos del mismo autor en el hilo |
| Por usuario y día | 20 audios (freno de spam global) |
| Superficie | Posts de club, reseñas, pensamientos |

La UI atenúa el mic al acercarse al límite; quien lo hace cumplir es el server action
(única vía de escritura del proyecto).

## 8. Moderación y seguridad (MVP sin transcripción)

- **Reportar**: `report_comment` cubre audios sin cambios — mismo menú, mismo flujo.
- **Revisión**: el moderador escucha el audio reportado. Viable solo a la escala actual;
  **límite asumido** — la transcripción se vuelve obligatoria antes de crecer.
- **Bloqueos**: gratis — RLS oculta el comentario y el bucket privado + URL firmada hace el
  archivo inalcanzable.
- **Spam**: límites de §7 + reporte. Sin detección automática en MVP.
- **Privacidad**: sin «visto», borrar comentario borra el archivo, ningún audio accesible por
  URL adivinable.

## 9. MVP cerrado

Dentro: grabadora inline completa (pausa, regrabar, preview, cancelar) en las tres
superficies, raíz y respuestas; chip reproductor (play/pause, seek en waveform, duración,
velocidad, un-solo-audio, mini-barra); reintento offline; límites de §7; reporte y bloqueo
heredados.

Fuera: transcripción, audio+caption, auto-avance, edición de audio, notificación especial,
detección automática de spam.

## 10. Métricas

A la escala actual (3 cuentas reales) esto es observación instrumentada, no estadística;
los eventos se registran para que la señal exista cuando haya usuarios.

| Métrica | Evento | Qué valida |
|---|---|---|
| Adopción creación | `voice_note_published` (+ superficie, duración) | ¿Alguien graba? Objetivo: >10 % de quienes comentan la prueban en 30 días |
| Embudo grabación | `recording_started` vs `published` vs `discarded` | Si se descarta >50 %, la grabadora falla |
| Ratio reproducción | `playback_started` / audios servidos en viewport | <30 % = el chip molesta |
| Escucha completa | `playback_completed` (≥90 %) | Duración/calidad adecuadas |
| Uso de velocidad | taps en 1.5x/2x | Proxy de «consumir audio cuesta»; alimenta prioridad de transcripción |
| Conversación | respuestas por post con/sin audio; profundidad | La hipótesis en sí |
| Canibalización | volumen de comentarios de texto antes/después | ¿El audio suma o sustituye? |
| Abuso | reportes sobre audio / total; usuarios que tocan límites | Calibrar o relajar los frenos |

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Consumir el hilo se vuelve lento (el nº 1) | Cap 60 s, velocidad 2x recordada, chip compacto; transcripción como primera fase 2 si la escucha sufre |
| Hilo-todo-audios | Frenos de §4 |
| Ruido / mala calidad | Preview obligatoria (te escuchas antes de publicar); sin más mitigación barata — asumido |
| Moderación a ciegas | Escucha manual; límite asumido y registrado (§8) |
| Privacidad de la voz | Bucket privado + URL firmada; borrado real; sin «visto» |
| Accesibilidad | **El MVP la empeora** (contenido inaudible sin alternativa); es EL motivo de la fase 2, no un nice-to-have |
| Coste de almacenamiento | ~200 KB/audio; límite diario capa el peor caso |
| iOS Safari | AAC/mp4 soportado; probar en Safari real antes de dar por hecho |

## 12. Evolución (orden propuesto)

1. **Transcripción automática** — desbloquea accesibilidad, moderación, búsqueda. Primera
   sin discusión.
2. Audio + caption de texto en el mismo comentario.
3. Auto-avance opt-in («escuchar hilo»): los audios encadenados como playlist.
4. Reacciones sobre un momento concreto (timestamp en la waveform).
5. Resumen del hilo vía transcripciones (LLM).
6. Traducción/multilingüe — sin sentido con locale único `es`; solo si la app se
   internacionaliza.
7. Respuestas privadas de audio — exige DMs, que no existen; árbol aparte.

## 13. Las 3 decisiones de producto a validar antes de desarrollar

1. **¿La preview obligatoria mata la espontaneidad?** Tensión central seguridad vs. fluidez;
   se mide con el embudo grabación→publicación.
2. **¿Sin transcripción, el audio se escucha o se ignora?** Si el ratio de reproducción es
   bajo, la fase 2 no es mejora sino rescate — y quizá debía estar en el MVP.
3. **¿Los frenos se notan?** Si nadie los toca, sobran (simplificar); si molestan a usuarios
   legítimos, están mal calibrados.
