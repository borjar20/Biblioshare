import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";

// Bienvenida con la marca: la estantería + el wordmark presiden login, registro
// y recuperación (handoff "Marca en producto").
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Link href="/">
        <Wordmark size="lg" />
      </Link>

      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-card">
        {children}
      </div>
    </div>
  );
}
