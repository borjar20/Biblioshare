export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface shadow-card p-8">
        {children}
      </div>
    </div>
  );
}
