"use client";

import { motion } from "framer-motion";
import {
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleCheck,
  ClipboardCheck,
  Mail,
  MessageCircle,
  PlugZap,
  Send,
  ShieldCheck,
  Store,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { GlassPanel, PillButton } from "@/components/glass";
import { SeccionFija, VideoProducto } from "@/components/marketing";
import { tipo } from "@/components/marketing/tipografia";
import { video } from "@/config/videos";

const ENTRADA = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -14 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } as const;

const PASOS = [
  {
    titulo: "Solicita acceso y te montamos la oficina",
    texto: "Empezamos contigo, no con una pantalla vacía. Abrimos la oficina, ordenamos los departamentos y preparamos el primer agente.",
  },
  {
    titulo: "Cuéntanos tu negocio con tus palabras",
    texto: "Dinos qué vendes, a quién atiendes y cómo quieres que te representen. El asistente propone la configuración y tú la revisas.",
  },
  {
    titulo: "Conecta tus herramientas con un clic",
    texto: "CRM, WhatsApp, correo y Meta. Solo conectamos lo que el agente necesita para hacer su trabajo y tú decides sus permisos.",
  },
  {
    titulo: "Pruébalo sin que salga nada real",
    texto: "Escríbele como si fueras un cliente. El simulador te enseña qué respondería, qué usaría y qué te pediría aprobar; no manda ni guarda nada.",
  },
  {
    titulo: "SAMGPLE lo certifica",
    texto: "Antes de tocar datos reales, el agente pasa casos ficticios y una revisión de nuestro equipo. Solo entonces queda listo para activarse.",
  },
  {
    titulo: "Actívalo y aprueba lo importante",
    texto: "El agente empieza a trabajar dentro de las reglas que aprobaste. Los mensajes, gastos y decisiones importantes siguen esperando tu sí.",
  },
] as const;

type Negocio = {
  id: "clinica" | "estudio" | "tienda";
  nombre: string;
  etiqueta: string;
  icono: typeof Building2;
  mensaje: string;
  ficha: { agente: string; departamento: string; objetivo: string; tono: string; noHace: string; conexiones: string[]; pasaA: string };
};

const NEGOCIOS: Negocio[] = [
  {
    id: "clinica",
    nombre: "Clínica Sol",
    etiqueta: "Clínica dental",
    icono: Building2,
    mensaje: "Somos una clínica dental. Queremos responder rápido los WhatsApp, orientar sin dar diagnósticos y proponer cita cuando haya interés.",
    ficha: {
      agente: "Sara · Atención por WhatsApp",
      departamento: "Atención al cliente",
      objetivo: "Resolver dudas iniciales y proponer una cita.",
      tono: "Cercano, tranquilo y claro.",
      noHace: "No da diagnósticos ni confirma tratamientos.",
      conexiones: ["WhatsApp", "CRM", "Calendario"],
      pasaA: "Recepción cuando hace falta ayuda humana.",
    },
  },
  {
    id: "estudio",
    nombre: "Estudio Norte",
    etiqueta: "Arquitectura",
    icono: BriefcaseBusiness,
    mensaje: "Somos un estudio de arquitectura. Nos llegan peticiones de reforma por correo y Meta. Queremos filtrar proyectos, pedir medidas y preparar una primera llamada.",
    ficha: {
      agente: "Lucía · Primer contacto",
      departamento: "Ventas",
      objetivo: "Cualificar reformas y coordinar una llamada.",
      tono: "Profesional, directo y con criterio.",
      noHace: "No presupone precios ni promete plazos.",
      conexiones: ["Correo", "Meta", "CRM"],
      pasaA: "El proyecto cualificado al equipo de arquitectura.",
    },
  },
  {
    id: "tienda",
    nombre: "Casa Lumen",
    etiqueta: "Iluminación",
    icono: Store,
    mensaje: "Vendemos iluminación para hogares y negocios. Queremos que el agente responda dudas de producto, encuentre pedidos y pase incidencias de envío a una persona.",
    ficha: {
      agente: "Nora · Pedidos y producto",
      departamento: "Operaciones · CRM",
      objetivo: "Orientar, localizar pedidos y abrir incidencias.",
      tono: "Ágil, útil y sin rodeos.",
      noHace: "No devuelve dinero ni modifica pedidos.",
      conexiones: ["Correo", "CRM", "WhatsApp"],
      pasaA: "Logística si hay una incidencia de entrega.",
    },
  },
];

function NumeroPaso({ indice }: { indice: number }) {
  return (
    <motion.span
      key={indice}
      {...ENTRADA}
      aria-hidden="true"
      className={`${tipo.cifra} block text-white/30`}
    >
      {String(indice + 1).padStart(2, "0")}
    </motion.span>
  );
}

