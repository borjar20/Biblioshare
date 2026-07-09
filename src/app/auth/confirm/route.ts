import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces de email de Supabase Auth (recuperación de
// contraseña hoy; sirve igual para confirmaciones/cambio de email). Soporta
// los dos formatos según la plantilla configurada en el dashboard:
//  - token_hash + type  → plantilla personalizada con {{ .TokenHash }}
//  - code               → plantilla por defecto (PKCE, {{ .ConfirmationURL }})
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // Solo rutas internas: evita usar este endpoint como open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
