"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  USERNAME_PATTERN,
  isUsernameAvailable,
  normalizeUsername,
} from "@/lib/profile/username";

export type AuthActionState = {
  error?:
    | "invalidCredentials"
    | "emailInUse"
    | "weakPassword"
    | "usernameTaken"
    | "usernameInvalid"
    | "generic";
  checkEmail?: boolean;
};

export async function login(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "invalidCredentials" };
  }

  redirect("/");
}

// El @usuario se elige aquí, en el registro (antes era un paso aparte en
// /onboarding). Con confirmación de email por medio, signUp NO devuelve sesión,
// y sin sesión la RLS no deja insertar el perfil — así que el nombre viaja en
// `user_metadata` y el perfil se crea en cuanto hay sesión: aquí mismo si no
// hay confirmación, o en /onboarding (que ya no pregunta nada) tras confirmar.
export async function signup(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const username = normalizeUsername(String(formData.get("username") ?? ""));

  if (!USERNAME_PATTERN.test(username)) {
    return { error: "usernameInvalid" };
  }

  const supabase = await createClient();

  if (!(await isUsernameAvailable(supabase, username))) {
    return { error: "usernameTaken" };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "emailInUse" };
    }
    if (error.code === "weak_password") {
      return { error: "weakPassword" };
    }
    return { error: "generic" };
  }

  // Sin sesión = hace falta confirmar el email. El perfil se creará al volver.
  if (!data.session) {
    return { checkEmail: true };
  }

  const created = await createProfileFromMetadata(supabase);
  if (created === "usernameTaken") return { error: "usernameTaken" };
  if (created === "generic") return { error: "generic" };

  // Al asistente, no a la home: es la ÚNICA vez que se le ofrece (spec
  // 2026-07-20). El proxy no puede encargarse de traerlo aquí, porque solo
  // fuerza /onboarding a quien no tiene perfil — y a estas alturas ya lo tiene.
  // Quien lo termina o lo salta queda con onboarded_at y no vuelve a verlo.
  redirect("/onboarding");
}

// Crea el perfil del usuario con sesión a partir del @usuario que guardó el
// registro en `user_metadata`. Devuelve "missing" si no hay nombre que usar
// (cuentas anteriores a este flujo) — ahí /onboarding sí pregunta.
export async function createProfileFromMetadata(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<"ok" | "missing" | "usernameTaken" | "generic"> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "generic";

  // Idempotente a propósito: /onboarding llama a esto durante el render (un
  // GET), y ese render puede repetirse — prefetch, doble render en dev. Sin
  // esta comprobación, el segundo intento chocaría con el índice único y
  // diríamos "el nombre está cogido" cuando el nombre es tuyo.
  const { data: existing } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return "ok";

  const username = normalizeUsername(
    String(user.user_metadata?.username ?? "")
  );
  if (!USERNAME_PATTERN.test(username)) return "missing";

  const { error } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, username });

  if (error) {
    // Índice único: alguien se quedó el nombre entre el registro y la
    // confirmación del email. Es la garantía real, no la comprobación previa.
    if (error.code === "23505") return "usernameTaken";
    return "generic";
  }

  return "ok";
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Envía el email de recuperación. Responde siempre "revisa tu correo" (aunque
// el email no exista) para no revelar qué cuentas están registradas.
export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "generic" };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/cuenta/contrasena`,
  });

  return { checkEmail: true };
}

// Cambia la contraseña del usuario con sesión (la sesión normal o la de
// recuperación que crea el enlace del email).
export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.code === "weak_password") return { error: "weakPassword" };
    return { error: "generic" };
  }

  redirect("/");
}
