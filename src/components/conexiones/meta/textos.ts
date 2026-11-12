/**
 * Textos de la conexión con Facebook en lenguaje normal. La interfaz nunca habla de «tokens», «webhooks» ni «scopes»:
 * el servidor guarda códigos y aquí se explican.
 */

/** Qué permite cada permiso de Facebook, dicho para una persona. */
export const PERMISO: Record<string, string> = {
  leads_retrieval: "Leer los datos que deja cada persona en tus formularios",
  pages_show_list: "Ver la lista de tus páginas",
  pages_read_engagement: "Leer la información de tus páginas",
  pages_manage_metadata: "Avisarnos en el momento en que llega un contacto nuevo",
  ads_management: "Saber de qué anuncio y campaña viene cada contacto",
  pages_manage_ads: "Leer los datos de los anuncios de tus páginas",
};

/** Aviso de una página según el código guardado. `volverAConectar` = el arreglo es conectar Facebook otra vez. */
export function avisoDePagina(codigo: string | null, estado: string): { texto: string; volverAConectar: boolean } | null {
  if (codigo === "acceso_leads" || (estado === "sin_permiso_leads" && !codigo)) {
    return { texto: "Tu página limita el acceso a los clientes potenciales: da acceso a MyOfia en la configuración de acceso a clientes potenciales de tu Business Manager y vuelve a marcar la página.", volverAConectar: false };
  }
  if (codigo === "no_puede_anunciar") {
    return { texto: "La persona que conectó Facebook no puede anunciar en esta página. Pide ese permiso en la página, o que la conecte quien lo tenga.", volverAConectar: true };
  }
  if (codigo === "permiso_caducado" || estado === "token_caducado") return { texto: "El permiso ha caducado: vuelve a conectar.", volverAConectar: true };
  if (codigo === "ya_no_autorizada") return { texto: "Esta página ya no está entre las que autorizaste. Vuelve a conectar y márcala en Facebook si quieres seguir recibiendo sus contactos.", volverAConectar: true };
  if (codigo === "demasiadas_peticiones") return { texto: "Facebook nos pide esperar un poco. Inténtalo de nuevo en unos minutos.", volverAConectar: false };
  if (codigo === "error_temporal") return { texto: "Facebook no respondió bien la última vez. Inténtalo de nuevo.", volverAConectar: false };
  if (estado === "desconectada") return { texto: codigo ?? "Esta página está desconectada.", volverAConectar: true };
  return null;
}

export const RESULTADO: Record<string, string> = {
  ok: "Facebook conectado. Marca las páginas de las que quieres recibir contactos.",
  faltan_permisos: "Facebook se ha conectado, pero faltan permisos para poder recibir tus contactos.",
  sin_paginas: "Facebook se ha conectado, pero no has autorizado ninguna página. Vuelve a conectar y elige al menos una.",
};

export const hace = (iso: string | null, ahora = Date.now()) => {
  if (!iso) return "todavía ninguno";
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / (60 * 24))} días`;
};
