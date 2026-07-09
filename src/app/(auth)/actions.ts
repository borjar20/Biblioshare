"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: "invalidCredentials" | "emailInUse" | "weakPassword" | "generic";
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

export async function signup(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "emailInUse" };
    }
    if (error.code === "weak_password") {
      return { error: "weakPassword" };
    }
    return { error: "generic" };
  }

  // If email confirmation is required, there is no session yet.
  if (!data.session) {
    return { checkEmail: true };
  }

  redirect("/onboarding");
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
