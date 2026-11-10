"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Database, Gauge, MessageCircle, Sparkles, Target } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { GlassPanel, PillButton, departmentColor } from "@/components/glass";
import {
  Contador,
  DemoEnVivo,
  EscenaScroll,
  LUZ,
  LineaDeLuz,
  Paralaje,
  PreferenciasForzadas,
  RevelarTexto,
  SeccionFija,
  VideoProducto,
  sobreEscena,
  tipo,
  demoDiferida,
  type PasoFijo,
} from "@/components/marketing";

const DemoOficina = demoDiferida(() => import("@/components/publico/DemoOficina"));
import { ReservaDemoOficina } from "@/components/publico/ReservaDemoOficina";
import { CONSUMOS_FIJOS, TIPOS_DE_TAREA } from "@/lib/creditos/tarifas";

/** Ficha explicativa de cada primitiva. */
function Ficha({ nombre, que, reducido, children }: { nombre: string; que: ReactNode; reducido: ReactNode; children?: ReactNode }) {
  return (
    <GlassPanel className="p-5 sm:p-6 [--glass-fill:rgba(16,16,22,0.5)]">
      <p className="font-mono text-small text-[#FFD48A]">&lt;{nombre} /&gt;</p>
      <div className={`mt-2 ${tipo.cuerpo}`}>{que}</div>
      <p className="mt-3 text-small text-ink-2"><span className="font-semibold text-white">Accesible / rendimiento:</span> {reducido}</p>
      {children}
    </GlassPanel>
  );
}

