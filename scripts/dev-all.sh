#!/usr/bin/env bash
# Arranca Supabase en local (si no está ya arrancado) y después Next.js.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ No encuentro la CLI de Supabase. Instálala con: brew install supabase/tap/supabase" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker no está en marcha. Abre Docker Desktop, espera a que arranque y vuelve a ejecutar npm run dev:all." >&2
  exit 1
fi

if supabase status >/dev/null 2>&1; then
  echo "✓ Supabase ya está arrancado."
else
  echo "→ Arrancando Supabase (la primera vez descarga imágenes y tarda unos minutos)…"
  supabase start
fi

if [ ! -f .env.local ]; then
  echo "! No hay .env.local: copia .env.example y rellénalo (mira 'supabase status -o env'). /estado te dirá qué falta."
fi

exec npx next dev
