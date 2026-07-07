import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        Biblioshare
      </Link>
      <ThemeToggle />
    </header>
  );
}
