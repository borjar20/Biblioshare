// Validación de la ruta de una notificación (spec item 8). El `path` de un push
// termina en una navegación (SW en web, window.location en el WebView Android):
// una ruta no validada es un vector de open-redirect / esquemas peligrosos.
//
// Pura y sin dependencias: la usan el servidor (al construir el evento) y el
// cliente nativo (antes de navegar). Regla: SOLO rutas internas absolutas.
//
//   Se acepta:  "/club/x", "/u/ada?tab=community"
//   Se rechaza: "//evil.com" (protocol-relative), "http://…", "javascript:…",
//               "foo" (relativa, sin barra), "" , y cualquier cosa con salto de
//               línea o carácter de control.

// Un carácter de control (0x00–0x1F, o DEL 0x7F) en la ruta es un truco clásico
// para esquivar validadores ingenuos (p. ej. un "\n" que parte la URL). Se
// comprueba por código en vez de con regex para no meter bytes invisibles en el
// fuente.
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  // Debe empezar por una sola barra: descarta "//host" (protocol-relative) y
  // los esquemas "http:", "javascript:", "mailto:"… (no empiezan por "/").
  if (path[0] !== "/" || path[1] === "/") return false;
  // Backslash: algunos navegadores tratan "\" como "/", así que "/\evil.com"
  // podría colar como protocol-relative. Se rechaza.
  if (path.includes("\\")) return false;
  if (hasControlChar(path)) return false;
  return true;
}

// Devuelve la ruta si es segura, o un fallback (home) si no. Para el punto de
// entrega, donde siempre queremos navegar a ALGO válido en vez de abortar.
export function safeInternalPath(path: unknown, fallback = "/"): string {
  return isSafeInternalPath(path) ? path : fallback;
}
