import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Semilla de la sesión NATIVA (arquitectura híbrida, Fase 1). El WebView está
// autenticado por cookies; aquí, con esa sesión, se emite un `token_hash` de
// magic-link para el PROPIO usuario y se devuelve al WebView, que lo pasa al
// plugin NativeAuth. Verificarlo en el lado nativo crea una sesión Supabase
// NUEVA e independiente (su propia cadena de refresh) — por eso NO se comparte
// el refresh token del WebView: dos clientes rotando la misma cadena disparan
// la detección de reúso y revocan la familia entera (logout mutuo). Ver
// docs/requirements/decisiones.md (2026-08-06, arquitectura híbrida).
//
// El email SIEMPRE se deriva de la sesión, nunca del body: un usuario solo
// puede sembrar una sesión nativa para sí mismo. generateLink únicamente
// genera el hash (no envía correo).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return NextResponse.json({ error: "generateLink failed" }, { status: 500 });
  }

  return NextResponse.json({ tokenHash });
}
