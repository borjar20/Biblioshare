import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_PATHS = ["/login", "/signup", "/recuperar"];
const ONBOARDING_PATH = "/onboarding";
// Rutas del flujo de recuperación de contraseña: accesibles con sesión de
// recuperación aunque el usuario no haya completado el onboarding todavía.
const RECOVERY_PATHS = ["/auth/confirm", "/cuenta/contrasena"];

// Cookie que cachea "este usuario ya completó el onboarding", para ahorrar la
// consulta a `profiles` en cada navegación. Guarda el user id (no un simple
// booleano) para que un usuario distinto —o uno sin perfil— no herede el
// "onboarded" de otra sesión: solo se salta la consulta si el id coincide.
const ONBOARDED_COOKIE = "bs_onb";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the auth token if expired; required for Server Components to read a valid session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    if (pathname === ONBOARDING_PATH) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  // Logged in: figure out whether onboarding (username selection) is done.
  // Fast path: la cookie confirma el onboarding de ESTE usuario → sin consulta.
  // Solo se cachea el estado positivo; el "sin perfil" siempre re-consulta,
  // así que completar el onboarding surte efecto en la siguiente navegación.
  // Dos hechos DISTINTOS, y confundirlos rompe el asistente:
  //   hasProfile  — tiene @usuario, o sea puede usar la app.
  //   isOnboarded — completó el asistente (profiles.onboarded_at no es null).
  // Antes bastaba con el primero porque "onboarding" ERA elegir el @usuario.
  // Desde el asistente de 3 pasos (spec 2026-07-20) son cosas separadas: hay
  // usuarios con perfil que aún no lo han hecho, y a esos NO se les puede echar
  // de /onboarding.
  let hasProfile: boolean;
  let isOnboarded: boolean;
  if (request.cookies.get(ONBOARDED_COOKIE)?.value === user.id) {
    hasProfile = true;
    isOnboarded = true;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, onboarded_at")
      .eq("user_id", user.id)
      .maybeSingle();
    hasProfile = profile !== null;
    isOnboarded = profile?.onboarded_at != null;
    // Solo se cachea el estado final. Quien tiene perfil pero no ha terminado
    // el asistente re-consulta en cada navegación: es una ventana corta y es lo
    // que hace que terminar surta efecto de inmediato.
    if (isOnboarded) {
      response.cookies.set(ONBOARDED_COOKIE, user.id, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

  if (
    !hasProfile &&
    pathname !== ONBOARDING_PATH &&
    !RECOVERY_PATHS.includes(pathname)
  ) {
    return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
  }

  // Solo se echa de /onboarding a quien YA lo terminó, no a quien simplemente
  // tiene perfil: el asistente vive precisamente en ese hueco.
  if (isOnboarded && pathname === ONBOARDING_PATH) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (hasProfile && AUTH_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
