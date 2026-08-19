// Validación del DESTINO de un push web (issue #678). Hermana de safe-path.ts:
// aquella valida la ruta a la que navega la notificación; esta valida la URL a
// la que el SERVIDOR hace la petición saliente.
//
// El problema: `registerWebDevice` guardaba el `endpoint` que manda el cliente
// sin mirar a dónde apunta, y más tarde el dispatcher hace un POST contra él con
// `webpush.sendNotification`. Un usuario autenticado elegía el destino de una
// petición saliente del servidor — SSRF ciego. «Ciego» porque la respuesta no se
// le devuelve, pero sirve igual para sondear la red interna por tiempos/errores
// y para golpear endpoints internos que actúan con solo recibir el POST.
//
// Tres capas, porque ninguna basta sola:
//
//  1. `isSafePushEndpoint` — pura y síncrona. Esquema, forma y host. Se aplica
//     AL REGISTRAR y OTRA VEZ AL ENVIAR: lo segundo no es paranoia, es lo que
//     deja inertes las filas que ya estén guardadas de antes de este arreglo.
//  2. `resolvesToPublicHost` — resuelve el DNS al registrar y rechaza si alguna
//     dirección cae en rango privado/reservado. Cierra el «host público que
//     resuelve a 127.0.0.1».
//  3. `safePushAgent()` (en transports.ts) — un `https.Agent` con `lookup`
//     propio que vuelve a comprobar la IP EN EL MOMENTO DE CONECTAR. Es la única
//     capa que para el DNS-rebinding: entre el registro y el envío pasan horas y
//     el dueño del dominio puede cambiar el registro A cuando quiera.
//
// Sobre la allowlist: los endpoints de push web los emite el navegador, no la
// página, así que el conjunto de hosts posibles es corto y conocido. Un host
// fuera de la lista no es «raro», es «no viene de un navegador». Se registra con
// un mensaje propio para que un navegador legítimo que no esté en la lista se
// diagnostique en un vistazo en vez de perder push en silencio, y
// PUSH_ENDPOINT_EXTRA_HOSTS deja añadir sufijos sin tocar código.

import { lookup as dnsLookup } from "node:dns/promises";

// Sufijos de host de los servicios de push reales. Se compara por sufijo de
// etiqueta (`===` o termina en `.` + sufijo) — nunca `endsWith` a pelo, que
// aceptaría `evilfcm.googleapis.com`.
const KNOWN_PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge, Brave, Opera y demás Chromium
  "android.googleapis.com", // Chromium antiguo (GCM)
  "push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari / iOS
  "notify.windows.com", // Edge sobre WNS
];

const MAX_ENDPOINT_LENGTH = 2048;

function extraHosts(): string[] {
  return (process.env.PUSH_ENDPOINT_EXTRA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function matchesHostSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

// ── Rangos que NO se pueden alcanzar desde fuera ────────────────────────────
// La lista incluye reservados y documentación además de los privados: no son
// destinos legítimos de un push service, y sirven de sonda igual de bien.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const [a, b] = parts.map((p) => Number(p));
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a === 0) return true; // 0.0.0.0/8 "este host"
  if (a === 10) return true; // 10/8 privada
  if (a === 127) return true; // 127/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (metadata cloud)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 privada
  if (a === 192 && b === 168) return true; // 192.168/16 privada
  if (a === 192 && b === 0) return true; // 192.0.0/24 y 192.0.2/24 reservadas
  if (a === 192 && b === 88) return true; // 192.88.99/24 relé 6to4
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a === 198 && b === 51) return true; // 198.51.100/24 documentación
  if (a === 203 && b === 0) return true; // 203.0.113/24 documentación
  if (a >= 224) return true; // 224/4 multicast + 240/4 reservada + broadcast
  return false;
}

function isPrivateIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (ip === "::" || ip === "::1") return true;
  // IPv4 embebida (::ffff:127.0.0.1, ::ffff:7f00:1 y NAT64 64:ff9b::/96): se
  // juzga por la parte v4, que es a donde acaba yendo el paquete.
  const v4 = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4 && (ip.startsWith("::ffff:") || ip.startsWith("64:ff9b:") || ip.startsWith("::"))) {
    return isPrivateIPv4(v4[1]);
  }
  const head = ip.split(":")[0];
  if (/^f[cd]/.test(head)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10 link-local
  if (/^ff/.test(head)) return true; // ff00::/8 multicast
  if (ip.startsWith("2001:db8:")) return true; // documentación
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

// ── Capa 1: forma y host ────────────────────────────────────────────────────
// Devuelve `boolean`, NO un type predicate `endpoint is string`: con el
// predicate, TypeScript estrecha la rama negativa a `never` cuando el argumento
// ya es `string`, y entonces el propio `console.error` del rechazo deja de
// compilar. El estrechamiento no aporta nada aquí (los llamadores ya tienen un
// string) y sí quita el mensaje de diagnóstico, que es lo que importa.
export function isSafePushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string") return false;
  if (endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  // HTTPS y nada más: `http:` viaja en claro y los demás esquemas
  // (`file:`, `gopher:`, `data:`…) no son destinos de un push service.
  if (url.protocol !== "https:") return false;
  // Credenciales embebidas: solo sirven para confundir a un parser intermedio.
  if (url.username || url.password) return false;
  // Puerto no estándar: un push service real escucha en 443. Un puerto suelto es
  // la forma de barrer servicios internos.
  if (url.port !== "" && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  if (host.length === 0) return false;
  // IP literal: aunque sea pública, un push service se identifica por nombre.
  // Rechazarlas de plano evita además tener que confiar en el parseo de formas
  // raras (decimal, octal, hex) que `URL` normaliza de maneras sorprendentes.
  if (/^\d+(\.\d+)*$/.test(host) || host.startsWith("[") || host.includes(":")) return false;
  // Nombres que resuelven dentro de la máquina o de la red local.
  if (host === "localhost" || matchesHostSuffix(host, "localhost")) return false;
  if (matchesHostSuffix(host, "local") || matchesHostSuffix(host, "internal")) return false;
  if (!host.includes(".")) return false; // host suelto = nombre de red interna

  const allowed = [...KNOWN_PUSH_HOSTS, ...extraHosts()];
  return allowed.some((suffix) => matchesHostSuffix(host, suffix));
}

// ── Capa 2: a dónde resuelve HOY ────────────────────────────────────────────
// Se usa al REGISTRAR. Si el DNS no resuelve, se rechaza: no se guarda un
// destino que no se ha podido comprobar. Nunca lanza.
export async function resolvesToPublicHost(endpoint: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return false;
  }
  try {
    const addresses = await dnsLookup(host, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}
