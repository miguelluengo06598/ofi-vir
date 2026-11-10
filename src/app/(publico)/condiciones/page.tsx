import type { Metadata } from "next";
import Link from "next/link";
import { Dato, DocumentoLegal, type Apartado } from "@/components/publico/legal/DocumentoLegal";
import { EMPRESA, NOMBRE_COMERCIAL, NOMBRE_PRODUCTO, POLITICAS, ULTIMA_ACTUALIZACION } from "@/config/empresa";
import { CICLO_DE_VIDA, CONSUMOS_FIJOS, IVA_PORCENTAJE, TIPOS_DE_TAREA } from "@/lib/creditos/tarifas";
import { bonoPorcentaje, caducidad } from "@/lib/publico/estimacion";
import { packsPublicos } from "@/lib/publico/packs";

export const metadata: Metadata = { title: "Condiciones del servicio", description: `Condiciones de uso de ${NOMBRE_PRODUCTO}: créditos, aprobaciones, certificación y uso aceptable.` };

export default async function Condiciones() {
  const packs = await packsPublicos();
  const prueba = packs?.find((p) => p.soloUnaVez);
  const recurrente = packs?.find((p) => !p.soloUnaVez);
  const bono = recurrente ? bonoPorcentaje(recurrente) : null;
  const caducidadGeneral = recurrente ? caducidad(recurrente.diasCaducidad) : "12 meses";

  const apartados: Apartado[] = [
    {
      id: "objeto",
      titulo: "Objeto y partes",
      cuerpo: (
        <>
          <p>
            Estas condiciones regulan el uso de {NOMBRE_PRODUCTO}, un servicio de <Dato v={EMPRESA.razonSocial} /> ({NOMBRE_COMERCIAL}, NIF{" "}
            <Dato v={EMPRESA.nif} />) con el que una empresa organiza agentes de inteligencia artificial por departamentos.
          </p>
          <p>
            El servicio se contrata entre {NOMBRE_COMERCIAL} y la empresa cliente («tu empresa»). Quien lo acepta en nombre de una empresa declara que
            tiene capacidad para obligarla. El servicio está pensado para uso profesional, no para consumidores.
          </p>
        </>
      ),
    },
    {
      id: "cuentas",
      titulo: "Cuentas, roles y acceso",
      cuerpo: (
        <ul>
          <li>Cada oficina tiene una persona propietaria y puede tener administradores y miembros, con los permisos que se ven en la aplicación.</li>
          <li>Solo propietarios y administradores compran créditos, conectan aplicaciones y configuran agentes.</li>
          <li>Cada persona debe guardar sus credenciales en secreto y avisarnos si sospecha un acceso indebido.</li>
          <li>Tu empresa responde de lo que hagan las personas a las que da acceso.</li>
        </ul>
      ),
    },
    {
      id: "creditos",
      titulo: "Créditos",
      cuerpo: (
        <>
          <ul>
            <li><strong>1 crédito equivale a 1 céntimo de euro.</strong> Los créditos son de prepago y se gastan al usar el servicio.</li>
            <li>No hay cuotas: los departamentos y los agentes son gratis. Solo se cobran las tareas y los consumos fijos.</li>
            <li>
              Cada tipo de tarea tiene una tarifa fija, sea cual sea su coste real: simple {TIPOS_DE_TAREA.simple.creditos}, estándar{" "}
              {TIPOS_DE_TAREA.estandar.creditos} y experta {TIPOS_DE_TAREA.experta.creditos} créditos; traspaso entre departamentos{" "}
              {CONSUMOS_FIJOS.traspaso} y correo enviado {CONSUMOS_FIJOS.correo}. La tarifa de WhatsApp se publicará antes de activar ese canal.
              Las tarifas vigentes están siempre en la página de <Link href="/precios">precios</Link>.
            </li>
            <li>Los créditos no tienen valor monetario fuera del servicio, no se canjean por dinero y no se pueden pasar a otra empresa.</li>
            <li>El saldo nunca queda en negativo: sin créditos suficientes, la tarea no empieza.</li>
          </ul>
        </>
      ),
    },
    {
      id: "packs",
      titulo: "Packs, bono mensual y pago",
      cuerpo: (
        <ul>
          <li>Los créditos se compran en packs. Precios, créditos y condiciones de cada pack están en la página de <Link href="/precios">precios</Link>.</li>
          <li>Los precios no incluyen el IVA ({IVA_PORCENTAJE} %), que se añade al pagar.</li>
          {prueba && <li>El pack {prueba.nombre} se puede comprar una sola vez por empresa y no admite bono mensual.</li>}
          <li>
            <strong>Bono mensual{bono !== null ? ` (+${bono} %)` : ""}:</strong> puedes contratar un pack como suscripción mensual y recibir más
            créditos cada mes. Se renueva cada mes hasta que lo canceles. Al cancelarlo conservas los créditos ya recibidos.
          </li>
          <li>El pago se hace a través de la pasarela que se indique al comprar. {NOMBRE_COMERCIAL} no guarda los datos de tu tarjeta.</li>
        </ul>
      ),
    },
    {
      id: "caducidad",
      titulo: "Caducidad de los créditos",
      cuerpo: (
        <ul>
          <li>
            Los créditos caducan a los <strong>{caducidadGeneral}</strong> de su compra
            {prueba && <>; los del pack {prueba.nombre}, a los {caducidad(prueba.diasCaducidad)}</>}.
          </li>
          <li>Se gastan primero los créditos que caducan antes.</li>
          <li>
            Te avisamos {CICLO_DE_VIDA.avisoCaducidadDias} días antes de que caduque un lote con más de{" "}
            {CICLO_DE_VIDA.avisoCaducidadMinCreditos.toLocaleString("es-ES", { useGrouping: "always" } as Intl.NumberFormatOptions)} créditos.
          </li>
          <li>Los créditos caducados se pierden.</li>
        </ul>
      ),
    },
    {
      id: "reembolsos",
      titulo: "Reembolsos",
      cuerpo: <p><Dato v={POLITICAS.reembolsos} /></p>,
    },
    {
      id: "tope",
      titulo: "Tope de gasto y recarga automática",
      cuerpo: (
        <ul>
          <li>Puedes fijar un máximo de créditos al mes para toda la oficina y para cada agente. Al alcanzarlo, no empiezan tareas nuevas que gasten créditos y te avisamos.</li>
          <li>Puedes activar la recarga automática: cuando el saldo baje del umbral que elijas, se compra el pack que hayas indicado con tu método de pago.</li>
          <li>Las rutinas (tareas periódicas) solo las crea y activa una persona, con su coste estimado al mes a la vista y un límite de ejecuciones.</li>
        </ul>
      ),
    },
    {
      id: "estados",
      titulo: "Saldo, oficina pausada y borrado de datos",
      cuerpo: (
        <>
          <ul>
            <li><strong>Saldo bajo:</strong> te avisamos cuando queda poco saldo.</li>
            <li>
              <strong>Sin saldo:</strong> los agentes no empiezan tareas nuevas. Lo que llega (correos, mensajes) se sigue guardando para que no
              pierdas nada.
            </li>
            <li>
              <strong>Pausada:</strong> puedes pausar tu oficina cuando quieras. También se pausa sola tras{" "}
              {CICLO_DE_VIDA.diasSinActividadParaPausar} días sin actividad o sin saldo.
            </li>
            <li>
              <strong>Pendiente de borrado:</strong> si sigue pausada {CICLO_DE_VIDA.diasPausadaParaBorrado} días, te avisamos y, pasados{" "}
              {CICLO_DE_VIDA.diasDeGraciaBorrado} días más, se borran los datos de la oficina, salvo los que debamos conservar por ley.
            </li>
          </ul>
          <p>Comprar créditos reactiva la oficina y cancela el borrado previsto.</p>
        </>
      ),
    },
    {
      id: "aprobaciones",
      titulo: "Aprobaciones y permisos de los agentes",
      cuerpo: (
        <ul>
          <li>
            Tu empresa decide, para cada agente y herramienta, si actúa solo, con aprobación, si pasa el caso a una persona o si lo tiene prohibido.
            Por defecto, lo que se envía a personas de fuera pide aprobación.
          </li>
          <li>Un correo solo se envía con una aprobación registrada del texto exacto. Si el texto cambia, hay que aprobarlo de nuevo.</li>
          <li>Los agentes solo trabajan con un motivo concreto: algo que llega, una orden de una persona, una rutina o un seguimiento aprobados.</li>
          <li>
            Lo que tu empresa aprueba, o permite hacer sin aprobación, es responsabilidad suya. Revisa lo que proponen los agentes: la IA puede
            equivocarse.
          </li>
        </ul>
      ),
    },
    {
      id: "certificacion",
      titulo: "Certificación de los agentes",
      cuerpo: (
        <ul>
          <li>Ningún agente trabaja con datos o clientes reales sin la certificación de {NOMBRE_COMERCIAL}: un examen técnico con datos ficticios y una revisión humana.</li>
          <li>Los cambios importantes en un agente requieren una nueva certificación; mientras, sigue trabajando la versión certificada. Los agentes activos se recertifican cada seis meses.</li>
          <li>{NOMBRE_COMERCIAL} puede rechazar una certificación con motivos, y pausar o retirar la de un agente si detecta un riesgo o un uso contrario a estas condiciones.</li>
          <li>La certificación es un control interno de {NOMBRE_COMERCIAL}, no un sello oficial, y no garantiza resultados comerciales.</li>
        </ul>
      ),
    },
    {
      id: "uso-aceptable",
      titulo: "Uso aceptable",
      cuerpo: (
        <>
          <p>No está permitido usar {NOMBRE_PRODUCTO} ni sus agentes para:</p>
          <ul>
            <li>Enviar comunicaciones comerciales a quien no las ha solicitado ni consentido, ni envíos masivos no deseados (art. 21 LSSI).</li>
            <li>Tratar datos personales sin base legal, o datos de salud, ideología, origen o vida sexual sin una base que lo permita.</li>
            <li>Ocultar a las personas que hablan con una IA o hacerse pasar por otra persona o empresa.</li>
            <li>Engañar, acosar, discriminar o difundir contenidos ilícitos.</li>
            <li>Tomar decisiones con efectos jurídicos o significativos sobre una persona sin intervención humana.</li>
            <li>Intentar saltarse las aprobaciones, los límites o la seguridad, o acceder a datos de otras empresas.</li>
            <li>Extraer las instrucciones protegidas de las plantillas de {NOMBRE_COMERCIAL} o hacer ingeniería inversa del servicio.</li>
            <li>Incumplir las condiciones de las aplicaciones conectadas (por ejemplo, las de WhatsApp o Meta).</li>
          </ul>
          <p>Si detectamos un uso así, podemos pausar los agentes afectados o suspender la oficina, avisándote salvo que la gravedad lo impida.</p>
        </>
      ),
    },
    {
      id: "responsabilidades",
      titulo: "Responsabilidades",
      cuerpo: (
        <>
          <h3>De tu empresa</h3>
          <ul>
            <li>Los datos y contenidos que sube o conecta, y tener base legal para tratar los de sus clientes.</li>
            <li>La configuración de sus agentes, los permisos que concede y lo que aprueba.</li>
            <li>Cumplir la normativa que le aplique a su actividad y a sus comunicaciones.</li>
          </ul>
          <h3>De {NOMBRE_COMERCIAL}</h3>
          <ul>
            <li>Prestar el servicio con diligencia y mantener las medidas de seguridad descritas en la página de <Link href="/seguridad">seguridad</Link>.</li>
            <li>Tratar los datos de tus clientes solo como encargado y según el apartado siguiente.</li>
          </ul>
          <p>
            Los agentes usan modelos de IA que pueden cometer errores; no garantizamos resultados comerciales concretos. No respondemos de las
            caídas o cambios de servicios de terceros (como un CRM o Meta) ni de los daños causados por un uso contrario a estas condiciones.
          </p>
          <p><strong>Límite de responsabilidad:</strong> <Dato v={POLITICAS.limiteResponsabilidad} /></p>
        </>
      ),
    },
    {
      id: "encargo",
      titulo: "Contrato de encargo del tratamiento",
      cuerpo: (
        <>
          <p>
            Para los datos de los clientes y contactos de tu empresa, tu empresa es la responsable y {NOMBRE_COMERCIAL} el encargado del tratamiento
            (art. 28 RGPD). Este apartado forma parte de estas condiciones:
          </p>
          <ul>
            <li><strong>Objeto y duración:</strong> prestar {NOMBRE_PRODUCTO} mientras dure el servicio.</li>
            <li><strong>Datos e interesados:</strong> contacto, comunicaciones, historial comercial y documentos de los clientes, contactos y equipo de tu empresa.</li>
            <li><strong>Instrucciones:</strong> solo tratamos los datos para prestar el servicio y según tus instrucciones, que son la configuración de tu oficina.</li>
            <li><strong>Confidencialidad y seguridad:</strong> las personas que intervienen tienen deber de confidencialidad y aplicamos medidas adecuadas al riesgo.</li>
            <li><strong>Subencargados:</strong> autorizas los de la <Link href="/privacidad#destinatarios">política de privacidad</Link>; te avisaremos antes de cambiarlos y podrás oponerte.</li>
            <li><strong>Ayuda:</strong> te ayudamos a atender los derechos de los interesados y a cumplir tus obligaciones, y te avisamos sin dilación indebida de cualquier brecha.</li>
            <li><strong>Fin del servicio:</strong> borramos o devolvemos los datos, según elijas, salvo obligación legal de conservarlos.</li>
            <li><strong>Auditoría:</strong> te facilitamos la información necesaria para demostrar el cumplimiento.</li>
          </ul>
        </>
      ),
    },
    {
      id: "integraciones",
      titulo: "Aplicaciones conectadas",
      cuerpo: (
        <p>
          Al conectar una aplicación de terceros (CRM, correo, WhatsApp, Meta…), autorizas a tus agentes a usarla según los permisos que configures.
          Sus credenciales se guardan cifradas y puedes desconectarla cuando quieras. El uso de esa aplicación se rige también por sus propias
          condiciones.
        </p>
      ),
    },
    {
      id: "duracion",
      titulo: "Duración y baja",
      cuerpo: (
        <p>
          El servicio no tiene permanencia. Tu empresa puede dejar de usarlo cuando quiera y pedir la baja escribiendo a{" "}
          <Dato v={EMPRESA.emailContacto} />. Al darse de baja, se aplica lo indicado sobre el borrado de datos.
        </p>
      ),
    },
    {
      id: "cambios",
      titulo: "Cambios en estas condiciones",
      cuerpo: (
        <p>
          Podemos actualizar estas condiciones y las tarifas. Te avisaremos con <Dato v={POLITICAS.plazoPreaviso} /> de antelación. Los créditos ya
          comprados mantienen su caducidad.
        </p>
      ),
    },
    {
      id: "ley",
      titulo: "Ley aplicable y jurisdicción",
      cuerpo: <p>Estas condiciones se rigen por la legislación española. Para cualquier controversia, las partes se someten a <Dato v={EMPRESA.fuero} />.</p>,
    },
  ];

  return <DocumentoLegal titulo="Condiciones del servicio" actualizado={ULTIMA_ACTUALIZACION.condiciones} apartados={apartados} />;
}
