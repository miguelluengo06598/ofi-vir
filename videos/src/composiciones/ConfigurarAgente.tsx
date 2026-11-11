/**
 * configurar-agente · 20 s en bucle. Contar tu negocio → la ficha del agente se rellena sola → se conecta
 * un canal → se prueba en el simulador → se envía a certificación. Representativo: burbujas y líneas
 * abstractas, sin pantallas reales.
 */
import { Bot, FlaskConical, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { entre, pulso, ventana } from "../comun/animar";
import { AZUL, Burbuja, Ficha, Haz, LUZ, Lienzo, Orbe, Rotulo, Sello, VERDE, pop, useTiempo, type Punto } from "../comun/simbolos";

export function ConfigurarAgente() {
  const { f, s, vida } = useTiempo();
  const v = vida(0.6, 1.0);
  const persona: Punto = { x: 150, y: 250 };
  const tarjeta = { x: 470, y: 190, w: 330 };
  const canal: Punto = { x: 1010, y: 150 };
  const sim: Punto = { x: 1150, y: 330 };
  const escudo: Punto = { x: 1080, y: 590 };
  const relato = [0.6, 1.4, 2.2];
  const relleno = entre(f, s(4.4), s(7.6));
  const cuenta = ventana(f, s(0.3), s(0.8), s(7.6), s(8.4));
  const simula = ventana(f, s(11.0), s(11.4), s(15.2), s(15.8));
  return (
    <Lienzo tinte={AZUL} foco={{ x: 50, y: 45 }}>
      {/* 1 · Cuentas cómo es tu negocio */}
      <Orbe p={persona} r={32} color="#CBD5E1" Icono={UserRound} visible={cuenta * v} />
      {relato.map((t, i) => (
        <Burbuja key={i} lado="fuera" p={{ x: 200, y: 300 + i * 66 }} w={200} visible={pop(f, s(t), s(t + 0.5)) * cuenta * v} />
      ))}
      {relato.map((_, i) => (
        <Haz key={`h-${i}`} id={`cf-${i}`} desde={{ x: 400, y: 320 + i * 66 }} hasta={{ x: tarjeta.x + 10, y: tarjeta.y + 70 + i * 30 }}
          t={entre(f, s(4.0 + i * 0.4), s(4.9 + i * 0.4))} visible={ventana(f, s(3.8 + i * 0.4), s(4.1 + i * 0.4), s(5.0 + i * 0.4), s(5.6 + i * 0.4)) * v} color1="#ffffff" color2={AZUL} curva={0.1} />
      ))}

      {/* 2 · La ficha del agente se rellena sola */}
      <Ficha x={tarjeta.x} y={tarjeta.y} w={tarjeta.w} lineas={6} relleno={relleno} visible={entre(f, s(3.6), s(4.3)) * v} Icono={Bot} color={AZUL}
        resalte={{ linea: Math.min(5, Math.floor(relleno * 6)), p: ventana(f, s(4.4), s(4.7), s(7.4), s(7.8)) }} />
      <Sello p={pop(f, s(7.7), s(8.2)) * v} centro={{ x: tarjeta.x + tarjeta.w - 6, y: tarjeta.y + 6 }} />

      {/* 3 · Se conecta un canal */}
      <Haz id="cf-canal" desde={{ x: tarjeta.x + tarjeta.w, y: tarjeta.y + 30 }} hasta={canal} t={entre(f, s(8.8), s(9.8))}
        visible={entre(f, s(8.5), s(8.8)) * (1 - entre(f, s(15.6), s(16.4))) * v} color1={AZUL} color2={VERDE} />
      <Orbe p={canal} r={32} color={VERDE} Icono={MessageCircle} visible={entre(f, s(8.3), s(8.9)) * v} brillo={pulso(f, s(9.9), s(1))}
        onda={entre(f, s(9.8), s(10.6)) * (f < s(10.6) ? 1 : 0)} />
      <Sello p={pop(f, s(9.9), s(10.4)) * v} centro={{ x: canal.x + 26, y: canal.y - 26 }} />
      <Rotulo p={{ x: canal.x, y: canal.y + 46 }} texto="Conectado" visible={entre(f, s(10.0), s(10.5)) * v} />

      {/* 4 · Se prueba en el simulador (sin efectos reales) */}
      <Orbe p={sim} r={26} color={LUZ} Icono={FlaskConical} visible={simula * v} brillo={0.5} />
      <Burbuja lado="fuera" p={{ x: 870, y: 290 }} w={150} visible={pop(f, s(11.4), s(11.9)) * simula * v} />
      <Burbuja lado="agente" p={{ x: 910, y: 360 }} w={150} color={AZUL} visible={pop(f, s(12.3), s(12.8)) * simula * v} />
      <Burbuja lado="fuera" p={{ x: 870, y: 430 }} w={150} visible={pop(f, s(13.2), s(13.7)) * simula * v} />
      <Burbuja lado="agente" p={{ x: 910, y: 500 }} w={150} color={AZUL} visible={pop(f, s(14.0), s(14.5)) * simula * v} />

      {/* 5 · Se envía a certificación */}
      <Haz id="cf-cert" desde={{ x: tarjeta.x + tarjeta.w / 2, y: tarjeta.y + 250 }} hasta={escudo} t={entre(f, s(15.8), s(16.9))}
        visible={entre(f, s(15.5), s(15.8)) * v} color1={AZUL} color2={LUZ} curva={-0.15} />
      <Orbe p={escudo} r={38} color={AZUL} Icono={ShieldCheck} visible={entre(f, s(15.4), s(16.0)) * v} brillo={pulso(f, s(17.0), s(1.4))}
        onda={entre(f, s(16.9), s(17.8)) * (f < s(17.8) ? 1 : 0)} />
      <Rotulo p={{ x: escudo.x, y: escudo.y + 50 }} texto="A certificación" visible={entre(f, s(17.0), s(17.5)) * v} activo={1} />
    </Lienzo>
  );
}
