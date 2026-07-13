# Checklist manual — Rediseño Paper, Fase 3 (las novedades)

Última fase. Ni colores (fase 1) ni rutas (fase 2): esto añade **pantallas y
estados que no existían**.

## Preparación

1. `npm run dev`, login con `devtest`.
2. **Importante**: pon al menos **un ítem "en curso"** en tu biblioteca antes de
   empezar (abre un libro/serie → Registro → estado "En curso"). Varios de los
   puntos de abajo no se pueden ver sin eso.

## 1. Colección › General — "Continuar" y "Resumen"

En `/coleccion`, pestaña **General**:

- [ ] Arriba del todo aparece **Continuar**: tarjetas de los ítems que tienes
      en curso, con portada, título en serif, autor en cursiva, **barra de
      progreso** y el **borde del color de su tipo** (terracota libros, verde
      azulado películas, ciruela series).
- [ ] Debajo, el bloque **Resumen**: el total en cifra grande serif, una **barra
      apilada** con la proporción por estado, la leyenda con el recuento de cada
      estado, y las **píldoras por tipo** (Libros · N, Películas · N, Series · N).
- [ ] **Aplica un filtro** (por ejemplo pincha el estado "Terminado"): Continuar
      y Resumen **desaparecen**. Es intencional — contradirían lo que la rejilla
      está enseñando. Quita el filtro y vuelven.
- [ ] Si no tienes nada en curso, la tira **Continuar no aparece** (no debe salir
      una sección vacía).

## 2. Estados vacíos y de error

Los seis siguen el mismo patrón: glifo en caja, título en Fraunces, mensaje
tenue y una acción. Míralos en claro y en oscuro.

- [ ] **Feed vacío**: una cuenta que no sigue a nadie ve "Tu feed está tranquilo"
      con botón "Descubrir usuarios" y enlace "Explorar clubes".
- [ ] **Colección vacía**: cuenta sin ítems → "Tu colección está vacía" + botón a
      Buscar. Compruébalo también en el perfil de alguien sin biblioteca (ahí no
      hay botón, solo el mensaje).
- [ ] **Búsqueda sin resultados**: busca algo inexistente (p. ej. `zzzqqqxx`) →
      "Nada coincide". Si eres colaborador+, el botón lleva al **alta manual**.
- [ ] **Perfil privado**: mira el perfil de una cuenta privada que no sigas.
      Ahora está **centrado**: avatar grande, nombre en serif, @usuario en mono,
      píldora con candado y el botón "Solicitar seguir" debajo.
- [ ] **Error de carga**: **antes no había ningún error boundary** — un fallo
      mostraba la pantalla de error cruda de Next. Ahora sale "No se pudo cargar"
      con botón Reintentar. Para forzarlo, corta la red y navega a una ruta que
      pida datos.
- [ ] **Sin conexión (PWA)**: en modo offline, `/offline` usa el mismo patrón con
      su glifo propio.

## 3. Notificaciones

- [ ] El desplegable de la campana muestra las **no leídas con un punto de
      acento** a la derecha (esto es nuevo).
- [ ] Los timestamps ("hace 3 h") están en **Geist Mono**.
- [ ] Al **abrir** la campana, el contador se pone a cero (marca todo como
      leído). Ya funcionaba; comprueba que no se rompió.
- [ ] El **toggle de notificaciones push** sigue al pie del desplegable.
- [ ] Sin notificaciones, sale el estado vacío con la campana.

## 4. Repaso general (regresión)

- [ ] Ficha de título, Clubes y la rejilla de episodios: nada se ha roto. Esta
      fase no los tocaba más allá de la piel que ya venía de la fase 1.
- [ ] La nav, el perfil y las colas siguen funcionando (fase 2).

## Verificación automática ya hecha

- `npm run build` pasa (typecheck + lint).
- `npx playwright test`: **3/3 pasan**.
- Comprobado con sesión real, conduciendo el navegador: el **Resumen se
  renderiza** en `/coleccion`, **se oculta al aplicar un filtro**, y la
  **búsqueda sin resultados muestra el EmptyState** con su título serif.
- ⚠️ `npm run test` (vitest) sigue sin arrancar: Node v20.9.0 < 20.12. Previo al
  rediseño y ajeno a esta fase, pero significa que el proyecto lleva tiempo sin
  tests unitarios corriendo — merece un arreglo aparte.
