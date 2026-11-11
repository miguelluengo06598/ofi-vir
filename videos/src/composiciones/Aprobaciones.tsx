/**
 * aprobaciones · 10 s en bucle. Un borrador (líneas abstractas) espera; se retoca una frase; una persona
 * pulsa «Aprobar»; el correo sale volando y llega con el doble check de «entregado».
 */
import { CheckCheck, Mail, Send, ShieldCheck } from "lucide-react";
import { entre, pulso, ventana } from "../comun/animar";
import { AMBAR, AZUL, Ficha, Haz, Lienzo, Orbe, Rotulo, Sello, VERDE, alfa, pop, puntoDelHaz, useTiempo, type Punto } from "../comun/simbolos";

export function Aprobaciones() {
  const { f, s, vida } = useTiempo();
  const v = vida();
  const tarjeta = { x: 330, y: 150, w: 420 };
  const retoque = ventana(f, s(1.6), s(2.2), s(3.4), s(4.0));
  const pulsa = pulso(f, s(4.4), s(0.5));
  const aprobado = entre(f, s(4.5), s(4.8));
  const desde: Punto = { x: tarjeta.x + tarjeta.w, y: 260 };
  const destino: Punto = { x: 1080, y: 210 };
  const vuelo = entre(f, s(5.3), s(6.5));
  const sobre = puntoDelHaz(desde, destino, vuelo);
  const colorBoton = aprobado > 0.5 ? VERDE : "#ffffff";
  return (
    <Lienzo tinte={AMBAR} foco={{ x: 40, y: 45 }}>
      <Haz id="ap-envio" desde={desde} hasta={destino} t={vuelo} visible={ventana(f, s(5.0), s(5.3), s(7.2), s(8.0)) * v} color1={VERDE} color2={AZUL} />
      <Ficha x={tarjeta.x} y={tarjeta.y} w={tarjeta.w} lineas={6} visible={entre(f, s(0.2), s(0.9)) * v} Icono={Mail} color={AZUL} resalte={{ linea: 2, p: retoque, color: AZUL }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 999, fontSize: 15, fontWeight: 600,
              color: aprobado > 0.5 ? "#06281c" : "#0b1220", background: colorBoton, scale: String(1 - 0.08 * pulsa),
              boxShadow: `0 0 ${26 * aprobado}px ${alfa(VERDE, 0.7)}`,
            }}
          >
            <ShieldCheck size={17} /> {aprobado > 0.5 ? "Aprobado" : "Aprobar"}
          </div>
        </div>
      </Ficha>
      {/* Cursor que retoca la frase y luego pulsa el botón. */}
      <Cursor f={f} s={s} v={v} />
      <Orbe p={{ x: tarjeta.x - 10, y: tarjeta.y - 10 }} r={26} color={AMBAR} Icono={ShieldCheck} visible={entre(f, s(0.6), s(1.1)) * (1 - aprobado) * v} />
      <Orbe p={sobre} r={22} color={AZUL} Icono={Send} visible={(vuelo > 0 && vuelo < 1 ? 1 : 0) * v} brillo={1} />
      <Orbe p={destino} r={38} color={AZUL} Icono={Mail} visible={entre(f, s(5.0), s(5.5)) * v} brillo={pulso(f, s(6.6), s(1.2))} onda={entre(f, s(6.5), s(7.3)) * (f < s(7.3) ? 1 : 0)} />
      <Sello p={pop(f, s(6.7), s(7.2)) * v} centro={{ x: destino.x + 30, y: destino.y - 30 }} Icono={CheckCheck} />
      <Rotulo p={{ x: destino.x, y: destino.y + 54 }} texto="Entregado" visible={entre(f, s(6.9), s(7.4)) * v} activo={1} />
    </Lienzo>
  );
}

function Cursor({ f, s, v }: { f: number; s: (n: number) => number; v: number }) {
  // Trayecto: entra, se posa en la línea 3, baja al botón y se va.
  const a = entre(f, s(1.0), s(1.7));
  const b = entre(f, s(3.6), s(4.3));
  const c = entre(f, s(5.0), s(5.8));
  const x = 900 - 300 * a + 70 * b + 220 * c;
  const y = 420 - 170 * a + 105 * b + 160 * c;
  const visible = entre(f, s(0.9), s(1.2)) * (1 - entre(f, s(5.4), s(5.8))) * v;
  if (visible <= 0.001) return null;
  return (
    <svg style={{ position: "absolute", left: x, top: y, opacity: visible, overflow: "visible" }} width="22" height="28" viewBox="0 0 22 28">
      <path d="M1 1 L1 22 L7 17 L11 26 L15 24 L11 16 L19 16 Z" fill="#fff" stroke="#0b1220" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
