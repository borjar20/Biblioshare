"use server";

import { redirect } from "next/navigation";
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
