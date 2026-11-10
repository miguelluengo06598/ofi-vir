import { z } from "zod";
import { ToolError } from "../../agents/tools.ts";
import { integracionNoConectada } from "./integraciones.ts";
import { definir } from "./tipos.ts";

/**
 * Herramienta de la aplicación de DEMOSTRACIÓN (solo para probar el marco de conexiones en local). Lee la cuenta de la «aplicación demo»
 * con el token de la empresa: sirve para comprobar de punta a punta que el ejecutor obtiene credenciales y que, sin conexión, no funciona.
 */
export const HERRAMIENTAS_DEMO = [
  definir({
    id: "consultar_cuenta_demo",
    nombre: "Consultar la cuenta de la aplicación demo",
    descripcionClaude: "Consulta el nombre de la cuenta conectada en la aplicación de demostración. Solo lectura.",
    descripcionEmpresa: "Herramienta de prueba: lee la cuenta de la aplicación de demostración. Solo para probar conexiones en local.",
    entrada: z.object({}),
    salida: z.object({ cuenta: z.string(), scopes: z.array(z.string()) }),
    categoria: "interna", sensibilidad: "lectura", integracion: "demo", costeCreditos: null, datosExternos: true,
    async ejecutar(ctx) {
      const token = await ctx.secretos.token("demo");
      if (!token) return integracionNoConectada("la aplicación de demostración");
      // Misma regla que urlDeLaApp (integraciones/proveedores.ts; no se importa para no crear un ciclo con el registro).
      const base = process.env.APP_URL?.trim().replace(/\/+$/, "") || (process.env.NODE_ENV === "production" ? null : "http://localhost:3000");
      if (!base) throw new ToolError("Falta APP_URL: la aplicación de demostración no tiene dirección.");
      let res: Response;
      try {
        res = await fetch(`${base}/api/demo-oauth/cuenta`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      } catch {
        throw new ToolError("La aplicación de demostración no responde.");
      }
      if (res.status === 401) throw new ToolError("La aplicación de demostración rechazó la conexión: hay que volver a conectarla.");
      if (!res.ok) throw new ToolError("La aplicación de demostración devolvió un error.");
      return z.object({ cuenta: z.string(), scopes: z.array(z.string()) }).parse(await res.json());
    },
    simular: () => ({ cuenta: "Cuenta demo (simulada)", scopes: ["cuenta.leer"] }),
  }),
];
