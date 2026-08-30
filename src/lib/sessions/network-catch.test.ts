import { describe, expect, it } from "vitest";
import { withNetworkCatch } from "./network-catch";
import type { AddSessionState } from "./actions";

// El contrato del fix P2 (diagnóstico widget→sesión offline): si el POST de la
// server action ni llega (sin red al pulsar Guardar), el rechazo NO debe subir
// al error boundary (desmontaría el form con lo tecleado) — se convierte en
// estado renderizable y la hoja pinta el aviso conservando los datos.
describe("withNetworkCatch", () => {
  const fd = new FormData();

  it("un rechazo (fallo de red) se convierte en { error: 'network' } en vez de propagarse", async () => {
    const action = async (): Promise<AddSessionState> => {
      throw new TypeError("Failed to fetch");
    };
    const wrapped = withNetworkCatch<AddSessionState>(action);
    await expect(wrapped({}, fd)).resolves.toEqual({ error: "network" });
  });

  it("el éxito pasa tal cual (ok/passClosed intactos)", async () => {
    const wrapped = withNetworkCatch<AddSessionState>(async () => ({ ok: true, passClosed: true }));
    await expect(wrapped({}, fd)).resolves.toEqual({ ok: true, passClosed: true });
  });

  it("un error de validación del servidor pasa tal cual (no lo pisa)", async () => {
    const wrapped = withNetworkCatch<AddSessionState>(async () => ({ error: "invalidDuration" }));
    await expect(wrapped({}, fd)).resolves.toEqual({ error: "invalidDuration" });
  });

  it("recibe prev y formData sin alterarlos", async () => {
    let seen: { prev: AddSessionState; formData: FormData } | null = null;
    const wrapped = withNetworkCatch<AddSessionState>(async (prev, formData) => {
      seen = { prev, formData };
      return { ok: true };
    });
    const prev: AddSessionState = { error: "generic" };
    await wrapped(prev, fd);
    expect(seen).toEqual({ prev, formData: fd });
  });
});
