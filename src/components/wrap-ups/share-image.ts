// «Compartir» de la story de cierre (Task 16): manda el PNG 9:16 de
// /api/og/wrap-up/<kind> a la hoja de compartir del sistema. Tres caminos, en
// este orden:
//  1. APK (Capacitor): @capacitor/share con el fichero escrito en la caché de la
//     app (@capacitor/filesystem). La APK carga la web remota (server.url de
//     capacitor.config.ts), así que una APK ANTIGUA recibe este JS sin los
//     plugins nativos: por eso se pregunta `isPluginAvailable` y no basta con
//     `isNativePlatform`. El WebView de Android no tiene `navigator.share`.
//  2. Navegador con Web Share de ficheros (`navigator.canShare({ files })`).
//  3. Si no, enlace de descarga (`<a download>`): lo pinta el componente.
// Lógica sin React y con el entorno inyectado para poder probarla.
import type { WrapUpKind } from "@/lib/wrap-ups/windows";

export type ShareResult = "shared" | "cancelled";
export type ShareMode = "native" | "web" | "download";

export type ShareEnv = {
  isNativePlatform: () => boolean;
  isPluginAvailable: (name: string) => boolean;
  navigator: Pick<Navigator, "canShare" | "share"> | undefined;
  fetch: typeof fetch;
  /** Escribe el PNG en la caché de la app y abre la hoja nativa. Solo en la APK. */
  nativeShare: (file: { name: string; base64: string; title: string }) => Promise<void>;
};

export const imageUrl = (kind: WrapUpKind) => `/api/og/wrap-up/${kind}`;
export const imageFileName = (kind: WrapUpKind) => `biblioshare-${kind}.png`;

function canShareFiles(nav: ShareEnv["navigator"]): boolean {
  if (!nav?.canShare || !nav.share) return false;
  try {
    return nav.canShare({ files: [new File([], "probe.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Qué camino toca en este dispositivo; `download` = pintar el enlace en vez del botón. */
export function shareMode(env: ShareEnv): ShareMode {
  if (env.isNativePlatform() && env.isPluginAvailable("Share") && env.isPluginAvailable("Filesystem")) return "native";
  return canShareFiles(env.navigator) ? "web" : "download";
}

async function fetchImage(env: ShareEnv, kind: WrapUpKind): Promise<Blob> {
  const res = await env.fetch(imageUrl(kind), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`wrap_up_image_${res.status}`);
  return res.blob();
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// La hoja del sistema rechaza con AbortError (web) o «Share canceled» (Capacitor)
// cuando el usuario la cierra: no es un fallo y no se avisa de nada.
const isCancel = (e: unknown) =>
  (e instanceof DOMException && e.name === "AbortError") || /cancel/i.test(e instanceof Error ? e.message : String(e));

/** Preparar antes del clic: Web Share exige que la activación siga vigente. */
export async function prepareWrapUpImage(env: ShareEnv, kind: WrapUpKind): Promise<File> {
  return new File([await fetchImage(env, kind)], imageFileName(kind), { type: "image/png" });
}

export async function shareWrapUpImage(env: ShareEnv, kind: WrapUpKind, title: string, file?: File): Promise<ShareResult> {
  const mode = shareMode(env);
  if (mode === "download") throw new Error("share_unavailable");
  const name = imageFileName(kind);
  try {
    if (mode === "native") await env.nativeShare({ name, base64: await toBase64(await fetchImage(env, kind)), title });
    else {
      if (!file) throw new Error("share_image_not_ready");
      await env.navigator!.share({ files: [file], title });
    }
    return "shared";
  } catch (e) {
    if (isCancel(e)) return "cancelled";
    throw e;
  }
}

/** Entorno real (solo en el navegador). Los plugins se importan al usarlos. */
export async function browserShareEnv(): Promise<ShareEnv> {
  const { Capacitor } = await import("@capacitor/core");
  return {
    isNativePlatform: () => Capacitor.isNativePlatform(),
    isPluginAvailable: (n) => Capacitor.isPluginAvailable(n),
    navigator: typeof navigator === "undefined" ? undefined : navigator,
    fetch: (...a) => fetch(...a),
    nativeShare: async ({ name, base64, title }) => {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
      const { uri } = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
      await Share.share({ title, files: [uri] });
    },
  };
}
