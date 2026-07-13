"use client";

import { useEffect, useState } from "react";

function isCurrentlyDark() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // The actual theme can only be known client-side (it depends on the
    // inline script + localStorage), so this one-time sync after mount is
    // intentional rather than a derivable/subscribable value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(isCurrentlyDark());
  }, []);

  function toggle() {
    const next = !isCurrentlyDark();
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
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
      aria-label="Cambiar tema"
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {icon}
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
