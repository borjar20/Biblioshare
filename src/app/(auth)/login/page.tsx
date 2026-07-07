import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión — Biblioshare",
};

export default function LoginPage() {
  return <LoginForm />;
}
