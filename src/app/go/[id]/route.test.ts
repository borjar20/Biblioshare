import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createPublicClient: vi.fn(() => ({ from })),
  createClient: vi.fn(),
}));

import { createClient, createPublicClient } from "@/lib/supabase/server";
import { GET } from "./route";

const ID = "5d1f5a2e-9c3b-4e7a-8f10-2a6b3c4d5e6f";

function call(id: string) {
  return GET(new Request(`http://x/go/${id}`), { params: Promise.resolve({ id }) });
}

// notFound() no devuelve una Response: lanza un error con digest
// «NEXT_HTTP_ERROR_FALLBACK;404» que Next convierte en la página 404.
async function statusOf(p: Promise<Response>): Promise<number> {
  try {
    return (await p).status;
  } catch (e) {
    const digest = String((e as { digest?: string }).digest ?? "");
    if (digest.includes("404")) return 404;
    throw e;
  }
}

describe("GET /go/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("404 sin consultar cuando el id no es un uuid", async () => {
    expect(await statusOf(call("marta"))).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });

  it("404 cuando ningún perfil tiene ese id", async () => {
    expect(await statusOf(call(ID))).toBe(404);
    expect(from).toHaveBeenCalledWith("profile_identities");
    expect(eq).toHaveBeenCalledWith("user_id", ID);
  });

  it("307 a /u/<username> cuando el perfil existe", async () => {
    maybeSingle.mockResolvedValue({ data: { username: "marta" }, error: null });
    const res = await call(ID);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/u/marta");
  });

  it("acepta el uuid en mayúsculas", async () => {
    maybeSingle.mockResolvedValue({ data: { username: "marta" }, error: null });
    expect((await call(ID.toUpperCase())).status).toBe(307);
  });

  it("usa el cliente sin sesión, nunca el de la petición (regla #437)", async () => {
    maybeSingle.mockResolvedValue({ data: { username: "marta" }, error: null });
    await call(ID);
    expect(createPublicClient).toHaveBeenCalledTimes(1);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("propaga el error de la consulta", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(call(ID)).rejects.toThrow("boom");
  });
});
