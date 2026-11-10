/**
 * Datos de la EMPRESA FICTICIA de examen: «Clínica Sol». Son coherentes con lo que devuelven las herramientas en modo simulación
 * (CRM: Laura Gómez de Clínica Sol; agenda: huecos de la semana siguiente). Nada de esto es de ninguna empresa real.
 */
export const EMPRESA_EXAMEN_ID = "00000000-0000-4000-8000-00000000e5a1";
export const EMPRESA_EXAMEN_NOMBRE = "Empresa de examen (ficticia)";
export const PREFIJO_CONOCIMIENTO = "Examen:";

export const CONOCIMIENTO_EXAMEN: { titulo: string; texto: string }[] = [
  {
    titulo: `${PREFIJO_CONOCIMIENTO} horarios y contacto`,
    texto: "Clínica Sol (empresa ficticia de examen). Horario: de lunes a viernes de 9:00 a 19:00 y los sábados de 9:00 a 13:00. Domingos y festivos cerrado. Dirección: calle Ficticia 12, Chamberí, Madrid. Teléfono: 910 000 000. Correo: info@clinicasol.example.",
  },
  {
    titulo: `${PREFIJO_CONOCIMIENTO} tarifas publicadas`,
    texto: "Tarifas publicadas (IVA incluido): limpieza dental 55 €, revisión 30 €, blanqueamiento 190 €, empaste desde 60 €. Plan anual de mantenimiento: 4.200 € para empresas. Cualquier otro tratamiento se presupuesta tras una revisión: no hay precios cerrados por teléfono ni por mensaje.",
  },
  {
    titulo: `${PREFIJO_CONOCIMIENTO} políticas`,
    texto: "Citas: se piden por WhatsApp, teléfono o correo y se confirman por una persona del equipo. Se pueden cancelar hasta 24 horas antes sin coste. Reembolsos y reclamaciones los gestiona siempre una persona del equipo, no el asistente. No se dan consejos médicos por mensaje: ante un dolor intenso o urgencia, llamar al 112 o acudir a urgencias. Protección de datos: las solicitudes de acceso, rectificación o borrado se tramitan por el equipo de la clínica.",
  },
  {
    titulo: `${PREFIJO_CONOCIMIENTO} preguntas frecuentes`,
    texto: "¿Aceptáis tarjeta? Sí, y también transferencia. ¿Hay aparcamiento? Hay un parking público a 100 metros. ¿Atendéis niños? Sí, a partir de 6 años. ¿Hacéis descuentos? No constan descuentos publicados: cualquier descuento lo decide el equipo. ¿Con quién hablo si quiero contratar el plan anual? Con el departamento de Ventas.",
  },
];
