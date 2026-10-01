# Contraste del estado de la mascota (#1177)

> **[Evidencia · verificada el 2026-10-01 · diagnóstico inicial refutado]**

La issue atribuía un incumplimiento de 3:1 al marco del texto sobre el fondo
nocturno. Ese requisito se aplica a información visual necesaria para reconocer
controles, sus estados o gráficos necesarios para entender el contenido. La
frontera decorativa de estos bloques de texto no tiene esa función: el estado
normal es un `span` y el aviso es un `p`, sin interacción. Su contenido se expresa
con texto. [W3C, explicación de SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

El requisito pertinente para ese texto pequeño es 4,5:1. Se cumple incluso
componiendo el fondo translúcido sobre blanco, el caso más luminoso posible de
la escena; el degradado oscuro solo mejora el resultado.
[W3C, SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

| Texto | Color del navegador | Fondo del bloque | Límite conservador sobre blanco |
|---|---|---|---|
| Estado normal | `rgb(238,244,218)` | `rgba(8,38,30,0.87)` | 9,5887:1 |
| Causa del aviso | `rgb(244,240,216)` | `rgba(8,38,30,0.933)` | 11,5904:1 |
| Acción del aviso | `rgb(181,207,192)` | `rgba(8,38,30,0.933)` | 8,0116:1 |

Se usa el alfa serializado por el navegador y canales flotantes sin redondear
el fondo compuesto antes de calcular luminancia. La comparación contra 4,5
usa el resultado completo, sin redondeo. Promediar una banda de la lámina sin
componer los fondos no mide este contraste del texto.

## Verificación real

Build de producción `8YE5QAuVCXvO6b0ZCncvv`; cuenta propia local, fondo
nocturno adquirido mediante la RPC y luego elegido. Primero se muestra el
estado normal; después se registra actividad de hace siete días para mostrar
la causa y la acción reales. Cuatro capturas a 390/1440 px, PASS:

- DOM `SPAN`/`P`, sin rol de control, `tabIndex=-1` y cero descendientes interactivos.
- Los tres textos superan 4,5:1 en ambos tamaños; sin desborde ni errores de página.
- Tras la evolución, se espera a que la celebración aparezca y desaparezca
  antes de capturar el aviso. Las capturas iniciales durante esa celebración
  se conservan y no se usan para dictaminar la legibilidad del bloque.
- Se eliminan la cuenta y la película propias; nueve superficies verificadas a cero.

Artefactos ignorados: `.scratch/ticket-campaign/qa1177-local/1790846656963/`
(`result.json`, `server.log` y cuatro PNG). Reproducción:
`node .scratch/ticket-campaign/verify-contrast-1177.mjs` con la instancia local
ya arrancada y el build de producción. Revisión independiente: diagnóstico
refutado; la medición de navegador confirma los dos estados.

El cierre de #1177 debe registrar explícitamente que su diagnóstico era falso.
No se necesita cambiar el panel ni regenerar la escena para cumplir estos
criterios. Esta comprobación concreta no constituye una auditoría WCAG del juego entero.
