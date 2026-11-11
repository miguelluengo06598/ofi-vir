/** Configuración inicial del primer administrador (sin base de datos: Supabase simulado). Ejecutar: npm test */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claveCorrecta, claveDeInstalacion, configuracionAbierta, crearPrimerAdmin } from "./configuracionInicial.ts";

const CLAVE = "clave-de-instalacion-de-prueba-123456";

/** Supabase simulado: guarda si ya hay administrador y qué cuentas se crean o borran. */
function falso(opciones: { hayAdmin?: boolean; fallaRol?: string; fallaRpc?: boolean } = {}) {
  const estado = { hayAdmin: opciones.hayAdmin ?? false, creadas: [] as string[], borradas: [] as string[] };
  const db = {
    rpc: async (nombre: string) => {
      if (opciones.fallaRpc) return { data: null, error: { code: "XX000", message: "caída" } };
      if (nombre === "plataforma_tiene_admin") return { data: estado.hayAdmin, error: null };
      if (opciones.fallaRol) return { data: null, error: { code: "42501", message: opciones.fallaRol } };
      estado.hayAdmin = true;
      return { data: null, error: null };
    },
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          estado.creadas.push(email);
          return { data: { user: { id: `id-${email}` } }, error: null };
        },
        deleteUser: async (id: string) => {
          estado.borradas.push(id);
          return { error: null };
        },
      },
    },
  };
  return { db: db as unknown as SupabaseClient, estado };
}

const datos = (clave = CLAVE) => ({ nombre: "Miguel", email: "miguel@myofia.test", password: "una-contraseña-larga", clave, ip: null });

describe("configuración inicial", () => {
  let previa: string | undefined;
  beforeEach(() => { previa = process.env.CONFIGURACION_INICIAL_CLAVE; process.env.CONFIGURACION_INICIAL_CLAVE = CLAVE; });
  afterEach(() => { if (previa === undefined) delete process.env.CONFIGURACION_INICIAL_CLAVE; else process.env.CONFIGURACION_INICIAL_CLAVE = previa; });

  it("crea el primer administrador y después queda cerrada", async () => {
    const { db, estado } = falso();
    assert.equal(await configuracionAbierta(db), true);
    assert.deepEqual(await crearPrimerAdmin(db, datos()), { ok: true, userId: "id-miguel@myofia.test" });
    assert.equal(await configuracionAbierta(db), false);
    const segundo = await crearPrimerAdmin(db, { ...datos(), email: "otra@myofia.test" });
    assert.deepEqual(segundo, { ok: false, motivo: "cerrada" });
    assert.deepEqual(estado.creadas, ["miguel@myofia.test"], "el segundo intento no llega a crear cuenta");
  });

  it("sin clave configurada, o corta, no deja crear nada", async () => {
    const { db, estado } = falso();
    delete process.env.CONFIGURACION_INICIAL_CLAVE;
    assert.deepEqual(await crearPrimerAdmin(db, datos()), { ok: false, motivo: "sin_clave" });
    process.env.CONFIGURACION_INICIAL_CLAVE = "corta";
    assert.equal(claveDeInstalacion(), null);
    assert.deepEqual(await crearPrimerAdmin(db, datos("corta")), { ok: false, motivo: "sin_clave" });
    assert.equal(estado.creadas.length, 0);
  });

  it("con la clave incorrecta no crea cuenta", async () => {
    const { db, estado } = falso();
    assert.deepEqual(await crearPrimerAdmin(db, datos("otra-clave-cualquiera-de-24-caracteres")), { ok: false, motivo: "clave_incorrecta" });
    assert.equal(estado.creadas.length, 0);
  });

  it("si otra petición gana la carrera, borra la cuenta recién creada", async () => {
    const { db, estado } = falso({ fallaRol: "YA_CONFIGURADO: la plataforma ya tiene un administrador" });
    assert.deepEqual(await crearPrimerAdmin(db, datos()), { ok: false, motivo: "cerrada" });
    assert.deepEqual(estado.borradas, ["id-miguel@myofia.test"]);
  });

  it("si la base no responde, se considera cerrada (nunca abre por defecto)", async () => {
    const { db } = falso({ fallaRpc: true });
    assert.equal(await configuracionAbierta(db), false);
  });

  it("compara la clave en tiempo constante y exige la misma longitud", () => {
    assert.equal(claveCorrecta(CLAVE, CLAVE), true);
    assert.equal(claveCorrecta(CLAVE.slice(0, -1), CLAVE), false);
    assert.equal(claveCorrecta("", CLAVE), false);
  });
});
