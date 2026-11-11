import { ArrowRight, Ban, Brain, CheckCircle2, Hand, Pencil, UserRound, type LucideIcon } from "lucide-react";
import { Avatar, GlassCard, GlassPanel, departmentMeta } from "@/components/glass";
import { Aparecer } from "@/components/publico/Aparecer";
import { CadenaDemo } from "@/components/publico/CadenaDemo";
import { Seccion } from "@/components/publico/Seccion";
import { departamentosPublicos } from "@/data/publico";
import { CONSUMOS_FIJOS } from "@/lib/creditos/tarifas";

const PERMISOS: { icono: LucideIcon; nombre: string; texto: string }[] = [
  { icono: CheckCircle2, nombre: "Solo", texto: "Lo hace sin preguntar. Para lo que no tiene riesgo, como buscar en el historial." },
  { icono: Hand, nombre: "Con aprobación", texto: "Lo prepara y espera tu sí. Lo normal para escribir a un cliente." },
  { icono: UserRound, nombre: "Pasa a una persona", texto: "No lo intenta: avisa a alguien de tu equipo." },
  { icono: Ban, nombre: "Prohibida", texto: "No puede hacerlo nunca, aunque se lo pidan." },
];

const MEMORIA = [
  "Qué ha preguntado cada contacto y qué se le contestó.",
  "Lo que se acordó, las objeciones y lo que quedó pendiente.",
  "Lo que aprende cada agente al terminar una tarea, con su nivel de confianza.",
];

const ASISTENTE = [
  { titulo: "Cuéntanos tu negocio", texto: "Con tus palabras: qué vendes, a quién y cómo te gusta tratar a tus clientes." },
  { titulo: "Revisa la propuesta", texto: "El asistente propone tono, objetivo, lo que nunca debe hacer, horario, permisos y a quién pasa el trabajo. No guarda nada sin ti." },
  { titulo: "Añade lo que sabe", texto: "Tu web, PDF, documentos o preguntas frecuentes. El asistente te dice qué información falta." },
  { titulo: "Pruébalo en el simulador", texto: "Le escribes como si fueras un cliente y ves qué haría, sin enviar nada a nadie." },
  { titulo: "Certificación de MyOfia", texto: "Examen técnico con datos ficticios y revisión de una persona de nuestro equipo." },
  { titulo: "Actívalo", texto: "Desde ese momento trabaja cuando llega algo o cuando tú se lo pides." },
];

const FICHA = [
  { campo: "Contacto", valor: "Ejemplo: lead de un formulario de Meta" },
  { campo: "Qué quiere", valor: "Información y precio de un tratamiento" },
  { campo: "Cualificación", valor: "Interesado, quiere cita esta semana" },
  { campo: "Próximo paso", valor: "Registrar en el CRM y proponer cita" },
];

