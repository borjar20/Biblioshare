import { describe, expect, it, vi } from "vitest";
import { prepareWrapUpImage, shareMode, shareWrapUpImage, type ShareEnv } from "./share-image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function env(over: Partial<ShareEnv> & { plugins?: string[]; native?: boolean } = {}): ShareEnv {
  const { plugins = [], native = false, ...rest } = over;
  return {
    isNativePlatform: () => native,
    isPluginAvailable: (n) => plugins.includes(n),
    navigator: undefined,
    fetch: vi.fn(async () => new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch,
    nativeShare: vi.fn(async () => {}),
    ...rest,
  };
}
const webNav = (canShare: boolean, share = vi.fn(async () => {})) => ({ canShare: vi.fn(() => canShare), share });

describe("shareMode", () => {
  it("APK con los plugins → nativo", () => {
    expect(shareMode(env({ native: true, plugins: ["Share", "Filesystem"] }))).toBe("native");
  });
  it("APK antigua sin el plugin (carga la web remota) → no intenta el nativo", () => {
    expect(shareMode(env({ native: true, plugins: ["Filesystem"] }))).toBe("download");
    expect(shareMode(env({ native: true, plugins: [], navigator: webNav(true) }))).toBe("web");
  });
  it("navegador con Web Share de ficheros → web", () => {
    expect(shareMode(env({ navigator: webNav(true) }))).toBe("web");
  });
  it("sin Web Share de ficheros (o sin canShare) → enlace de descarga", () => {
    expect(shareMode(env({ navigator: webNav(false) }))).toBe("download");
    expect(shareMode(env({ navigator: { share: vi.fn() } as never }))).toBe("download");
    expect(shareMode(env())).toBe("download");
  });
});

describe("shareWrapUpImage", () => {
  it("web: llama a share antes de cualquier await para conservar la activación del clic", async () => {
    const share = vi.fn(async () => {});
    const e = env({ navigator: webNav(true, share) });
    const file = new File([PNG], "biblioshare-week.png", { type: "image/png" });
    const result = shareWrapUpImage(e, "week", "Tu semana", file);
    expect(share).toHaveBeenCalledWith({ files: [file], title: "Tu semana" });
    expect(e.fetch).not.toHaveBeenCalled();
    expect(await result).toBe("shared");
  });

  it("web: pide el PNG del kind y lo comparte como fichero", async () => {
    const share = vi.fn(async () => {});
    const e = env({ navigator: webNav(true, share) });
    const file = await prepareWrapUpImage(e, "month");
    expect(await shareWrapUpImage(e, "month", "Tu mes", file)).toBe("shared");
    expect(e.fetch).toHaveBeenCalledWith("/api/og/wrap-up/month", { credentials: "same-origin" });
    const arg = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(arg.title).toBe("Tu mes");
    expect(arg.files?.[0].name).toBe("biblioshare-month.png");
    expect(arg.files?.[0].type).toBe("image/png");
  });

  it("nativo: escribe el PNG en base64 y abre la hoja nativa", async () => {
    const e = env({ native: true, plugins: ["Share", "Filesystem"] });
    expect(await shareWrapUpImage(e, "week", "Tu semana")).toBe("shared");
    expect(e.nativeShare).toHaveBeenCalledWith({ name: "biblioshare-week.png", base64: btoa(String.fromCharCode(...PNG)), title: "Tu semana" });
  });

  it("cerrar la hoja no es un error", async () => {
    const abort = vi.fn(async () => { throw new DOMException("x", "AbortError"); });
    const web = env({ navigator: webNav(true, abort) });
    expect(await shareWrapUpImage(web, "week", "t", await prepareWrapUpImage(web, "week"))).toBe("cancelled");
    const nativeCancel = vi.fn(async () => { throw new Error("Share canceled"); });
    expect(await shareWrapUpImage(env({ native: true, plugins: ["Share", "Filesystem"], nativeShare: nativeCancel }), "week", "t")).toBe("cancelled");
  });

  it("si la imagen no se puede generar, falla (el componente avisa)", async () => {
    const e = env({ navigator: webNav(true), fetch: vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch });
    await expect(prepareWrapUpImage(e, "week")).rejects.toThrow("wrap_up_image_401");
  });

  it("sin ningún camino no hace nada: lo cubre el enlace de descarga", async () => {
    const e = env();
    await expect(shareWrapUpImage(e, "week", "t")).rejects.toThrow("share_unavailable");
    expect(e.fetch).not.toHaveBeenCalled();
  });
});
