"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { configurarPrimerAdmin, type EstadoConfiguracion } from "@/app/(acceso)/configuracion-inicial/acciones";
import { GlassPanel } from "@/components/glass";

const inicio: EstadoConfiguracion = {};

function Campo({ name, label, type = "text", autoComplete, minLength, ayuda }: {
  name: string; label: string; type?: string; autoComplete?: string; minLength?: number; ayuda?: string;
}) {
  return (
    <label className="grid gap-1.5 text-small text-ink-2">
      <span>{label}</span>
      <input
        required name={name} type={type} autoComplete={autoComplete} minLength={minLength}
        className="glass rounded-card px-3 py-3 text-white outline-none ring-white/0 transition focus:ring-2 focus:ring-white/50"
      />
      {ayuda && <span className="text-tiny text-ink-3">{ayuda}</span>}
    </label>
  );
}

/** Alta del primer administrador general. Solo se muestra mientras no exista ninguno. */
export function ConfiguracionInicialForm({ claveConfigurada }: { claveConfigurada: boolean }) {
  const [estado, accion, pendiente] = useActionState(configurarPrimerAdmin, inicio);
  return (
    <GlassPanel as="section" strong className="w-full max-w-md p-6 shadow-2xl sm:p-8">
      <div className="mb-6 grid gap-2">
        <span className="flex size-10 items-center justify-center rounded-full bg-white/15"><ShieldCheck size={20} aria-hidden="true" /></span>
        <h1 className="text-xl font-semibold">Configuración inicial</h1>
        <p className="text-small text-ink-2">
          Crea la cuenta del administrador general de MyOfia. Solo se puede hacer una vez: en cuanto la crees, esta página deja de existir.
        </p>
      </div>
      {!claveConfigurada ? (
        <p role="alert" className="rounded-card bg-red-500/15 px-3 py-2 text-small text-red-100">
          Falta la clave de instalación. Define <code>CONFIGURACION_INICIAL_CLAVE</code> (mínimo 24 caracteres) en las variables de entorno del
          servidor y vuelve a desplegar.
        </p>
      ) : (
        <form action={accion} className="grid gap-4">
          {estado.error && <p role="alert" className="rounded-card bg-red-500/15 px-3 py-2 text-small text-red-100">{estado.error}</p>}
          <Campo name="clave" label="Clave de instalación" type="password" autoComplete="off" ayuda="La que pusiste en CONFIGURACION_INICIAL_CLAVE." />
          <Campo name="nombre" label="Tu nombre" autoComplete="name" />
          <Campo name="email" label="Correo electrónico" type="email" autoComplete="email" />
          <Campo name="password" label="Contraseña (mínimo 12 caracteres)" type="password" autoComplete="new-password" minLength={12} />
          <Campo name="confirmacion" label="Repite la contraseña" type="password" autoComplete="new-password" minLength={12} />
          <button
            type="submit" disabled={pendiente}
            className="glass-interactive flex w-full items-center justify-center gap-2 rounded-pill bg-white px-4 py-3 text-small font-semibold text-black disabled:cursor-wait disabled:opacity-60"
          >
            {pendiente ? "Creando la cuenta…" : "Crear administrador"} <ArrowRight size={16} aria-hidden="true" />
          </button>
          <p className="text-tiny text-ink-3">Después te pediremos configurar la verificación en dos pasos (una app como Google Authenticator), obligatoria para entrar al panel.</p>
        </form>
      )}
    </GlassPanel>
  );
}
