"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  loadMyPostPreferences,
  updateMyPostPreferences,
} from "@/lib/social/post-preference-actions";
import {
  DEFAULT_POST_PREFERENCES,
  type PostPreferences as Prefs,
} from "@/lib/social/post-preferences";

// UI de autopublicación de hitos (Spec 2, §8): tres interruptores que escriben
// post_preferences. Espeja NotificationPreferences (carga async + toggle
// optimista con revert). Vive en la hoja de ajustes del perfil, bajo las
// preferencias de notificación. Sin esta pantalla, `autopost_started`/`_dropped`
// nunca podían activarse (la tabla se leía pero nadie la escribía).
//
// Orden: terminar primero (default ON, el caso común: incluye "marcar película
// vista", que es un pase completado → hito finished).
const KEYS = ["autopost_finished", "autopost_started", "autopost_dropped"] as const;

export function PostPreferences() {
  const t = useTranslations("social");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_POST_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void loadMyPostPreferences().then((p) => {
      if (active) {
        setPrefs(p);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function toggle(key: (typeof KEYS)[number]) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimista
    startTransition(async () => {
      try {
        await updateMyPostPreferences({ [key]: next[key] });
      } catch {
        setPrefs(prefs); // revertir si falla
      }
    });
  }

  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="label-section mb-1">{t("postPrefs.label")}</legend>
      <p className="mb-1 text-[12px] text-muted-foreground">{t("postPrefs.hint")}</p>
      <div className="flex flex-col gap-2">
        {KEYS.map((key) => {
          const on = prefs[key];
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{t(`postPrefs.${key}`)}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t(`postPrefs.${key}`)}
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
          );
        })}
      </div>
    </fieldset>
  );
}