function VistaPaso({ activo }: { activo: number }) {
  const certificacion = video("certificacion");
  if (activo === 4) {
    return (
      <div className="h-full overflow-hidden rounded-card">
        <VideoProducto
          poster={certificacion.posterWebp}
          webm={certificacion.webm}
          mp4={certificacion.mp4}
          ancho={certificacion.ancho}
          alto={certificacion.alto}
          descripcion={certificacion.descripcion}
          className="h-full rounded-card!"
        >
          <span className="absolute top-3 left-3 rounded-pill bg-black/60 px-2.5 py-1 text-tiny ring-1 ring-white/20">Vídeo de certificación · provisional</span>
        </VideoProducto>
      </div>
    );
  }

  const contenido = [
    <div key="oficina"><OfficeRow icon={Building2} titulo="Oficina lista" texto="Ventas · Atención · CRM" /><OfficeRow icon={Bot} titulo="Primer agente" texto="Preparado contigo" /></div>,
    <div key="asistente"><ChatBubble etiqueta="Tú" texto="Te cuento cómo atendemos a nuestros clientes…" /><OfficeRow icon={ClipboardCheck} titulo="Ficha propuesta" texto="Objetivo · tono · límites" /></div>,
    <div key="conexiones" className="grid grid-cols-2 gap-3"><Conexion nombre="CRM" icono={Workflow} /><Conexion nombre="WhatsApp" icono={MessageCircle} /><Conexion nombre="Correo" icono={Mail} /><Conexion nombre="Meta" icono={Send} /></div>,
    <div key="simulador"><ChatBubble etiqueta="Cliente ficticio" texto="¿Tenéis cita esta semana?" /><OfficeRow icon={ShieldCheck} titulo="Simulación segura" texto="0 mensajes enviados" /></div>,
    null,
    <div key="activar"><OfficeRow icon={CircleCheck} titulo="Agente activo" texto="Dentro de tus reglas" activo /><OfficeRow icon={UserRoundCheck} titulo="Aprobación" texto="Tú decides lo importante" /></div>,
  ][activo];

  return (
    <motion.div key={activo} {...ENTRADA} className="flex h-full flex-col justify-center gap-4 rounded-card bg-black/25 p-5 ring-1 ring-white/12">
      {contenido}
    </motion.div>
  );
}

function OfficeRow({ icon: Icon, titulo, texto, activo }: { icon: typeof Building2; titulo: string; texto: string; activo?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-white/8 p-3">
      <span className={`flex size-10 items-center justify-center rounded-full ${activo ? "bg-status-working/25 text-status-working" : "bg-white/10 text-white"}`}><Icon size={18} aria-hidden="true" /></span>
      <span className="min-w-0"><span className="block text-small font-semibold">{titulo}</span><span className="block text-tiny text-ink-2">{texto}</span></span>
      {activo && <span className="ml-auto size-2 rounded-full bg-status-working" aria-label="Trabajando" />}
    </div>
  );
}

function ChatBubble({ etiqueta, texto }: { etiqueta: string; texto: string }) {
  return <div className="rounded-card bg-white/10 p-3 text-small"><span className="mb-1 block text-tiny text-ink-2">{etiqueta}</span>{texto}</div>;
}

function Conexion({ nombre, icono: Icon }: { nombre: string; icono: typeof Workflow }) {
  return <div className="flex flex-col gap-2 rounded-card bg-white/8 p-3 text-small"><Icon size={17} aria-hidden="true" className="text-accent" /><span>{nombre}</span><span className="flex items-center gap-1 text-tiny text-status-working"><Check size={12} aria-hidden="true" /> Conectado</span></div>;
}

export function PasosComoEmpezar() {
  return (
    <section id="pasos" aria-labelledby="pasos-titulo" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-14 sm:py-20">
      <div className="mb-8 max-w-2xl">
        <p className={tipo.antetitulo}>Tu recorrido</p>
        <h2 id="pasos-titulo" className={`mt-2 text-balance ${tipo.subtitular}`}>Seis pasos, siempre contigo</h2>
        <p className={`mt-3 ${tipo.entradilla}`}>De la primera conversación a un agente útil, con espacio para revisar cada decisión.</p>
      </div>
      <SeccionFija
        etiqueta="Pasos para poner en marcha tu primer agente"
        pasos={PASOS.map((paso, indice) => ({
          ...paso,
          texto: <><NumeroPaso indice={indice} /><p className="mt-3">{paso.texto}</p></>,
        }))}
        altoVisual="clamp(18rem, 40vh, 27rem)"
        vhPorPaso={76}
        visualFijo={(activo) => <VistaPaso activo={activo < 0 ? 0 : activo} />}
      />
    </section>
  );
}

