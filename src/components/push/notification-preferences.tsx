"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { loadMyPreferences, updateMyPreferences } from "@/lib/push/preference-actions";
import { DEFAULT_PREFERENCES, type NotificationPreferences } from "@/lib/push/preferences";

// Preferencias por categoría (spec item 4/12). Vive en la hoja de ajustes, junto
// a las celebraciones. Independiente del permiso push: mutea/activa una categoría
// aunque el push esté apagado (afecta también a la entrega cuando se encienda).
//
// Las categorías (spec; fase 3 añade «pet»). Los canales web/android quedan gobernados por el
// toggle de permiso por dispositivo; exponerlos aquí como mute fino es un
// refinamiento pendiente (issue).
const CATEGORY_KEYS = [
  "category_social",
  "category_clubs",
  "category_progress",
  "category_system",
  "category_pet",
] as const;

const CATEGORY_I18N: Record<(typeof CATEGORY_KEYS)[number], string> = {
  category_social: "categorySocial",
  category_clubs: "categoryClubs",
  category_progress: "categoryProgress",
  category_system: "categorySystem",
  category_pet: "categoryPet",
};

export function NotificationPreferences() {
  const t = useTranslations("push");
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void loadMyPreferences().then((p) => {
      if (active) {
        setPrefs(p);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function toggle(key: (typeof CATEGORY_KEYS)[number]) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimista
    startTransition(async () => {
      try {
        await updateMyPreferences({ [key]: next[key] });
      } catch {
        setPrefs(prefs); // revertir si falla
      }
    });
  }

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
      <legend className="label-section mb-1">{t("categoriesLabel")}</legend>
      <div className="flex flex-col gap-2">
        {CATEGORY_KEYS.map((key) => {
          const on = prefs[key];
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground">{t(CATEGORY_I18N[key])}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t(CATEGORY_I18N[key])}
                  disabled={!loaded}
                  onClick={() => toggle(key)}
                  className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-50 ${
                    on ? "bg-accent" : "bg-surface-muted"
                  }`}
                >
                  <span
                    className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
                      on ? "bg-accent-foreground" : "bg-muted-foreground"
                    } ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
              {key === "category_pet" ? (
                <p className="text-xs text-muted-foreground">{t("categoryPetHint")}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
