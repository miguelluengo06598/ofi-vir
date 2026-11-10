"use client";

import { useInView } from "framer-motion";
import { Mail, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePreferencias } from "@/components/marketing/preferencias";
import type { SectorPublico } from "@/content/sectores";

/**
 * Réplica inerte de un canal: las frases se escriben al entrar en pantalla, sin hacer llamadas ni enviar
 * mensajes. El texto completo queda disponible para lectores de pantalla fuera de la animación visual.
 */
type Conversacion = SectorPublico["conversacion"];

export function ConversacionSector({ conversacion }: { conversacion: Conversacion }) {
  const raiz = useRef<HTMLDivElement>(null);
  const visible = useInView(raiz, { once: true, margin: "0px 0px -15% 0px" });
  const { reducido } = usePreferencias();
  const [terminados, setTerminados] = useState(0);
  const [letras, setLetras] = useState(0);
  const iniciado = useRef(false);

  useEffect(() => {
    if (!visible || iniciado.current || reducido) return;
    iniciado.current = true;
    let mensaje = 0;
    let letra = 0;
    let espera: ReturnType<typeof setTimeout>;
    const escribir = () => {
      const actual = conversacion.mensajes[mensaje];
      if (!actual) return;
      letra += 1;
      setLetras(letra);
      if (letra >= actual.texto.length) {
        setTerminados(mensaje + 1);
        mensaje += 1;
        letra = 0;
        espera = setTimeout(escribir, 480);
      } else {
        espera = setTimeout(escribir, 18);
      }
    };
    espera = setTimeout(escribir, 260);
    return () => clearTimeout(espera);
  }, [conversacion.mensajes, reducido, visible]);

  const Icono = conversacion.canal === "WhatsApp" ? MessageCircle : Mail;
  const mensajesVisibles = reducido ? conversacion.mensajes.length : terminados;
  return (
    <div ref={raiz}>
      <div className="sr-only">
        <p>Ejemplo ficticio de conversación por {conversacion.canal}.</p>
        {conversacion.mensajes.map((mensaje) => <p key={mensaje.nombre + "-" + mensaje.texto}>{mensaje.nombre}: {mensaje.texto}</p>)}
      </div>
      <div aria-hidden="true" className="overflow-hidden rounded-card bg-black/35 ring-1 ring-white/15">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/10"><Icono size={17} /></span>
          <span><span className="block text-small font-semibold">{conversacion.canal}</span><span className="block text-tiny text-ink-2">{conversacion.asunto ?? "Conversación de ejemplo"}</span></span>
        </header>
        <div className="flex min-h-80 flex-col justify-end gap-3 p-4 sm:p-6">
          {conversacion.mensajes.map((mensaje, indice) => {
            const completa = indice < mensajesVisibles;
            const activa = indice === mensajesVisibles && !reducido;
            if (!completa && !activa) return null;
            const texto = completa || reducido ? mensaje.texto : mensaje.texto.slice(0, letras);
            return (
              <div key={mensaje.nombre + "-" + indice} className={"max-w-[88%] rounded-card px-4 py-3 text-small leading-relaxed " + (mensaje.de === "agente" ? "self-end bg-white text-black" : "self-start bg-white/10 text-white ring-1 ring-white/12")}>
                <span className={"mb-1 block text-tiny " + (mensaje.de === "agente" ? "text-black/55" : "text-ink-2")}>{mensaje.nombre}</span>
                {texto}{activa && <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-current align-text-bottom" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
