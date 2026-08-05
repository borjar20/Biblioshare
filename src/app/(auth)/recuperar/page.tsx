import type { Metadata } from "next";
import { RecoverForm } from "./recover-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Recuperar contraseña — Biblioshare",
};

export default function RecoverPage() {
  return <RecoverForm />;
}
