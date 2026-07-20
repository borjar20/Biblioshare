// Lógica decidible del asistente de onboarding (spec 2026-07-20, §3 y §6).
// Pura: sin BD y sin React, para que se pueda probar entera con vitest.

export type OnboardingStep = 1 | 2 | 3 | "fin";

// Umbrales de D2: por debajo de esto el paso 3 saldría casi vacío, y una
// pantalla vacía en el onboarding es peor que no tener el paso. Exportados para
// poder subirlos cuando haya masa social, sin tocar la lógica.
export const PEOPLE_MIN_PROFILES = 3;
export const PEOPLE_MIN_CLUBS = 1;

export function showsPeopleStep(counts: {
  profiles: number;
  clubs: number;
}): boolean {
  return (
    counts.profiles >= PEOPLE_MIN_PROFILES || counts.clubs >= PEOPLE_MIN_CLUBS
  );
}

export function totalSteps(showsPeople: boolean): number {
  return showsPeople ? 3 : 2;
}

/** `?paso=` a un paso válido. Nunca lanza ni provoca 404 (spec §6). */
export function normalizeStep(
  raw: string | undefined,
  showsPeople: boolean,
): OnboardingStep {
  if (raw === "fin") return "fin";
  // Pedir el paso 3 cuando está omitido no es un error del usuario: se le manda
  // al final, que es donde habría acabado.
  if (raw === "3") return showsPeople ? 3 : "fin";
  if (raw === "2") return 2;
  return 1;
}

export function nextStep(
  current: OnboardingStep,
  showsPeople: boolean,
): OnboardingStep {
  if (current === "fin") return "fin";
  if (current === 1) return 2;
  if (current === 2) return showsPeople ? 3 : "fin";
  return "fin";
}
