// SHA-256 en hex sobre UTF-8, con crypto.subtle: existe en Node 22 y en el
// navegador (contexto seguro: localhost y https). Es async y por eso vive fuera
// del motor: el motor es síncrono y puro; el digest se calcula sobre su salida.

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
