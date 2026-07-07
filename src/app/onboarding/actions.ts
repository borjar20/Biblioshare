"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingActionState = {
  error?: "usernameTaken" | "usernameInvalid" | "generic";
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export async function completeOnboarding(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    return { error: "usernameInvalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, username });

  if (error) {
    if (error.code === "23505") {
      return { error: "usernameTaken" };
    }
    return { error: "generic" };
  }

  redirect("/");
}
