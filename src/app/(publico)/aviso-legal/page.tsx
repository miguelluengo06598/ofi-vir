import type { Metadata } from "next";
import Link from "next/link";
import { Dato, DocumentoLegal, type Apartado } from "@/components/publico/legal/DocumentoLegal";
import { EMPRESA, NOMBRE_COMERCIAL, NOMBRE_PRODUCTO, ULTIMA_ACTUALIZACION } from "@/config/empresa";

export const metadata: Metadata = { title: "Aviso legal", description: `Datos del titular de ${NOMBRE_PRODUCTO} y condiciones de uso del sitio web.` };

const APARTADOS: Apartado[] = [
  {
    id: "titular",
    titulo: "Titular del sitio web",
    cuerpo: (
      <>
        <p>
          En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI), te
          informamos de quién es el titular de este sitio web:
        </p>
        <ul>
          <li><strong>Titular:</strong> <Dato v={EMPRESA.razonSocial} /> (nombre comercial: {NOMBRE_COMERCIAL})</li>
          <li><strong>NIF:</strong> <Dato v={EMPRESA.nif} /></li>
          <li><strong>Domicilio:</strong> <Dato v={EMPRESA.domicilio} /></li>
          <li><strong>Correo electrónico de contacto:</strong> <Dato v={EMPRESA.emailContacto} /></li>
          <li><strong>Datos registrales:</strong> <Dato v={EMPRESA.datosRegistrales} /></li>
          <li><strong>Sitio web:</strong> <Dato v={EMPRESA.dominio} /></li>
        </ul>
        <p>{NOMBRE_COMERCIAL} es el nombre comercial del titular de este sitio web.</p>
      </>
    ),
  },
  {
    id: "objeto",
    titulo: "Objeto",
    cuerpo: (
      <p>
        Este sitio web presenta {NOMBRE_PRODUCTO}, una plataforma en la que las empresas organizan agentes de inteligencia artificial por
        departamentos, y da acceso a la aplicación a las personas con cuenta. El uso de la aplicación se rige además por las{" "}
        <Link href="/condiciones">condiciones del servicio</Link>.
      </p>
    ),
  },
  {
    id: "uso",
    titulo: "Uso del sitio web",
    cuerpo: (
      <>
        <p>Al usar este sitio web te comprometes a hacerlo de forma lícita y a no:</p>
        <ul>
          <li>Intentar acceder a zonas, cuentas o datos para los que no tienes permiso.</li>
          <li>Introducir programas, código o contenidos que puedan dañar el sitio o a otras personas.</li>
          <li>Usar el sitio para fines contrarios a la ley, a la buena fe o al orden público.</li>
        </ul>
      </>
    ),
  },
  {
    id: "propiedad",
    titulo: "Propiedad intelectual e industrial",
    cuerpo: (
      <p>
        Los textos, el diseño, el código, los logotipos y demás elementos de este sitio pertenecen a <Dato v={EMPRESA.razonSocial} /> o a terceros
        que han autorizado su uso. No puedes reproducirlos, distribuirlos ni transformarlos sin autorización, salvo para tu uso personal y en los
        casos que permita la ley.
      </p>
    ),
  },
  {
    id: "responsabilidad",
    titulo: "Responsabilidad",
    cuerpo: (
      <>
        <p>
          Procuramos que la información de este sitio sea correcta y esté al día, pero puede contener errores o quedar desactualizada. Las cifras de
          la calculadora de precios son estimaciones orientativas, no una oferta.
        </p>
        <p>
          No respondemos de los daños causados por un uso indebido del sitio ni de interrupciones debidas a causas ajenas a nuestro control. Si el
          sitio enlaza a páginas de terceros, no somos responsables de su contenido.
        </p>
      </>
    ),
  },
  {
    id: "datos",
    titulo: "Protección de datos y cookies",
    cuerpo: (
      <p>
        Cómo tratamos los datos personales lo explicamos en la <Link href="/privacidad">política de privacidad</Link>, y qué cookies usamos, en la{" "}
        <Link href="/cookies">política de cookies</Link>.
      </p>
    ),
  },
  {
    id: "ley",
    titulo: "Ley aplicable",
    cuerpo: (
      <p>
        Este aviso legal se rige por la legislación española. Para cualquier controversia, si eres consumidor, serán competentes los juzgados de tu
        domicilio; en otro caso, <Dato v={EMPRESA.fuero} />.
      </p>
    ),
  },
];

export default function AvisoLegal() {
  return <DocumentoLegal titulo="Aviso legal" actualizado={ULTIMA_ACTUALIZACION.avisoLegal} apartados={APARTADOS} />;
}
