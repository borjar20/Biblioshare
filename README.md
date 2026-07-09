This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Entornos (Supabase)

Hay dos proyectos de Supabase separados:

- **Producción** — lo usa el deploy de Vercel (variables de entorno configuradas en Vercel).
- **Dev (`biblioshare-dev`)** — lo usa el desarrollo local: `.env.local` apunta aquí. Todo lo que hagas con `npm run dev` (búsquedas que cachean catálogo, usuarios de prueba, imports) escribe SOLO en este proyecto.

Para (re)crear el proyecto dev desde cero:

1. Crear un proyecto nuevo en [supabase.com](https://supabase.com) (plan free).
2. Aplicar [`supabase/schema-baseline.sql`](supabase/schema-baseline.sql) en el SQL editor — es el replay ordenado de todas las migraciones de producción. Las migraciones posteriores a la fecha del fichero hay que aplicarlas encima (o regenerar el fichero).
3. Copiar URL y anon key del proyecto a `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Crear el usuario de prueba (`TEST_USER_*` de `.env.example`) vía `/signup` + onboarding.

Regla: las migraciones nuevas se aplican primero en dev, se verifican, y después en producción. Mantener `schema-baseline.sql` como referencia del esquema (regenerable desde `supabase_migrations.schema_migrations`).

## Notes

- Estadísticas: la UI del dashboard de estadísticas se muestra ahora en la página principal del usuario (home). La ruta dedicada `/estadisticas` fue eliminada y las referencias relevantes en la documentación y la navegación han sido actualizadas.
