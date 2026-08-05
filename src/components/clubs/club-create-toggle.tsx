"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClubForm } from "@/components/clubs/club-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

// El botón "+ Crear" y el formulario comparten el estado `creating`, así que van
// en la MISMA isla de cliente (con el PageHeader): el resto de /clubes ya es
// servidor (#438). Al crear, `createClub` ya revalida la ruta en el servidor;
// aquí basta con `router.refresh()` para traer la lista nueva y cerrar el
// formulario, en vez del prepend optimista que hacía la página cuando era
// cliente entera.
export function ClubCreateToggle({
  userId,
  title,
  createLabel,
}: {
  userId: string;
  title: string;
  createLabel: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title={title}
        action={
          <Button
            type="button"
            className="px-3.5 py-1.5 text-xs"
            onClick={() => setCreating((v) => !v)}
          >
            + {createLabel}
          </Button>
        }
      />

      {creating && (
        <ClubForm
          userId={userId}
          mode="create"
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  );
}