export function DemoAsistenteNegocio() {
  const [seleccion, setSeleccion] = useState<Negocio["id"]>("clinica");
  const negocio = NEGOCIOS.find((item) => item.id === seleccion)!;
  return (
    <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
      <div>
        <p className="text-small text-ink-2">Elige un negocio de ejemplo</p>
        <div className="mt-3 grid gap-2" role="group" aria-label="Negocios de ejemplo">
          {NEGOCIOS.map((item) => {
            const Icono = item.icono;
            const activa = seleccion === item.id;
            return (
              <button key={item.id} type="button" onClick={() => setSeleccion(item.id)} aria-pressed={activa} className={`flex items-center gap-3 rounded-card p-3 text-left ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-white ${activa ? "bg-white/16 ring-white/35" : "bg-black/20 ring-white/10 hover:bg-white/10"}`}>
                <span className="flex size-9 items-center justify-center rounded-full bg-white/10"><Icono size={17} aria-hidden="true" /></span>
                <span><span className="block text-small font-semibold">{item.nombre}</span><span className="block text-tiny text-ink-2">{item.etiqueta}</span></span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-tiny text-ink-3">Demostración con datos preparados. No se envía a ninguna IA.</p>
      </div>

      <GlassPanel className="overflow-hidden rounded-card! p-0">
        <div className="border-b border-white/12 px-5 py-4"><p className="text-small font-semibold">Cuéntanos tu negocio</p><p className="text-tiny text-ink-2">Propuesta preparada para revisar</p></div>
        <div className="grid gap-5 p-5 md:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-card bg-black/25 p-4">
            <p className="text-tiny text-ink-2">Así se lo contarías al asistente</p>
            <motion.p key={negocio.id} {...ENTRADA} className="mt-3 text-small leading-relaxed">{negocio.mensaje}</motion.p>
          </div>
          <motion.div key={`${negocio.id}-ficha`} {...ENTRADA} className="rounded-card bg-white/7 p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-tiny text-ink-2">Ficha propuesta</p><span className="flex items-center gap-1 text-tiny text-status-working"><BadgeCheck size={14} aria-hidden="true" /> Lista para revisar</span></div>
            <dl className="mt-3 divide-y divide-white/10 text-small">
              <Ficha campo="Agente" valor={negocio.ficha.agente} />
              <Ficha campo="Departamento" valor={negocio.ficha.departamento} />
              <Ficha campo="Objetivo" valor={negocio.ficha.objetivo} />
              <Ficha campo="Tono" valor={negocio.ficha.tono} />
              <Ficha campo="Nunca hace" valor={negocio.ficha.noHace} />
              <Ficha campo="Pasa a" valor={negocio.ficha.pasaA} />
            </dl>
            <div className="mt-4"><p className="text-tiny text-ink-2">Conexiones que propondría</p><div className="mt-2 flex flex-wrap gap-2">{negocio.ficha.conexiones.map((conexion) => <span key={conexion} className="rounded-pill bg-white/10 px-2.5 py-1 text-tiny">{conexion}</span>)}</div></div>
          </motion.div>
        </div>
      </GlassPanel>
    </div>
  );
}

function Ficha({ campo, valor }: { campo: string; valor: string }) {
  return <div className="grid gap-1 py-2.5 sm:grid-cols-[6.5rem_1fr] sm:gap-3"><dt className="text-ink-2">{campo}</dt><dd>{valor}</dd></div>;
}

export function LoQueHacemos() {
  const servicios = [
    { icono: Workflow, titulo: "Implantación", texto: "Ponemos en orden la oficina, el primer flujo y sus conexiones para que empieces con algo que sirve." },
    { icono: Building2, titulo: "Departamentos", texto: "Diseñamos qué parte hace Ventas, Atención, Marketing, Operaciones · CRM y Dirección." },
    { icono: Bot, titulo: "Agentes a medida", texto: "Configuramos agentes alrededor de tus procesos, lenguaje, límites y personas responsables." },
  ];
  return <ul className="grid gap-4 md:grid-cols-3">{servicios.map(({ icono: Icono, titulo, texto }) => <li key={titulo}><GlassPanel className="h-full rounded-card! p-5"><Icono size={22} aria-hidden="true" className="text-accent" /><h3 className="mt-4 text-body font-semibold">{titulo}</h3><p className="mt-2 text-small leading-relaxed text-ink-2">{texto}</p></GlassPanel></li>)}</ul>;
}
