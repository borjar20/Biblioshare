import { registerPlugin } from "@capacitor/core";

// Adaptador del plugin local NativeAuth (Kotlin) — arquitectura híbrida, Fase 1.
// SOLO se carga por import dinámico desde android-widget-sync.tsx cuando la
// plataforma es Android (mismo patrón que push/android.ts y android-widgets.ts):
// nunca entra en el bundle web ni corre en SSR.
//
// Da al lado nativo una sesión Supabase propia e independiente de la del
// WebView, para que los widgets y las tareas en segundo plano (fases 2+) lean
// de Supabase con la app cerrada, sin depender de que la WebView esté viva.

export interface NativeAuthPlugin {
  establishSession(options: {
    url: string;
    anonKey: string;
    tokenHash: string;
  }): Promise<NativeAuthStatus>;
  signOut(): Promise<void>;
  status(): Promise<NativeAuthStatus>;
}

export type NativeAuthStatus = { authenticated: boolean; userId: string | null };

const NativeAuth = registerPlugin<NativeAuthPlugin>("NativeAuth");

// Públicas (inlinadas en build): son las mismas que ya viajan en el bundle del
// WebView. Se pasan al nativo en cada establish para que no cablee config propia.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Pide un token_hash al servidor (con la sesión de cookies) y lo verifica en nativo. */
async function mintTokenHash(): Promise<string | null> {
  const res = await fetch("/api/native/session", { method: "POST" });
  if (!res.ok) return null;
  const data: unknown = await res.json();
  const tokenHash = (data as { tokenHash?: unknown })?.tokenHash;
  return typeof tokenHash === "string" ? tokenHash : null;
}

/** Siembra una sesión nativa nueva. Devuelve si quedó autenticada. */
export async function establishNativeSession(): Promise<boolean> {
  const tokenHash = await mintTokenHash();
  if (!tokenHash) return false;
  const status = await NativeAuth.establishSession({
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    tokenHash,
  });
  return status.authenticated;
}

/** Arranque de la app: solo siembra si el nativo no tiene ya sesión viva. */
export async function ensureNativeSession(): Promise<void> {
  const status = await NativeAuth.status();
  if (!status.authenticated) await establishNativeSession();
}

/** Cierre de sesión: revoca y olvida la sesión nativa. */
export async function teardownNativeSession(): Promise<void> {
  await NativeAuth.signOut();
}
