/**
 * Datos legales de la empresa titular, ÚNICA fuente para las páginas legales y el pie.
 * Todo lo que va entre corchetes es un marcador pendiente de rellenar: se muestra resaltado en la web
 * hasta que se sustituya. No inventar ningún dato: si no se sabe, se deja el marcador.
 */

export const NOMBRE_PRODUCTO = "MyOfia";
export const NOMBRE_COMERCIAL = "MyOfia";

export const EMPRESA = {
  razonSocial: "[RAZÓN SOCIAL DE MyOfia]",
  nif: "[NIF]",
  domicilio: "[DOMICILIO]",
  emailContacto: "[EMAIL DE CONTACTO]",
  /** Dirección para ejercer los derechos de protección de datos (puede ser la de contacto). */
  emailPrivacidad: "[EMAIL PARA PRIVACIDAD Y DERECHOS]",
  datosRegistrales: "[DATOS REGISTRALES]",
  /** Dominio público del sitio, p. ej. «oficinavirtual.example». */
  dominio: "[DOMINIO DEL SITIO]",
  /** Delegado de protección de datos: su contacto, o «No designado» si no es obligatorio. */
  delegadoProteccionDatos: "[DELEGADO DE PROTECCIÓN DE DATOS O «NO DESIGNADO»]",
  /** Tribunales competentes para empresas clientes (las condiciones son entre empresas). */
  fuero: "[TRIBUNALES COMPETENTES]",
} as const;

/** Decisiones de negocio que el texto legal necesita y que no se pueden deducir del producto. */
export const POLITICAS = {
  reembolsos: "[POLÍTICA DE REEMBOLSOS DE CRÉDITOS]",
  plazoSolicitudesAcceso: "[PLAZO DE CONSERVACIÓN DE LAS SOLICITUDES DE ACCESO NO CONVERTIDAS]",
  plazoPreaviso: "[PREAVISO PARA CAMBIOS EN LAS CONDICIONES]",
  limiteResponsabilidad: "[LÍMITE DE RESPONSABILIDAD]",
  plazoRegistrosTecnicos: "[PLAZO DE CONSERVACIÓN DE LOS REGISTROS TÉCNICOS Y DE SEGURIDAD]",
} as const;

export type Encargado = { nombre: string; servicio: string; datos: string; ubicacion: string; garantia: string; activo: boolean };

/**
 * Encargados del tratamiento (subencargados de los datos de los clientes). La región y la garantía de
 * transferencia hay que confirmarlas con cada contrato (DPA) antes de publicar.
 */
export const ENCARGADOS: Encargado[] = [
  {
    nombre: "Supabase",
    servicio: "Base de datos, autenticación y almacenamiento de archivos",
    datos: "Todos los datos de la cuenta y de la oficina",
    ubicacion: "[REGIÓN DE SUPABASE]",
    garantia: "[GARANTÍA DE TRANSFERENCIA DE SUPABASE]",
    activo: true,
  },
  {
    nombre: "Vercel",
    servicio: "Alojamiento y ejecución de la aplicación web",
    datos: "Datos que pasan por la aplicación y registros técnicos",
    ubicacion: "[REGIÓN DE VERCEL]",
    garantia: "[GARANTÍA DE TRANSFERENCIA DE VERCEL]",
    activo: true,
  },
  {
    nombre: "Anthropic",
    servicio: "Modelos de IA (Claude) que redactan y analizan",
    datos: "El texto que necesita cada tarea: mensajes, fichas y fragmentos de la memoria",
    ubicacion: "[UBICACIÓN DEL TRATAMIENTO DE ANTHROPIC]",
    garantia: "[GARANTÍA DE TRANSFERENCIA DE ANTHROPIC]",
    activo: true,
  },
  {
    nombre: "Resend",
    servicio: "Envío y recepción de correo electrónico",
    datos: "Direcciones, asunto y contenido de los correos",
    ubicacion: "[UBICACIÓN DEL TRATAMIENTO DE RESEND]",
    garantia: "[GARANTÍA DE TRANSFERENCIA DE RESEND]",
    activo: true,
  },
  {
    nombre: "Voyage AI",
    servicio: "Representación numérica del texto (embeddings) para buscar en la memoria",
    datos: "Fragmentos de texto de la memoria y del conocimiento",
    ubicacion: "[UBICACIÓN DEL TRATAMIENTO DE VOYAGE AI]",
    garantia: "[GARANTÍA DE TRANSFERENCIA DE VOYAGE AI]",
    activo: true,
  },
  {
    nombre: "Stripe",
    servicio: "Cobro de packs y suscripciones (cuando se active el pago)",
    datos: "Datos de facturación y del pago; los datos de la tarjeta los trata solo Stripe",
    ubicacion: "[UBICACIÓN DEL TRATAMIENTO DE STRIPE]",
    garantia: "[GARANTÍA DE TRANSFERENCIA DE STRIPE]",
    activo: false,
  },
];

/** Fecha de la última revisión de cada documento (AAAA-MM-DD). Actualizarla al cambiar el texto. */
export const ULTIMA_ACTUALIZACION = {
  avisoLegal: "2026-11-10",
  privacidad: "2026-11-10",
  cookies: "2026-11-10",
  condiciones: "2026-11-10",
} as const;

/** Un texto es un marcador sin rellenar si va entero entre corchetes. */
export const esMarcador = (texto: string) => /^\[[^\]]+\]$/.test(texto.trim());

/** Marcadores que siguen sin rellenar (para revisarlos antes de publicar). */
export function marcadoresPendientes(): string[] {
  const textos = [
    ...Object.values(EMPRESA),
    ...Object.values(POLITICAS),
    ...ENCARGADOS.flatMap((e) => [e.ubicacion, e.garantia]),
  ];
  return [...new Set(textos.filter(esMarcador))];
}
