# Checklist manual — Marca Biblioshare

Aplica los dos documentos de marca del handoff (`Idea de marca`, `Marca en
producto`): el logo de la estantería, el wordmark, el icono de app y la
bienvenida de login/registro. **Y mueve la elección de @usuario al registro.**

## Preparación

`npm run dev`. Para el punto 3 necesitas **cerrar sesión**.

## 1. El logo: la estantería

Tres lomos de distinta altura en los colores de tipo de medio — **libro**
(ámbar), **película** (teal), **serie** (ciruela). Dice "aquí cabe todo" sin
palabras, y reutiliza el mismo color que organiza toda la interfaz.

- [ ] Aparece en el **header** (móvil) y en la **nav lateral** (`sm+`), junto al
      wordmark **Biblio**+**share** (con "share" en terracota, en Fraunces).
- [ ] En la **landing** (sin sesión) preside la pantalla, en grande.
- [ ] **Ya no está el brillito** (`SparklesIcon`) que decoraba la landing: la
      marca pide "cero adornos, el carácter lo ponen la serif y el color".
- [ ] El tagline es **"Tu biblioteca de todo, compartida."** y el botón,
      **"Empieza tu estantería"**.
- [ ] Los tres lomos se distinguen en claro **y** en oscuro.

## 2. Icono de app

- [ ] Visita `/icon` y `/icon-192`: debe verse la **estantería sobre terracota**,
      no la "B" de antes.
- [ ] Los lomos se leen bien sobre el fondo terracota. (Ojo: usan versiones
      **aclaradas** de los colores de tipo — con los normales, el lomo de libro
      casi desaparecía sobre el terracota.)
- [ ] Instala la PWA y comprueba el icono en la pantalla de inicio.

## 3. Login y registro

Cierra sesión primero.

- [ ] **`/login`**: la marca preside la tarjeta. El título es **"Bienvenido de
      vuelta"** (en Fraunces) con el subtítulo "Tus libros, películas y series te
      esperan."
- [ ] **`/signup`**: título **"Empieza tu estantería"** + "Colecciona, puntúa y
      comparte con tu gente."

## 4. El @usuario, ahora en el registro (lo importante)

Antes: te registrabas y **luego** te mandaba a `/onboarding` a elegir usuario.
Ahora se elige en el mismo formulario.

- [ ] El registro tiene tres campos: **correo, usuario y contraseña**. El de
      usuario lleva un `@` delante y va en monoespaciada.
- [ ] Escribe un usuario **que ya exista** (p. ej. `devtest`): a los ~400 ms debe
      salir **"No disponible"** en rojo y el botón **Crear cuenta se bloquea**.
- [ ] Escribe uno libre: sale **"Disponible"** en verde y el botón se habilita.
- [ ] Escribe algo inválido (mayúsculas, guiones, menos de 3 letras): sale el
      aviso de formato.
- [ ] **Regístrate de verdad** con una cuenta desechable: debe llevarte
      directamente al **feed**, **sin pasar por `/onboarding`**, y tu perfil
      `/u/tu-usuario` debe existir ya.
- [ ] Borra esa cuenta al terminar (usuario completo, incluida `auth.users`).

### El caso raro que conviene entender

Si tu Supabase tiene **confirmación de email activada**, el registro no crea
sesión, y sin sesión la RLS **no deja crear el perfil**. Por eso el @usuario
viaja en `user_metadata` y el perfil se crea al volver del enlace del correo.
`/onboarding` sigue existiendo pero **ya no pregunta nada**: crea el perfil y te
manda al feed. Solo enseña el formulario en dos casos:

- [ ] Cuentas **anteriores** a este flujo (sin usuario en el metadata).
- [ ] Si alguien te **quitó el nombre** mientras confirmabas el correo — ahí sale
      un aviso explicándolo y te pide otro.

## Verificación automática ya hecha

- `npm run build` pasa. **`npx playwright test`: 4/4**.
- Hay un **e2e nuevo y permanente** (`e2e/signup.spec.ts`) que hace el registro
  completo con una cuenta desechable, comprueba que aterriza en el feed sin
  onboarding y que el perfil existe — y **borra la cuenta al terminar**.
- Verificado con capturas que la disponibilidad en vivo consulta la base real:
  un usuario existente sale "No disponible" y bloquea el botón.
