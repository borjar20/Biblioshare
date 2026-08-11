import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Crear cuenta — Biblioshare",
};

export default function SignupPage() {
  return <SignupForm />;
}
