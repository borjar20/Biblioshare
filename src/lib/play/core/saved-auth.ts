"use client";

import type { createClient } from "@/lib/supabase/client";
import { readSavedSession, startSavedSession, type SavedSession } from "./db";

type Client = Pick<ReturnType<typeof createClient>, "auth">;
export type SavedAuthContext = { identity: string; sessionId: string };

// El JWT sólo vive en RAM. Su session_id distingue login de refresh para
// cancelar trabajo; NUNCA acredita al usuario ni concede acceso a sus filas.
function sessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const parsed: unknown = JSON.parse(atob(payload));
    if (typeof parsed !== "object" || parsed === null || !("session_id" in parsed)) return null;
    const id = parsed.session_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function isSavedAuthCurrent(client: Client, context: SavedAuthContext): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getSession();
    return !error && data.session?.user.id === context.identity &&
      sessionId(data.session.access_token) === context.sessionId;
  } catch {
    return false;
  }
}

export async function verifiedSavedAuth(client: Client): Promise<SavedAuthContext | null> {
  try {
    const { data, error } = await client.auth.getSession();
    const captured = data.session;
    if (error || !captured) return null;
    const id = sessionId(captured.access_token);
    if (!id) return null;
    // La identidad procede del servidor. Validar el token capturado también
    // evita emparejar el uid de una sesión nueva con el id de una anterior.
    const { data: verified, error: authError } = await client.auth.getUser(captured.access_token);
    if (authError || !verified.user) return null;
    const context = { identity: verified.user.id, sessionId: id };
    return await isSavedAuthCurrent(client, context) ? context : null;
  } catch {
    return null;
  }
}

// Una sesión nueva puede guardar desde una URL directa sin haber montado el
// historial ni ejecutado un pull. Sólo el intento de guardar con contexto
// cerrado necesita validar Auth; nunca se hace una consulta global por card.
export async function savedSessionForWrite(identity: string): Promise<SavedSession | null> {
  const current = await readSavedSession(identity);
  if (current || identity === "anon") return current;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const context = await verifiedSavedAuth(createClient());
    return context?.identity === identity ? startSavedSession(identity, context.sessionId) : null;
  } catch {
    return null;
  }
}
