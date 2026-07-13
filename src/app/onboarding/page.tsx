import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProfileFromMetadata } from "../(auth)/actions";
import { Wordmark } from "@/components/ui/wordmark";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Elige tu usuario — Biblioshare",
};

// El @usuario se elige ahora en el registro, así que esta pantalla ya casi
// nunca se ve: si el nombre viene en `user_metadata` (el caso normal, tras
// confirmar el email), crea el perfil y sigue de largo.
//
// El formulario queda como red de seguridad: cuentas anteriores a este flujo, o
// el caso raro de que alguien se quedara el nombre entre el registro y la
// confirmación del email.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const result = await createProfileFromMetadata(supabase);

  if (result === "ok") redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Wordmark size="lg" />
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-card">
        <OnboardingForm nameWasTaken={result === "usernameTaken"} />
      </div>
    </div>
  );
}
