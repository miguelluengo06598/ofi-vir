/**
 * Cookies y almacenamiento del navegador: única lista, la usan la política de cookies y el banner.
 *
 * Hoy solo hay elementos técnicos, exentos de consentimiento (art. 22.2 LSSI). Para añadir analítica:
 *   1. Añadir sus cookies a COOKIES con `categoria: "analitica"` y su proveedor.
 *   2. Cargar su script SOLO con <ScriptConConsentimiento categoria="analitica" …/> (nunca con un <script> directo).
 *   3. Poner CONSENTIMIENTO_ACTIVADO = true: el banner aparece y pide permiso ANTES de cargar nada.
 *   4. Actualizar la política de cookies y su fecha.
 */

export type CategoriaCookie = "tecnica" | "analitica";
export type CategoriaOpcional = Exclude<CategoriaCookie, "tecnica">;

export type ElementoAlmacenado = {
  nombre: string;
  tipo: "cookie" | "localStorage";
  categoria: CategoriaCookie;
  proveedor: string;
  finalidad: string;
  duracion: string;
};

export const COOKIES: ElementoAlmacenado[] = [
  {
    nombre: "sb-<proyecto>-auth-token (puede dividirse en .0, .1…)",
    tipo: "cookie",
    categoria: "tecnica",
    proveedor: "Propia (sesión gestionada con Supabase)",
    finalidad: "Mantener tu sesión iniciada en la oficina. Solo se crea al iniciar sesión.",
    duracion: "Mientras dure la sesión; se renueva al usarla y se borra al cerrar sesión.",
  },
  {
    nombre: "empresa_activa",
    tipo: "cookie",
    categoria: "tecnica",
    proveedor: "Propia",
    finalidad: "Recordar con qué empresa estás trabajando si perteneces a varias.",
    duracion: "30 días",
  },
  {
    nombre: "oficina-escena",
    tipo: "localStorage",
    categoria: "tecnica",
    proveedor: "Propia",
    finalidad: "Recordar la escena de fondo que eliges en la oficina (día, atardecer o noche).",
    duracion: "Hasta que la borres desde tu navegador.",
  },
];

export const CATEGORIAS: Record<CategoriaCookie, { nombre: string; descripcion: string }> = {
  tecnica: { nombre: "Técnicas", descripcion: "Necesarias para que la web funcione. No requieren consentimiento." },
  analitica: { nombre: "Analítica", descripcion: "Nos ayudan a saber cómo se usa la web. Solo se usan si las aceptas." },
};

/** Desactivado: no hay cookies opcionales. Activarlo solo junto con el paso 1 de arriba. */
export const CONSENTIMIENTO_ACTIVADO = false;

/** Si cambia la lista de cookies opcionales, subir la versión para volver a preguntar. */
export const VERSION_CONSENTIMIENTO = 1;

export const categoriasOpcionales = (): CategoriaOpcional[] =>
  [...new Set(COOKIES.map((c) => c.categoria))].filter((c): c is CategoriaOpcional => c !== "tecnica");