function Bloque({ id, titulo, children, completa }: { id: string; titulo: string; children: ReactNode; completa?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={`mx-auto w-full max-w-6xl scroll-mt-24 px-4 ${completa ? "flex min-h-svh flex-col justify-center py-24" : "py-16 sm:py-20"}`}>
      <h2 id={`${id}-t`} className={`${tipo.subtitular} ${sobreEscena}`}>{titulo}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

const MOMENTO = (p: number) => (p < 0.35 ? "Día" : p < 0.72 ? "Atardecer" : "Noche");

const PASOS: PasoFijo[] = [
  { titulo: "Llega un lead de Meta", texto: "Un formulario de Meta Ads entra en la oficina como evento externo.", visual: <Visual icono={Target} color={departmentColor.marketing} texto="Lead nuevo · Meta Ads" /> },
  { titulo: "Lucía responde en minutos", texto: "Ventas contesta y cualifica. El correo espera tu aprobación.", visual: <Visual icono={MessageCircle} color={departmentColor.ventas} texto="Borrador listo para aprobar" /> },
  { titulo: "Iván lo registra en el CRM", texto: "Operaciones recibe la ficha del traspaso y la guarda sin duplicar.", visual: <Visual icono={Database} color={departmentColor.operaciones} texto="Ficha creada en el CRM" /> },
  { titulo: "Dirección lo ve en el informe", texto: "El lunes, el resumen cuenta de dónde vinieron los leads que compraron.", visual: <Visual icono={Gauge} color={departmentColor.direccion} texto="Informe semanal" /> },
];

function Visual({ icono: Icono, color, texto }: { icono: typeof Target; color: string; texto: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 rounded-card bg-black/25 ring-1 ring-white/10">
      <span className="flex size-20 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${color}, ${color}55)`, boxShadow: `0 0 48px ${color}66` }}>
        <Icono size={34} aria-hidden="true" />
      </span>
      <p className="text-small text-ink-2">{texto}</p>
    </div>
  );
}

export function Laboratorio() {
  const [forzar, setForzar] = useState<{ reducido?: boolean; ahorro?: boolean }>({});
  const [momento, setMomento] = useState("Día");
  const { scrollYProgress } = useScroll();
  useMotionValueEvent(scrollYProgress, "change", (v) => setMomento(MOMENTO(v)));

  // Línea de luz: dos departamentos y el destino que se enciende al llegar.
  const zonaLuz = useRef<HTMLDivElement>(null);
  const origen = useRef<HTMLDivElement>(null);
  const destino = useRef<HTMLDivElement>(null);
  const [disparo, setDisparo] = useState(0);
  const [llegadas, setLlegadas] = useState(0);

  return (
    <PreferenciasForzadas.Provider value={forzar}>
      <EscenaScroll />

      {/* Controles del laboratorio */}
      <div className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
        <GlassPanel strong className="flex flex-wrap items-center justify-center gap-2 rounded-pill! px-3 py-2">
          <span className="px-2 text-tiny text-ink-2" aria-live="polite">Escena: <span className="font-semibold text-white">{forzar.reducido ? "Atardecer (fija)" : momento}</span></span>
          <PillButton compact active={forzar.reducido} onClick={() => setForzar((f) => ({ ...f, reducido: !f.reducido }))}>Movimiento reducido</PillButton>
          <PillButton compact active={forzar.ahorro} onClick={() => setForzar((f) => ({ ...f, ahorro: !f.ahorro }))}>Ahorro de datos</PillButton>
        </GlassPanel>
      </div>

      {/* 1 · Portada a pantalla completa: revelado por palabras */}
      <section aria-labelledby="lab-titulo" className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-6xl flex-col justify-center px-4 py-16">
        <p className={`${tipo.antetitulo} ${sobreEscena}`}>Laboratorio · solo local y pruebas</p>
        <RevelarTexto as="h1" texto="La oficina cobra vida" className={`mt-4 max-w-4xl text-balance ${tipo.display} ${sobreEscena}`} />
        <RevelarTexto
          texto="Baja despacio: la escena pasa de día a atardecer y a noche. Cada bloque enseña una primitiva y cómo se comporta con movimiento reducido o ahorro de datos."
          className={`mt-6 max-w-2xl ${tipo.entradilla} ${sobreEscena}`}
          retraso={0.5}
          escalon={0.015}
        />
      </section>

      <Bloque id="revelar" titulo="Revelar texto">
        <div className="grid gap-6 lg:grid-cols-2">
          <Ficha
            nombre="RevelarTexto"
            que={<>Revela un texto al entrar en pantalla, <strong>por palabras</strong> (titulares cortos) o <strong>por líneas</strong> (frases largas, pasando un array). Cada pieza sube desde detrás de una máscara. Props: <code>texto</code>, <code>por</code>, <code>as</code>, <code>retraso</code>, <code>escalon</code>.</>}
            reducido="Con movimiento reducido es texto normal. Los lectores leen la frase entera una vez (las piezas van ocultas). Solo transform y opacity; el texto ocupa su sitio desde el principio."
          />
          <div className="flex flex-col justify-center gap-6">
            <RevelarTexto as="p" por="lineas" texto={["Una persona con agentes", "rinde como tres.", "Lo importante lo apruebas tú."]} className={`${tipo.titular} ${sobreEscena}`} />
          </div>
        </div>
      </Bloque>

      <Bloque id="tipografia" titulo="Tipografía y paleta">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <GlassPanel className="space-y-4 p-6 sm:p-8">
            <p className={tipo.antetitulo}>Antetítulo · 12 px</p>
            <p className={tipo.display}>Display</p>
            <p className={tipo.titular}>Titular de sección</p>
            <p className={tipo.subtitular}>Subtitular de panel</p>
            <p className={tipo.entradilla}>Entradilla: frases cortas, con aire, que se leen de un vistazo.</p>
            <p className={tipo.cuerpo}>Cuerpo sobre cristal a 16 px con interlineado 1,65. Es el texto de las secciones densas.</p>
          </GlassPanel>
          <GlassPanel className="grid grid-cols-2 gap-3 p-6 sm:p-8">
            {[
              ["Acento", "#4F8CFF"],
              ["Luz", LUZ],
              ["Trabajando", "#34D399"],
              ["Aprobación", "#FBBF24"],
              ["Ventas", departmentColor.ventas],
              ["Atención", departmentColor.atencion],
              ["Marketing", departmentColor.marketing],
              ["Operaciones", departmentColor.operaciones],
            ].map(([n, c]) => (
              <div key={n} className="flex items-center gap-3 text-small">
                <span aria-hidden="true" className="size-8 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: c }} />
                <span>{n}<span className="block font-mono text-tiny text-ink-2">{c}</span></span>
              </div>
            ))}
          </GlassPanel>
        </div>
      </Bloque>

      {/* Pantalla completa: escena */}
      <Bloque id="escena" titulo="Escena ligada al scroll" completa>
        <Ficha
          nombre="EscenaScroll"
          que={<>Fondo fijo con las tres fotos apiladas. Del 0 al 25 % de la página es de día; del 25 al 45 % se funde al atardecer; del 60 al 85 %, a la noche. La foto sube un 6 % mientras bajas (paralaje). Puede recibir otro <code>progreso</code> (por ejemplo, el de una sola sección). Ahora mismo: <strong>{momento}</strong>.</>}
          reducido="Con movimiento reducido: una sola escena fija (atardecer), sin fundidos ni paralaje. Solo cambia la opacidad de capas a pantalla completa: no recalcula el diseño. La primera foto tiene prioridad de carga y las tres se sirven en AVIF/WebP al ancho de la pantalla."
        />
      </Bloque>

      <Bloque id="paralaje" titulo="Paralaje de paneles">
        <div className="grid gap-6 md:grid-cols-3">
          {[60, 0, -60].map((i) => (
            <Paralaje key={i} intensidad={i}>
              <GlassPanel className="flex h-56 flex-col justify-end p-6">
                <p className="font-mono text-small text-[#FFD48A]">intensidad={i}</p>
                <p className="mt-1 text-small text-ink-2">{i > 0 ? "Se queda atrás: parece más lejos." : i < 0 ? "Se adelanta: parece más cerca." : "Sin paralaje, como referencia."}</p>
              </GlassPanel>
            </Paralaje>
          ))}
        </div>
        <div className="mt-6">
          <Ficha
            nombre="Paralaje"
            que={<>Mueve su contenido unos píxeles en vertical según cruza la pantalla. Intensidades pequeñas (20-60 px): el cristal flota, no se marea.</>}
            reducido="Sin movimiento con movimiento reducido. Solo transform: el hueco no cambia y el desenfoque del cristal se mantiene."
          />
        </div>
      </Bloque>

      <Bloque id="luz" titulo="Partícula de luz entre departamentos">
        <div ref={zonaLuz} className="relative grid gap-24 pt-32 pb-10 md:grid-cols-2 md:gap-40">
          <LineaDeLuz contenedor={zonaLuz} desde={origen} hasta={destino} disparo={disparo} cadaMs={5000} colorDesde={departmentColor.ventas} colorHasta={departmentColor.operaciones} alLlegar={() => setLlegadas((n) => n + 1)} />
          <div ref={origen}>
            <GlassPanel className="relative overflow-hidden rounded-card! p-5">
              <p className="text-small font-semibold">Ventas · Lucía</p>
              <p className="mt-1 text-small text-ink-2">Pasa un lead cualificado</p>
            </GlassPanel>
          </div>
          <div ref={destino}>
            <GlassPanel className="relative overflow-hidden rounded-card! p-5">
              {llegadas > 0 && <span key={llegadas} aria-hidden="true" className="arrival-glow pointer-events-none absolute inset-0 rounded-[inherit] [--glow-delay:0s]" />}
              <p className="flex items-center gap-2 text-small font-semibold">
                Operaciones · Iván
                <span aria-hidden="true" className={`size-2 rounded-full transition-colors duration-300 ${llegadas > 0 ? "bg-status-working" : "bg-status-paused"}`} />
              </p>
              <p className="mt-1 text-small text-ink-2">{llegadas > 0 ? `Ha recibido ${llegadas} ${llegadas === 1 ? "traspaso" : "traspasos"}` : "Esperando trabajo"}</p>
            </GlassPanel>
          </div>
        </div>
        <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <Ficha
            nombre="LineaDeLuz"
            que={<>Dibuja la curva entre dos elementos con la <strong>misma geometría que la oficina</strong> (<code>handoffs/curva.ts</code>, compartida con <code>HandoffLayer</code>) y lanza una partícula al cambiar <code>disparo</code> o cada <code>cadaMs</code>. <code>alLlegar</code> avisa al destino para que «se encienda» (aquí, el brillo de llegada de la oficina).</>}
            reducido="Con movimiento reducido: solo la línea, y el destino se enciende al instante. SVG ligero (no es cristal); la partícula solo cambia transform y opacity. Vuelve a medir con ResizeObserver."
          />
          <PillButton icon={Sparkles} onClick={() => setDisparo((d) => d + 1)}>Lanzar traspaso</PillButton>
        </div>
      </Bloque>

      {/* Pantalla completa: contadores con datos reales de tarifas */}
      <Bloque id="contadores" titulo="Contadores" completa>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { v: TIPOS_DE_TAREA.simple.creditos, t: "créditos, tarea simple" },
            { v: TIPOS_DE_TAREA.estandar.creditos, t: "créditos, tarea estándar" },
            { v: TIPOS_DE_TAREA.experta.creditos, t: "créditos, tarea experta" },
            { v: 120000, t: "créditos del pack más grande (ejemplo de miles)" },
          ].map((c) => (
            <GlassPanel key={c.t} className="rounded-card! p-6">
              <Contador valor={c.v} className={tipo.cifra} />
              <p className="mt-2 text-small text-ink-2">{c.t}</p>
            </GlassPanel>
          ))}
        </div>
        <div className="mt-6">
          <Ficha
            nombre="Contador"
            que={<>Cuenta hasta el valor al verse, con separador de miles en español y prefijo/sufijo opcionales. Las cifras salen de <code>tarifas.ts</code> (un traspaso cuesta {CONSUMOS_FIJOS.traspaso}). Nunca para resultados de clientes que no tengamos.</>}
            reducido="Valor final directo con movimiento reducido. El HTML del servidor ya trae el número final y una copia invisible reserva el ancho (números tabulares): sin saltos. Solo cambia el texto del nodo, sin re-render."
          />
        </div>
      </Bloque>

      <Bloque id="fija" titulo="Sección fija con pasos">
        <Ficha
          nombre="SeccionFija"
          que={<>El panel de abajo se queda fijo mientras bajas ({PASOS.length} pasos × 90 vh). El paso cambia según el avance, con barra de progreso (vertical en escritorio, horizontal en móvil) y un visual con hueco reservado.</>}
          reducido="Con movimiento reducido se convierte en una lista normal de paneles. Siempre hay una lista oculta con todos los pasos para lectores de pantalla, sin depender del scroll."
        />
      </Bloque>
      <div className="mx-auto w-full max-w-6xl px-4">
        <SeccionFija pasos={PASOS} etiqueta="Ejemplo: de un lead a un informe" />
      </div>

      <Bloque id="video" titulo="Vídeo de producto">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
          <VideoProducto
            poster="/marketing/laboratorio/muestra-poster.jpg"
            webm="/marketing/laboratorio/muestra.webm"
            mp4="/marketing/laboratorio/muestra.mp4"
            ancho={1280}
            alto={720}
            descripcion="Vídeo de muestra: acercamiento lento a la oficina al atardecer."
          />
          <Ficha
            nombre="VideoProducto"
            que={<>Bucle silenciado y <code>playsInline</code>, con WebM y MP4. No descarga nada hasta estar a 300 px de la pantalla, se reproduce solo cuando se ve un 25 % y se pausa al salir. El póster tapa el hueco hasta que hay imagen. Es un vídeo de muestra generado con la escena: sustituir por grabaciones reales de la oficina.</>}
            reducido="Con movimiento reducido o ahorro de datos (saveData o 2G): solo el póster con «Reproducir vídeo». Botón de pausa siempre visible. El hueco lo reserva aspect-ratio."
          />
        </div>
      </Bloque>

      <Bloque id="demo" titulo="Demo en vivo">
        <div className="pt-8">
          <DemoEnVivo
            componente={DemoOficina}
            reserva={<ReservaDemoOficina />}
            descripcion="Cinco departamentos con sus agentes trabajando y traspasos entre ellos, con datos de ejemplo."
          />
        </div>
        <div className="mt-6">
          <Ficha
            nombre="DemoEnVivo"
            que={<>Envuelve un componente real de la oficina (aquí, las tarjetas de departamento con la simulación de traspasos). Su código se pide solo cuando la demo está a 400 px de verse; hasta entonces, la reserva ocupa el mismo alto.</>}
            reducido="Los componentes de la oficina ya respetan el movimiento reducido (sin partículas, solo brillo). La demo es inerte (no se puede tabular dentro) y se describe en texto."
          />
        </div>
      </Bloque>

      {/* Final a pantalla completa: ya de noche */}
      <section aria-labelledby="lab-fin" className="mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center px-4 pb-32">
        <motion.h2 id="lab-fin" className={`${tipo.titular} ${sobreEscena}`}>Ritmo</motion.h2>
        <p className={`mt-4 max-w-2xl ${tipo.entradilla} ${sobreEscena}`}>
          Pantalla completa (portada, escena, contadores, este cierre) alternando con bloques densos (fichas, paneles). Al final de la página ya es de noche.
        </p>
      </section>
    </PreferenciasForzadas.Provider>
  );
}
