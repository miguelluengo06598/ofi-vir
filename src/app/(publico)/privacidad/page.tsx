import type { Metadata } from "next";
import Link from "next/link";
import { Dato, DocumentoLegal, type Apartado } from "@/components/publico/legal/DocumentoLegal";
import { EMPRESA, ENCARGADOS, NOMBRE_COMERCIAL, NOMBRE_PRODUCTO, POLITICAS, ULTIMA_ACTUALIZACION } from "@/config/empresa";
import { CICLO_DE_VIDA } from "@/lib/creditos/tarifas";

export const metadata: Metadata = { title: "Política de privacidad", description: `Cómo trata ${NOMBRE_COMERCIAL} los datos personales en su plataforma.` };

const FINALIDADES = [
  {
    que: "Atender tu solicitud de acceso",
    datos: "Nombre, correo, empresa y lo que nos cuentes en tu mensaje.",
    base: "Aplicar medidas precontractuales a petición tuya (art. 6.1.b RGPD).",
    plazo: <Dato v={POLITICAS.plazoSolicitudesAcceso} />,
  },
  {
    que: "Gestionar las cuentas de usuario",
    datos: "Nombre, correo, contraseña (cifrada), empresas a las que perteneces, rol y permisos.",
    base: "Ejecución del contrato con tu empresa (art. 6.1.b) e interés legítimo en dar acceso seguro a su equipo (art. 6.1.f).",
    plazo: "Mientras la cuenta esté activa. Después, bloqueados durante los plazos de prescripción de las responsabilidades legales.",
  },
  {
    que: "Prestar el servicio a tu empresa",
    datos: "Datos de la oficina, uso de créditos, compras, configuración de los agentes y registros de actividad.",
    base: "Ejecución del contrato (art. 6.1.b).",
    plazo: "Mientras dure el contrato y, después, lo que exijan las obligaciones legales.",
  },
  {
    que: "Facturación y contabilidad",
    datos: "Datos fiscales de la empresa, compras e importes.",
    base: "Cumplimiento de obligaciones legales (art. 6.1.c).",
    plazo: "Seis años desde el último asiento (art. 30 del Código de Comercio) y los plazos que fije la normativa fiscal.",
  },
  {
    que: "Enviarte comunicaciones comerciales",
    datos: "Nombre y correo.",
    base: "Solo con tu consentimiento (art. 6.1.a RGPD y art. 21 LSSI). Puedes retirarlo cuando quieras.",
    plazo: "Hasta que retires tu consentimiento.",
  },
  {
    que: "Seguridad y prevención de abusos",
    datos: "Registros técnicos: dirección IP, fecha y hora, acciones realizadas.",
    base: "Interés legítimo en proteger el servicio y los datos de las empresas (art. 6.1.f).",
    plazo: <Dato v={POLITICAS.plazoRegistrosTecnicos} />,
  },
];

