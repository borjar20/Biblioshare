---
title: Splash overlay (pantalla de carga cold-start)
status: Canónico · verificado 2026-07-29
---

# Splash overlay — diseño

## Objetivo

Dar a la app una pantalla de carga de marca al arrancar, clavando el frame #2
("Splash") del mockup `D:\Proyectos\Personal\Mockups\Biblioshare - Marca en
producto.html`: los tres lomos sobre terracota, "Biblioshare" en Fraunces y el
tagline al pie.

## Qué NO es (alcance)

- No es el splash nativo de PWA (manifest `background_color` + apple-touch
  startup images). Se descartó: Android solo centra icono+nombre y no permite
  clavar tipografía ni tagline del mockup. Ver `decisiones.md`.
- No es una ruta navegable `/splash`.
- No incluye el rediseño de login/registro (frames #3/#4). El componente
  `BrandMark` se deja reutilizable para esa cabecera, pero esa pantalla es otra
  feature.

## Arquitectura

### `src/components/brand/brand-mark.tsx` (nuevo)

Marca de los tres lomos en DOM (no Satori — eso ya lo cubre
`src/lib/app-icon.tsx` para los iconos generados). Renderiza tres barras
alineadas abajo.

- Prop `height` (px) que escala anchos/gaps proporcionalmente a las razones del
  mockup: `width = height * 24/120`, `gap = height * 12/120`, alturas de lomo
  `82/120`, `120/120`, `60/120`. Radius `6px 6px 3px 3px` escalado.
- Colores fijos aclarados (los del app-icon, **no** los `--type-*`, que sobre
  terracota no contrastan): libro `#e8b06a`, película `#7fc6c9`, serie
  `#caa2d0`.
- Decorativo: `aria-hidden`.

### `src/components/splash/splash-screen.tsx` (nuevo, cliente)

Overlay a pantalla completa.

- `position: fixed; inset: 0`, fondo `var(--accent)` (terracota, siempre —
  independiente del theme, es marca), z-index por encima de todo (modales
  incluidos).
- Se renderiza en el HTML SSR (un client component también renderiza su markup
  inicial en el servidor), así cubre desde el primer paint: **sin flash** de
  app-antes-de-splash.
- Contenido, columna centrada, gap ~26px:
  - `<BrandMark height={120} />`
  - "Biblioshare" — Fraunces 600, ~34px, `#fff5ef`.
  - Tagline anclado al pie (~44px del borde inferior): Geist Mono 11px,
    uppercase, `letter-spacing: .14em`, `rgba(255,245,239,.7)`. Texto vía
    next-intl (`splash.tagline`).
- `role="status"`, `aria-label` con el tagline.

#### Dismiss

- Estado `visible` (inicial `true`) y `mounted`.
- `useEffect` (corre post-hidratación): arranca timer de **min-visible ~650ms**
  para que la marca se registre; al cumplirse, pasa a fade.
- Fade: transición de `opacity` ~400ms; al terminar (`onTransitionEnd` o timer
  equivalente) deja de renderizar (`return null`) para no bloquear taps.
- `prefers-reduced-motion`: sin fade — oculta directamente tras el min-time.
- Sin dependencia de datos: ligado a hidratación, no a la carga de contenido.

### Integración en `src/app/layout.tsx`

Montar `<SplashScreen />` **dentro** de `NextIntlClientProvider` (para traducir
el tagline) y como hermano por encima de `AppShell`. Al ser `fixed`, se
superpone; el orden en el árbol no afecta más allá del z-index.

## Sesión / repetición

Sin `sessionStorage`: el overlay se muestra en cada carga completa de página
(comportamiento normal de boot-splash). Las navegaciones soft (Next `Link`) no
remontan el layout, así que no lo re-disparan. YAGNI: no se añade lógica de
"solo una vez por sesión".

## i18n

Nueva clave en `messages/es.json`:

```json
"splash": {
  "tagline": "Tu biblioteca de todo, compartida"
}
```

"Biblioshare" es marca, va literal en el componente (no se traduce).

## Testing

- **e2e (Playwright):** al cargar una ruta, el splash es visible; poco después
  desaparece del DOM / deja de ser visible.
- **Unit (Vitest):** `SplashScreen` renderiza la marca y el tagline; `BrandMark`
  escala las tres barras según `height`.
- Verificación por defecto del proyecto: qa-verifier / `npm run test:e2e`.

## Docs a sincronizar al cerrar

- Entrada nueva **al final** de `docs/requirements/decisiones.md`: splash como
  overlay cold-start (y por qué no native PWA startup).
- Sin cambios de esquema → `data-model.md` no se toca.
- Backlog: marcar/añadir el ítem si aplica.
