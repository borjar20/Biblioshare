import { todayISO } from "@/lib/stats/dates";

// Sesiones backdateadas (session_date pasado — el formulario de registro lo
// permite a propósito, "se me olvidó registrar lo de anoche") no tienen una
// hora real que mostrar: se quedan en el nivel de precisión que sí es real,
// el día. Solo una sesión de HOY usa created_at, que es preciso porque nunca
// se edita a mano (a diferencia de session_date).
export function sessionRelativeBasis(
  sessionDate: string,
  createdAt: string,
  today: string = todayISO(),
): string {
  return sessionDate === today ? createdAt : sessionDate;
}
