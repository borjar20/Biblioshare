export const PET_SECTIONS = ["camp", "character", "bag", "diary", "burrow", "adventure", "training"] as const;
export type PetSection = (typeof PET_SECTIONS)[number];

export function petSection(value: string | null): PetSection {
  return PET_SECTIONS.includes(value as PetSection) ? value as PetSection : "camp";
}

export function isPetRoute(path: string): boolean {
  return path === "/mascota" || path.startsWith("/mascota/");
}

/** Navigation preference only. Never accept an external or action/auth destination. */
export function safePetReturn(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]|%2f|%5c|%0[ad]/i.test(value)) return "/";
  try {
    const parsed = new URL(value, "https://biblioshare.invalid");
    const path = decodeURIComponent(parsed.pathname);
    if (parsed.origin !== "https://biblioshare.invalid" || isPetRoute(path) || /^\/(api|auth|login|signup|logout|onboarding|recuperar)(\/|$)/.test(path)) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return "/"; }
}

export const petReturnKey = (userId: string) => `pet-game:return:${userId}`;
export const petViewKey = (userId: string) => `pet-game:view:${userId}`;
