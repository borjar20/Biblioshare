# Testing manual / con agentes

## Cuenta de desarrollo persistente

En vez de hacer signup + onboarding cada vez que hay que probar algo en el
navegador, usa la cuenta ya creada y con onboarding completo:

- Credenciales en `.env.local`: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_USERNAME`.
- Login directo en `/login` — sin pasos previos.
- **No borrar nunca esta cuenta** como parte de la limpieza de un test. Es
  persistente para todo el proyecto.

### Qué limpiar y qué no, tras probar algo

- Si la prueba añade ítems a la biblioteca de `devtest` (`library_entries`,
  `diary_entries`, filas nuevas en `books`/`movies`/`series`): bórralas por
  SQL al terminar, igual que se hacía con los usuarios de un solo uso.
- Si la prueba requiere un **segundo usuario** (p. ej. verificar cómo ve otro
  visitante un perfil público/privado), crea uno nuevo desechable con el
  patrón habitual (`signup` → username único → probar → borrar el usuario
  completo, incluida la fila de `auth.users`, al terminar). Esos sí se crean
  y destruyen por test.
- Deja `devtest.is_public = true` al terminar (es su estado por defecto);
  si una prueba lo cambia a privado, reviértelo antes de acabar.

## Agentes disponibles

Ver `.claude/agents/`:

- **qa-verifier**: verifica una funcionalidad en el navegador de principio a
  fin (login con `devtest`, ejercitar el flujo, revisar consola/red, limpiar
  datos) y reporta si pasa o no. Úsalo después de implementar algo con UI en
  vez de hacer la verificación a mano en el hilo principal.
- **supabase-schema**: migraciones, RLS, advisors y regeneración de tipos de
  Supabase.
- **backlog-scribe**: mantiene `docs/REQUIREMENTS.md` al día (checklists,
  numeración, log de decisiones) tras cerrar una tarea.

Al ser subagentes independientes, se pueden lanzar en paralelo mientras se
sigue trabajando en el hilo principal (p. ej. verificar la feature A mientras
se implementa la B).
