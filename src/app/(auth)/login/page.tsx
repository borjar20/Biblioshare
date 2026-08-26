import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión — Biblioshare",
};

// El `?next=` de retorno es lo único dinámico: baja tras el <Suspense> (#476)
// para que login tenga shell estático (el marco lo pone el layout de (auth)).
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginNext searchParams={searchParams} />
    </Suspense>
  );
}

// Fantasma del formulario: dos campos + botón, dentro de la tarjeta del layout.
function LoginFormSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

async function LoginNext({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? ""} />;
}
