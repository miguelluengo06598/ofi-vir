import type { Metadata } from "next";
import Link from "next/link";
import { BotonPreferenciasCookies } from "@/components/publico/Consentimiento";
import { Dato, DocumentoLegal, type Apartado } from "@/components/publico/legal/DocumentoLegal";
import { CATEGORIAS, COOKIES, categoriasOpcionales } from "@/config/cookies";
import { EMPRESA, ULTIMA_ACTUALIZACION } from "@/config/empresa";

export const metadata: Metadata = { title: "Política de cookies", description: "Qué cookies y almacenamiento del navegador usa Oficina Virtual IA." };

const opcionales = categoriasOpcionales();

const APARTADOS: Apartado[] = [
  {
    id: "que-son",
    titulo: "Qué son las cookies",
    cuerpo: (
      <p>
        Las cookies son pequeños archivos que una web guarda en tu navegador. Algunas son imprescindibles para que la web funcione; otras sirven,
        por ejemplo, para medir visitas. Esta política también cubre otros sistemas parecidos, como el almacenamiento local del navegador.
      </p>
    ),
  },
  {
    id: "cuales",
    titulo: "Qué cookies usamos",
    cuerpo: (
      <>
        <p>
          {opcionales.length === 0
            ? "Ahora mismo solo usamos elementos técnicos, necesarios para que la web y la oficina funcionen. No usamos cookies de analítica, publicidad ni redes sociales, y no cargamos scripts de terceros que las instalen."
            : "Usamos elementos técnicos y, solo si lo aceptas, los opcionales que se indican en la tabla."}
        </p>
        <div className="mt-4 overflow-x-auto rounded-card ring-1 ring-white/15">
          <table className="w-full min-w-[38rem] text-left text-small">
            <caption className="sr-only">Cookies y almacenamiento del navegador</caption>
            <thead className="bg-white/5 text-ink-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Nombre</th>
                <th scope="col" className="px-3 py-2 font-semibold">Tipo</th>
                <th scope="col" className="px-3 py-2 font-semibold">Para qué</th>
                <th scope="col" className="px-3 py-2 font-semibold">Duración</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.nombre} className="border-t border-white/10 align-top">
                  <th scope="row" className="px-3 py-2 font-mono text-tiny font-normal break-all">{c.nombre}</th>
                  <td className="px-3 py-2">
                    {CATEGORIAS[c.categoria].nombre}
                    <span className="block text-tiny text-ink-2">{c.tipo === "cookie" ? "Cookie" : "Almacenamiento local"} · {c.proveedor}</span>
                  </td>
                  <td className="px-3 py-2">{c.finalidad}</td>
                  <td className="px-3 py-2">{c.duracion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "consentimiento",
    titulo: "Consentimiento",
    cuerpo: (
      <>
        <p>
          Las cookies técnicas están exentas de consentimiento (art. 22.2 de la LSSI) porque sin ellas no podríamos darte el servicio que pides,
          como mantener tu sesión iniciada. Por eso hoy no mostramos ningún aviso de cookies.
        </p>
        <p>
          Si en el futuro añadimos cookies de analítica u otras no necesarias, te pediremos permiso <strong>antes</strong> de instalarlas, con la
          opción de rechazarlas tan fácil como la de aceptarlas, y actualizaremos esta política.
        </p>
        {opcionales.length > 0 && <div className="mt-4"><BotonPreferenciasCookies /></div>}
      </>
    ),
  },
  {
    id: "gestionar",
    titulo: "Cómo borrarlas o bloquearlas",
    cuerpo: (
      <p>
        Puedes borrar o bloquear las cookies desde la configuración de tu navegador. Si bloqueas las técnicas, no podrás iniciar sesión en la
        oficina.
      </p>
    ),
  },
  {
    id: "mas",
    titulo: "Más información",
    cuerpo: (
      <p>
        Cómo tratamos los datos personales lo explicamos en la <Link href="/privacidad">política de privacidad</Link>. Para cualquier duda,
        escríbenos a <Dato v={EMPRESA.emailContacto} />.
      </p>
    ),
  },
];

export default function Cookies() {
  return <DocumentoLegal titulo="Política de cookies" actualizado={ULTIMA_ACTUALIZACION.cookies} apartados={APARTADOS} />;
}
