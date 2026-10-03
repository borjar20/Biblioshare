"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

function isCurrentlyDark() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({
  variant = "icon",
  onToggle,
}: {
  variant?: "icon" | "menu";
  onToggle?: () => void;
}) {
  const t = useTranslations("nav");
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // The inline script selects the initial theme. Keep mounted copies in
    // sync when the mobile menu changes it before the desktop icon reappears.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(isCurrentlyDark());
    const observer = new MutationObserver(() => setIsDark(isCurrentlyDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next = !isCurrentlyDark();
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
    onToggle?.();
  }

  const icon =
    isDark === null ? null : isDark ? (
      <SunIcon className="h-4 w-4" />
    ) : (
      <MoonIcon className="h-4 w-4" />
    );

  return (
    <button
      type="button"
      onClick={toggle}
      role={variant === "menu" ? "menuitem" : undefined}
      aria-label={t("changeTheme")}
      className={variant === "menu"
        ? "flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:hidden"
        : "flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      }
    >
      {icon}
      {variant === "menu" && t("changeTheme")}
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