const APARTADOS: Apartado[] = [
  {
    id: "responsable",
    titulo: "Responsable del tratamiento",
    cuerpo: (
      <>
        <ul>
          <li><strong>Responsable:</strong> <Dato v={EMPRESA.razonSocial} /> ({NOMBRE_COMERCIAL})</li>
          <li><strong>NIF:</strong> <Dato v={EMPRESA.nif} /></li>
          <li><strong>Domicilio:</strong> <Dato v={EMPRESA.domicilio} /></li>
          <li><strong>Contacto para privacidad:</strong> <Dato v={EMPRESA.emailPrivacidad} /></li>
          <li><strong>Delegado de protección de datos:</strong> <Dato v={EMPRESA.delegadoProteccionDatos} /></li>
        </ul>
        <p>
          Esta política explica qué datos tratamos como <strong>responsables</strong> (los de quienes visitan la web, solicitan acceso o tienen
          cuenta). Los datos de los clientes de cada empresa los tratamos como <strong>encargados</strong>: lo explicamos en el{" "}
          <a href="#encargado">apartado 9</a>.
        </p>
      </>
    ),
  },
  {
    id: "finalidades",
    titulo: "Para qué usamos tus datos, con qué base legal y durante cuánto tiempo",
    cuerpo: (
      <>
        {FINALIDADES.map((f) => (
          <div key={f.que}>
            <h3>{f.que}</h3>
            <ul>
              <li><strong>Datos:</strong> {f.datos}</li>
              <li><strong>Base legal:</strong> {f.base}</li>
              <li><strong>Conservación:</strong> {f.plazo}</li>
            </ul>
          </div>
        ))}
        <p>No tomamos decisiones sobre ti basadas únicamente en un tratamiento automatizado que produzcan efectos jurídicos o te afecten de forma significativa.</p>
      </>
    ),
  },
  {
    id: "inactividad",
    titulo: "Oficinas sin actividad",
    cuerpo: (
      <p>
        Si una oficina pasa {CICLO_DE_VIDA.diasSinActividadParaPausar} días sin actividad o sin saldo, se pausa. Si sigue pausada{" "}
        {CICLO_DE_VIDA.diasPausadaParaBorrado} días, avisamos a la empresa y, pasados {CICLO_DE_VIDA.diasDeGraciaBorrado} días más sin que la
        reactive, se borran sus datos, salvo los que debamos conservar por obligación legal (por ejemplo, la facturación).
      </p>
    ),
  },
  {
    id: "destinatarios",
    titulo: "Encargados del tratamiento",
    cuerpo: (
      <>
        <p>
          No vendemos datos ni los cedemos a terceros, salvo obligación legal. Para prestar el servicio usamos estos proveedores, que tratan datos
          por cuenta nuestra y con un contrato de encargo:
        </p>
        <div className="mt-4 overflow-x-auto rounded-card ring-1 ring-white/15">
          <table className="w-full min-w-[36rem] text-left text-small">
            <caption className="sr-only">Encargados del tratamiento</caption>
            <thead className="bg-white/5 text-ink-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Proveedor</th>
                <th scope="col" className="px-3 py-2 font-semibold">Para qué</th>
                <th scope="col" className="px-3 py-2 font-semibold">Qué datos</th>
                <th scope="col" className="px-3 py-2 font-semibold">Dónde</th>
              </tr>
            </thead>
            <tbody>
              {ENCARGADOS.map((e) => (
                <tr key={e.nombre} className="border-t border-white/10 align-top">
                  <th scope="row" className="px-3 py-2 font-semibold">
                    {e.nombre}
                    {!e.activo && <span className="block text-tiny font-normal text-ink-2">Cuando se use</span>}
                  </th>
                  <td className="px-3 py-2">{e.servicio}</td>
                  <td className="px-3 py-2">{e.datos}</td>
                  <td className="px-3 py-2"><Dato v={e.ubicacion} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Si cambiamos de proveedor, actualizaremos esta lista.</p>
      </>
    ),
  },
  {
    id: "transferencias",
    titulo: "Transferencias internacionales y garantías",
    cuerpo: (
      <>
        <p>
          Algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo. Cuando ocurre, solo lo hacemos con alguna de las garantías
          del RGPD: una decisión de adecuación de la Comisión Europea (por ejemplo, el Marco de Privacidad de Datos UE-EE. UU. para las empresas
          adheridas) o las cláusulas contractuales tipo aprobadas por la Comisión, con medidas adicionales cuando hagan falta.
        </p>
        <ul>
          {ENCARGADOS.map((e) => (
            <li key={e.nombre}>
              <strong>{e.nombre}:</strong> <Dato v={e.garantia} />
            </li>
          ))}
        </ul>
        <p>Puedes pedirnos una copia de las garantías escribiendo a <Dato v={EMPRESA.emailPrivacidad} />.</p>
      </>
    ),
  },
  {
    id: "ia",
    titulo: "Inteligencia artificial",
    cuerpo: (
      <ul>
        <li>Para que un agente redacte o analice, enviamos al proveedor de IA solo el texto que necesita esa tarea.</li>
        <li>{NOMBRE_COMERCIAL} no usa los datos de las empresas ni de sus clientes para entrenar modelos de IA.</li>
        <li>La memoria de cada oficina es solo de esa empresa y descarta datos de salud, bancarios, de identidad y contraseñas.</li>
        <li>Los agentes avisan de que son una IA en el primer mensaje a cada persona.</li>
      </ul>
    ),
  },
  {
    id: "seguridad",
    titulo: "Seguridad",
    cuerpo: (
      <p>
        Aplicamos medidas técnicas y organizativas adecuadas al riesgo: aislamiento de los datos de cada empresa en la base de datos, cifrado en
        tránsito, credenciales de aplicaciones conectadas guardadas cifradas, control de permisos por rol y registro de las acciones sensibles.
        Más detalle en la página de <Link href="/seguridad">seguridad</Link>.
      </p>
    ),
  },
  {
    id: "derechos",
    titulo: "Tus derechos y cómo ejercerlos",
    cuerpo: (
      <>
        <p>Puedes ejercer en cualquier momento tus derechos de:</p>
        <ul>
          <li><strong>Acceso:</strong> saber qué datos tuyos tratamos.</li>
          <li><strong>Rectificación:</strong> corregir datos inexactos.</li>
          <li><strong>Supresión:</strong> pedir que los borremos.</li>
          <li><strong>Oposición</strong> y <strong>limitación</strong> del tratamiento.</li>
          <li><strong>Portabilidad:</strong> recibir tus datos en un formato estructurado.</li>
          <li><strong>Retirar tu consentimiento</strong>, sin que afecte a lo hecho antes.</li>
        </ul>
        <p>
          Escríbenos a <Dato v={EMPRESA.emailPrivacidad} /> indicando qué derecho quieres ejercer y un dato que nos permita identificarte. Te
          responderemos en el plazo de un mes, ampliable en dos meses más en casos complejos (te avisaríamos). Si tenemos dudas razonables sobre tu
          identidad, podremos pedirte información adicional.
        </p>
      </>
    ),
  },
  {
    id: "encargado",
    titulo: "MyOfia como encargado del tratamiento de los datos de los clientes de cada empresa",
    cuerpo: (
      <>
        <p>
          Cuando una empresa usa {NOMBRE_PRODUCTO}, sus agentes tratan datos de los clientes y contactos de esa empresa: correos, mensajes, fichas
          del CRM, memoria y documentos. De esos datos <strong>la empresa es la responsable</strong> y {NOMBRE_COMERCIAL} actúa como{" "}
          <strong>encargado del tratamiento</strong> (art. 28 RGPD), según el contrato de encargo que forma parte de las{" "}
          <Link href="/condiciones#encargo">condiciones del servicio</Link>. Esto significa que:
        </p>
        <ul>
          <li>Solo tratamos esos datos para prestar el servicio y siguiendo las instrucciones de la empresa.</li>
          <li>Cada empresa solo ve sus datos. Las cuentas internas de {NOMBRE_COMERCIAL} no dan acceso a ellos.</li>
          <li>Las personas de nuestro equipo que intervengan tienen deber de confidencialidad.</li>
          <li>Usamos los subencargados de la lista anterior y avisaremos a las empresas antes de añadir o cambiar alguno.</li>
          <li>Ayudamos a la empresa a atender los derechos de sus clientes: por ejemplo, puede borrar todo lo que sabemos de un contacto en un solo paso.</li>
          <li>Avisaremos a la empresa sin dilación indebida si sufrimos una brecha de seguridad que afecte a sus datos.</li>
          <li>Al terminar el servicio, borramos los datos o los devolvemos a la empresa, según elija, salvo obligación legal de conservarlos.</li>
        </ul>
        <p>
          Si eres cliente de una empresa que usa {NOMBRE_PRODUCTO} y quieres ejercer tus derechos, dirígete a esa empresa. Si nos escribes a
          nosotros, le trasladaremos tu petición.
        </p>
      </>
    ),
  },
  {
    id: "reclamacion",
    titulo: "Reclamación ante la AEPD",
    cuerpo: (
      <p>
        Si crees que no hemos tratado bien tus datos, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (
        <a href="https://www.aepd.es" rel="noopener noreferrer">www.aepd.es</a>, C/ Jorge Juan 6, 28001 Madrid). Te agradeceremos que antes nos
        escribas para intentar resolverlo.
      </p>
    ),
  },
  {
    id: "cambios",
    titulo: "Cambios en esta política",
    cuerpo: <p>Si cambiamos esta política, actualizaremos la fecha de arriba y, si el cambio es importante, te avisaremos por correo o en la aplicación.</p>,
  },
];

export default function Privacidad() {
  return <DocumentoLegal titulo="Política de privacidad" actualizado={ULTIMA_ACTUALIZACION.privacidad} apartados={APARTADOS} />;
}
