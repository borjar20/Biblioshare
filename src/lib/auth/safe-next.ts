// Guarda anti-open-redirect para los `?next=` de auth. Un destino solo vale si
// es una ruta interna: empieza por "/" pero no por "//" (que el navegador trata
// como protocol-relative hacia otro host). Extraída de /auth/confirm, que ya la
// tenía inline; ahora la comparten login y confirm.
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

// Enlace a login que recuerda a dónde volver. Lo usan las páginas gated al
// redirigir al anónimo.
export function loginHref(path: string): string {
  return "/login?next=" + encodeURIComponent(path);
}
