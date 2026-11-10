# Oficina Virtual IA

Plataforma web donde una empresa tiene su **oficina virtual** con **agentes de IA** organizados por departamentos (Ventas, Atención al cliente, Marketing, Operaciones · CRM, Dirección). Los agentes trabajan con la API de Claude, tienen memoria propia (Supabase + pgvector), envían y reciben correo con Resend y se pagan con créditos.

El contexto completo (arquitectura, modelo de créditos, certificación de agentes, reglas de seguridad y estilo visual) está en **[CLAUDE.md](CLAUDE.md)**. El modelo de negocio, en [`docs/`](docs/).

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Framer Motion · Supabase (PostgreSQL, Auth, Storage, Vault, pgvector) · Claude API · Voyage (embeddings) · Resend.

## Requisitos

- Node.js 22 o superior (los scripts usan `node --env-file` y ejecutan TypeScript directamente).
- Docker en marcha y la [CLI de Supabase](https://supabase.com/docs/guides/local-development).
- Opcional: claves de Anthropic, Voyage y Resend para probar agentes, memoria semántica y correo de verdad.

## Arrancar en local

```bash
npm ci                              # instala dependencias
supabase start                      # Supabase en Docker (API en http://127.0.0.1:55421)
cp .env.example .env.local          # y rellena los valores (ver abajo)
npm run db:reset                    # migraciones + semilla + plantillas de agentes certificadas de prueba
npm run dev                         # http://localhost:3000
```

Para `.env.local`, `supabase status -o env` da la URL y las claves de Supabase local. Cada variable está explicada en [`.env.example`](.env.example) (obligatoria u opcional, servidor o navegador y de dónde sacarla). **Nunca subas `.env.local` ni pongas un secreto en una variable `NEXT_PUBLIC_`.**

Personas de la semilla (solo local): `marcos@hogarmediterraneo.example` (propietario), `ana@hogarmediterraneo.example` (miembro) y `admin@samgple.example` (equipo SAMGPLE, sin acceso a empresas). Contraseñas en `supabase/seed.sql`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Servidor de desarrollo, compilación de producción y servidor de producción. |
| `npm run lint` | ESLint. |
| `npm test` | Pruebas unitarias (`src/lib/*/*.test.ts`). **No necesitan base de datos.** |
| `npm run test:db` | Pruebas SQL (pgTAP) de `supabase/tests/`. Necesita Supabase local. |
| `npm run test:creditos`, `test:traspasos`, `test:simulador`, `test:certificacion`, `test:reglas`, `test:conexiones`, `test:admin`, `test:panel`, `test:ciclo` | Pruebas de integración contra **Supabase local** (leen `.env.local`; se niegan a correr contra otra base). |
| `npm run test:miembros` | Personas, empresas y roles: aislamiento entre empresas con sesiones reales, permisos e invitaciones (**Supabase local**). |
| `npm run test:iniciativa` | Los agentes solo trabajan con un motivo (origen, cadena, filtro de eventos, rutinas, interruptores) contra **Supabase local**. |
| `npm run test:seguridad` | Ataques reales contra la base local y la app: necesita Supabase local **y** `npm run dev` en marcha. |
| `npm run db:reset` | `supabase db reset` + sincroniza plantillas con datos de prueba (solo base local). |
| `npm run plantillas:sync` | Copia las plantillas de agentes de `src/lib/agentes/plantillas/` a la base. |
| `npm run cron -- <tarea\|todas> [--ahora=ISO]` | Ejecuta a mano las tareas periódicas (créditos, rutinas, traspasos…). |
| `npm run prueba:*` | Demostraciones de punta a punta contra la base local (`lucia`, `asistente`, `conocimiento`, `conexiones`, `traspasos`, `simulador`, `certificacion`). |
| `npm run certificacion:cambio-modelo -- --modelo=<id>` | Repite el examen técnico de los agentes activos con otro modelo. |
| `npm run dev:all` | Arranca Supabase y la app juntos. |

## Despliegue

Guía paso a paso: [`docs/despliegue-produccion.md`](docs/despliegue-produccion.md). Resumen: Vercel (app y crons de `vercel.json`) + un proyecto de Supabase en la nube con las migraciones de `supabase/migrations/` (`supabase db push`). La semilla (`supabase/seed.sql`) es **solo para local**: no la cargues en la nube. En Vercel define las variables de `.env.example` marcadas como obligatorias y **ninguna** de las marcadas «SOLO LOCAL».
