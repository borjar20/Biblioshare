"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { updateUserRole } from "./actions";
import type { UserRole } from "@/lib/auth/roles";

const ROLES: UserRole[] = ["user", "collaborator", "admin"];

// Cambio de rol en línea. Al cambiar el select, llama al server action y refleja
// el resultado. El propio admin no puede cambiarse su rol aquí (evita quedarse
// sin admins por accidente) — se deshabilita su fila.
export function RoleSelect({
  userId,
  currentRole,
  disabled = false,
}: {
  userId: string;
  currentRole: UserRole;
  disabled?: boolean;
}) {
  const t = useTranslations("admin");
  const [role, setRole] = useState<UserRole>(currentRole);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onChange(next: UserRole) {
    const prev = role;
    setRole(next);
    setError(false);
    startTransition(async () => {
      const result = await updateUserRole(userId, next);
      if (result.error) {
        setRole(prev);
        setError(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        size="sm"
        value={role}
        disabled={disabled || pending}
        onChange={(e) => onChange(e.target.value as UserRole)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`roles.${r}`)}
          </option>
        ))}
      </Select>
      {pending && <span className="text-xs text-muted-foreground">{t("saving")}</span>}
      {error && <span className="text-xs text-status-dropped">{t("error")}</span>}
    </div>
  );
}
