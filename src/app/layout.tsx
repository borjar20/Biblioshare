import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { Header } from "@/components/header";
import { ThemeScript } from "@/components/theme-script";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Biblioshare",
  description: "Tu biblioteca de libros, películas y series en un solo lugar.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffe9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#2c002b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ServiceWorkerRegister />
        <NextIntlClientProvider>
          <Header />
          <div className="flex flex-1 flex-col">{children}</div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
