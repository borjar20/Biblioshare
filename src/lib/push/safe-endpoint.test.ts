import { afterEach, describe, expect, it } from "vitest";
import { isPrivateAddress, isSafePushEndpoint } from "./safe-endpoint";

// Issue #678: el endpoint que manda el cliente decide a dónde hace el servidor
// una petición saliente. Estos tests son la red que impide que alguien
// "simplifique" la validación a un `startsWith("https://")`.

describe("isPrivateAddress", () => {
  it("marca los rangos IPv4 que no se alcanzan desde fuera", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "100.64.0.1", // CGNAT
      "169.254.169.254", // metadata de nube: el objetivo clásico de un SSRF
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.7",
      "203.0.113.9",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("deja pasar las públicas, incluidas las vecinas de un rango privado", () => {
    for (const ip of ["8.8.8.8", "142.250.185.10", "172.15.0.1", "172.32.0.1", "100.63.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("IPv6: loopback, ULA, link-local, multicast y IPv4 embebida", () => {
    for (const ip of [
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1", // v4 embebida: se juzga por la parte v4
      "::ffff:169.254.169.254",
      "[::1]",
      "fe80::1%eth0", // con zona
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isSafePushEndpoint", () => {
  it("acepta los endpoints reales de los push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc123:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
      "https://web.push.apple.com/QK2n8s",
      "https://xyz.notify.windows.com/w/?token=abc",
      "https://android.googleapis.com/gcm/send/abc",
    ]) {
      expect(isSafePushEndpoint(url), url).toBe(true);
    }
  });

  it("rechaza destinos internos por nombre", () => {
    for (const url of [
      "https://localhost/x",
      "https://sub.localhost/x",
      "https://db.internal/x",
      "https://printer.local/x",
      "https://supabase/x", // host suelto, sin punto: nombre de red interna
    ]) {
      expect(isSafePushEndpoint(url), url).toBe(false);
    }
  });

  it("rechaza IP literal aunque sea pública", () => {
    // Un push service se identifica por nombre. Aceptar literales obligaría a
    // confiar en cómo `URL` normaliza las formas decimal/octal/hex.
    for (const url of [
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data/",
      "https://8.8.8.8/x",
      "https://[::1]/x",
      "https://2130706433/x", // 127.0.0.1 en decimal
    ]) {
      expect(isSafePushEndpoint(url), url).toBe(false);
    }
  });

  it("rechaza esquema, puerto y credenciales fuera de lo normal", () => {
    for (const url of [
      "http://fcm.googleapis.com/x", // en claro
      "file:///etc/passwd",
      "gopher://fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8080/x", // barrido de puertos internos
      "https://user:pass@fcm.googleapis.com/x",
    ]) {
      expect(isSafePushEndpoint(url), url).toBe(false);
    }
  });

  it("el sufijo se compara por etiqueta, no con endsWith a pelo", () => {
    // Este es el fallo que un `endsWith(host)` ingenuo deja pasar.
    expect(isSafePushEndpoint("https://evilfcm.googleapis.com/x")).toBe(false);
    expect(isSafePushEndpoint("https://fcm.googleapis.com.evil.tld/x")).toBe(false);
    expect(isSafePushEndpoint("https://a.fcm.googleapis.com/x")).toBe(true);
  });

  it("rechaza lo que no es una URL, lo vacío y lo desmedido", () => {
    expect(isSafePushEndpoint(null)).toBe(false);
    expect(isSafePushEndpoint(undefined)).toBe(false);
    expect(isSafePushEndpoint(42)).toBe(false);
    expect(isSafePushEndpoint("")).toBe(false);
    expect(isSafePushEndpoint("no es una url")).toBe(false);
    expect(isSafePushEndpoint(`https://fcm.googleapis.com/${"a".repeat(3000)}`)).toBe(false);
  });

  describe("PUSH_ENDPOINT_EXTRA_HOSTS", () => {
    afterEach(() => {
      delete process.env.PUSH_ENDPOINT_EXTRA_HOSTS;
    });

    it("añade sufijos sin tocar código, y solo por etiqueta", () => {
      expect(isSafePushEndpoint("https://push.example.org/x")).toBe(false);
      process.env.PUSH_ENDPOINT_EXTRA_HOSTS = " push.example.org , otro.test ";
      expect(isSafePushEndpoint("https://push.example.org/x")).toBe(true);
      expect(isSafePushEndpoint("https://a.otro.test/x")).toBe(true);
      expect(isSafePushEndpoint("https://malopush.example.org/x")).toBe(false);
    });

    it("no abre la puerta a destinos internos", () => {
      process.env.PUSH_ENDPOINT_EXTRA_HOSTS = "localhost,internal";
      expect(isSafePushEndpoint("https://localhost/x")).toBe(false);
      expect(isSafePushEndpoint("https://db.internal/x")).toBe(false);
    });
  });
});