/** Secciones de detalle del producto (antes /como-funciona). Contenido de partida para /producto. */
export function SeccionesProducto() {
  return (
    <>
      <Seccion id="departamentos" antetitulo="1 · Departamentos" titulo="Cada departamento, con su equipo de agentes">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departamentosPublicos.map((d, i) => (
            <li key={d.id} className="flex">
              <GlassCard department={d.id} description={d.resumen} delay={i * 0.05} className="w-full">
                <ul className="flex flex-col gap-3">
                  {d.agentes.map((a) => (
                    <li key={a.nombre} className="flex items-start gap-3">
                      <Avatar name={a.nombre} tone={d.id} size={36} />
                      <p className="text-small">
                        <span className="font-semibold">{a.nombre}</span> <span className="text-ink-2">· {a.rol}</span>
                        <span className="block text-ink-2">{a.hace}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-small text-ink-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          Los departamentos y los agentes son gratis. Solo pagas por las tareas que hacen.
        </p>
      </Seccion>

      <Seccion
        id="traspasos"
        antetitulo="2 · Comunicación entre departamentos"
        titulo="El trabajo pasa de un agente a otro, con una ficha clara"
        intro="Cuando un agente termina su parte, pasa una ficha con formato fijo al agente que sigue. Así nadie empieza de cero."
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <Aparecer>
            <GlassPanel as="article" aria-label="Ejemplo de traspaso" className="rounded-card! p-5">
              <div className="flex flex-wrap items-center gap-2 text-small">
                <span className="rounded-pill bg-dept-ventas/50 px-3 py-1">{departmentMeta.ventas.label} · Lucía</span>
                <ArrowRight size={16} aria-hidden="true" /><span className="sr-only">pasa a</span>
                <span className="rounded-pill bg-dept-operaciones/50 px-3 py-1">{departmentMeta.operaciones.label} · Iván</span>
              </div>
              <p className="mt-4 text-tiny text-ink-2">Traspaso de tipo lead · ejemplo</p>
              <dl className="mt-2 divide-y divide-white/10">
                {FICHA.map((f) => (
                  <div key={f.campo} className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-small">
                    <dt className="text-ink-2">{f.campo}</dt>
                    <dd>{f.valor}</dd>
                  </div>
                ))}
              </dl>
            </GlassPanel>
          </Aparecer>
          <Aparecer retraso={0.05}>
            <ul className="flex flex-col gap-3 text-body text-ink-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              <li><span className="font-semibold text-white">Solo a quien tú configuras.</span> Un agente no puede pasar trabajo a cualquiera.</li>
              <li><span className="font-semibold text-white">La ficha se comprueba.</span> Si le faltan datos, no sale y el agente la corrige.</li>
              <li><span className="font-semibold text-white">Las cadenas tienen final.</span> Hay un máximo de pasos y se detectan los bucles.</li>
              <li><span className="font-semibold text-white">Lo ves en directo.</span> En tu oficina aparece cada traspaso y por qué empezó la cadena.</li>
              <li><span className="font-semibold text-white">Cuesta {CONSUMOS_FIJOS.traspaso} crédito por traspaso.</span></li>
            </ul>
          </Aparecer>
        </div>
        <div className="mt-10">
          <CadenaDemo />
        </div>
      </Seccion>

      <Seccion
        id="aprobaciones"
        antetitulo="3 · Aprobaciones"
        titulo="Lo importante espera tu sí"
        intro="Para cada agente decides qué puede hacer y cómo. Un correo a un cliente, un gasto o una publicación pasan por ti."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERMISOS.map(({ icono: Icono, nombre, texto }, i) => (
            <Aparecer as="li" key={nombre} retraso={i * 0.05} className="h-full">
              <GlassPanel className="h-full rounded-card! p-5">
                <Icono size={20} aria-hidden="true" />
                <h3 className="mt-3 text-body font-semibold">{nombre}</h3>
                <p className="mt-1 text-small text-ink-2">{texto}</p>
              </GlassPanel>
            </Aparecer>
          ))}
        </ul>
        <Aparecer className="mt-4">
          <GlassPanel className="flex gap-4 rounded-card! p-5">
            <Pencil size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <p className="text-body text-ink-2">
              <span className="font-semibold text-white">Corrige y enseña.</span> Puedes editar lo que propone un agente antes de aprobarlo. Si marcas «Recordar
              para la próxima», la corrección se convierte en una regla para ese agente.
            </p>
          </GlassPanel>
        </Aparecer>
      </Seccion>

      <Seccion
        id="memoria"
        antetitulo="4 · Memoria compartida"
        titulo="Todos los agentes saben lo que ya pasó"
        intro="Antes de responder, el agente consulta la memoria de tu oficina. Así no vuelve a preguntar lo que el cliente ya contó."
      >
        <Aparecer>
          <GlassPanel className="grid gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr]">
            <Brain size={32} aria-hidden="true" className="text-dept-operaciones" />
            <div>
              <ul className="flex flex-col gap-2 text-body">
                {MEMORIA.map((m) => (
                  <li key={m} className="flex gap-2">
                    <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-status-working" /> {m}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-small text-ink-2">
                Los datos sensibles (salud, banca, documentos de identidad, contraseñas) no se guardan. Puedes corregir cualquier recuerdo y borrar todo lo
                que sabemos de un contacto.
              </p>
            </div>
          </GlassPanel>
        </Aparecer>
      </Seccion>

      <Seccion
        id="configurar"
        antetitulo="5 · Configurar un agente"
        titulo="«Cuéntanos tu negocio» y el asistente hace el resto"
        intro="No hace falta saber de IA. El asistente convierte lo que cuentas en una configuración que tú revisas."
      >
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASISTENTE.map((p, i) => (
            <Aparecer as="li" key={p.titulo} retraso={i * 0.04} className="h-full">
              <GlassPanel className="h-full rounded-card! p-5">
                <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-accent text-small font-semibold">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-body font-semibold">{p.titulo}</h3>
                <p className="mt-1 text-small text-ink-2">{p.texto}</p>
              </GlassPanel>
            </Aparecer>
          ))}
        </ol>
      </Seccion>

    </>
  );
}
