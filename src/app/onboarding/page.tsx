import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import type { ItemType } from "@/lib/catalog/types";
import { createProfileFromMetadata } from "../(auth)/actions";
import { Wordmark } from "@/components/ui/wordmark";
import { OnboardingForm } from "./onboarding-form";
import { Stepper } from "./stepper";
import { Welcome } from "./welcome";
import { StepInterests } from "./step-interests";
import { StepTitles } from "./step-titles";
import { StepPeople } from "./step-people";
import {
  nextStep,
  normalizeStep,
  showsPeopleStep,
  totalSteps,
} from "@/lib/onboarding/steps";
import {
  getSocialCounts,
  getSocialSuggestions,
} from "@/lib/onboarding/get-social-suggestions";
import { getSuggestions } from "@/lib/onboarding/get-suggestions";

export const metadata: Metadata = {
  title: "Te damos la bienvenida — Biblioshare",
};

// Asistente de onboarding (spec 2026-07-20). Una sola ruta con ?paso= y UN gate
// (D4). Sin `loading.tsx` a propósito: esta ruta redirige, y un loading.tsx es
// una frontera de Suspense que compromete el 200 (docs/TRAMPAS.md §4).
//
// Ojo con createProfileFromMetadata: antes, al devolver "ok", esta página
// redirigía a "/". Ya NO: un perfil recién creado nace con onboarded_at null,
// que es justo quien debe ver el asistente. El formulario antiguo se conserva
// como red de seguridad para cuentas sin @usuario.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const supabase = await createClient();
  const result = await createProfileFromMetadata(supabase);

  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/onboarding"));

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, interests, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
        <Wordmark size="lg" />
        <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-card">
          <OnboardingForm nameWasTaken={result === "usernameTaken"} />
        </div>
      </div>
    );
  }

  // EL GATE (D5): quien ya lo terminó no vuelve a verlo.
  if (profile.onboarded_at !== null) redirect("/");

  const counts = await getSocialCounts(supabase, user.id);
  const showsPeople = showsPeopleStep(counts);
  const total = totalSteps(showsPeople);

  const params = await searchParams;
  const step = normalizeStep(params.paso, showsPeople);

  // El "siguiente" sale de nextStep, que ya sabe que del 2 se salta al final
  // cuando el paso 3 está omitido. Escribir el href a mano en cada paso
  // duplicaría esa regla en tres sitios y se desincronizaría al tocarla.
  const hrefNext = `/onboarding?paso=${nextStep(step, showsPeople)}`;

  // Cada consulta se hace SOLO en el paso que la necesita.
  const suggestions =
    step === 2
      ? await getSuggestions(supabase, (profile.interests ?? []) as ItemType[])
      : [];
  const social =
    step === 3
      ? await getSocialSuggestions(supabase, user.id)
      : { profiles: [], clubs: [] };
  const addedCount = step === "fin" ? await countPlanned(supabase, user.id) : 0;

  return (
    // Sin Wordmark propio: la topbar ya lo pinta (AppShell oculta la barra de
    // navegación mientras el onboarding esté pendiente, pero la topbar se queda).
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="rounded-card border border-border bg-surface p-6 shadow-card">
        {step === "fin" ? (
          <Welcome
            name={profile.display_name || profile.username}
            addedCount={addedCount}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <Stepper current={step} total={total} skipHref={hrefNext} />
            {step === 1 && <StepInterests nextHref={hrefNext} />}
            {step === 2 && (
              <StepTitles suggestions={suggestions} nextHref={hrefNext} />
            )}
            {step === 3 && (
              <StepPeople
                profiles={social.profiles}
                clubs={social.clubs}
                nextHref={hrefNext}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

async function countPlanned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("passes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "planned");
  return count ?? 0;
}
