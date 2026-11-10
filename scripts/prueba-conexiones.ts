/**
 * Muestra el flujo completo de una conexión con el proveedor DEMO contra la base local (Vault real) y el servidor de desarrollo.
 * Ejecutar con: npm run prueba:conexiones   (necesita `npm run dev` en marcha y las variables CONEXIONES_* de .env.local)
 */
import { createClient } from "@supabase/supabase-js";
import { autenticadorSupabase } from "../src/lib/creditos/api.ts";
import { callbackHandler, desconectarHandler, faltantesHandler, iniciarHandler, type DepsApiConexiones } from "../src/lib/integraciones/api.ts";
import { obtenerCredenciales } from "../src/lib/integraciones/servicio.ts";

const env = process.env;
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "", key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("Solo contra la base LOCAL.");
const app = env.APP_URL ?? "http://localhost:3000";
const db = createClient(url, key, { auth: { persistSession: false } });
const api: DepsApiConexiones = { autenticar: autenticadorSupabase(db, env), deps: { db, env, fetch, ahora: () => new Date(), log: console } };
const oculta = (t: string) => `${t.slice(0, 8)}…(${t.length} caracteres, oculto)`;
const paso = (n: number, t: string) => console.log(`\n── ${n}. ${t}`);
const pedir = (ruta: string, init?: RequestInit) => new Request(`${app}${ruta}`, init);   // sin Authorization: persona de desarrollo (DEV_*)

paso(1, "GET /api/conexiones/demo/iniciar  (state firmado + PKCE; redirige a la pantalla de «Autorizar»)");
const ini = await iniciarHandler(pedir("/api/conexiones/demo/iniciar"), "demo", api);
const destino = ini.headers.get("location") ?? "";
const q = new URL(destino).searchParams;
console.log(`   ${ini.status} → ${new URL(destino).origin}${new URL(destino).pathname}`);
console.log(`   state: ${q.get("state")!.slice(0, 24)}… · code_challenge_method=${q.get("code_challenge_method")} · el code_verifier NO viaja en la URL (queda en el servidor)`);

paso(2, "Pantalla falsa de «Autorizar» (servidor web real)");
const pantalla = await fetch(destino);
const html = await pantalla.text();
console.log(`   GET ${pantalla.status} · contiene el aviso «Pantalla simulada»: ${html.includes("Pantalla simulada")} · botón Autorizar: ${html.includes("Autorizar")}`);

paso(3, "La persona pulsa «Autorizar» (POST del formulario) → 303 al callback con el código");
const form = new URLSearchParams({ decision: "autorizar" });
for (const k of ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope"]) if (q.get(k)) form.set(k, q.get(k)!);
const aut = await fetch(`${app}/api/demo-oauth/autorizar`, { method: "POST", body: form, redirect: "manual" });
const vuelta = aut.headers.get("location") ?? "";
console.log(`   ${aut.status} → ${vuelta.replace(/(code=)[^&]+/, "$1[oculto]")}`);

paso(4, "GET /api/conexiones/demo/callback  (valida el state, canjea el código con PKCE, guarda el secreto en Vault)");
const cb = await callbackHandler(pedir(new URL(vuelta).pathname + new URL(vuelta).search), "demo", api);
console.log(`   ${cb.status} → ${cb.headers.get("location")}`);

paso(5, "Qué hay guardado");
const { data: filas } = await db.from("company_connections").select("id, company_id, proveedor, estado, cuenta_externa, scopes, caduca_en, token_ref").eq("proveedor", "demo").eq("estado", "conectado");
const fila = filas![0];
console.log("   fila de company_connections:", { ...fila, token_ref: "(id de un secreto de Vault, no el token)" });
const cred = (await obtenerCredenciales(api.deps, fila.company_id, "demo"))!;
console.log(`   token (solo el servidor lo ve): ${oculta(cred.token)} · caduca ${cred.caducaEn}`);

paso(6, "Herramienta consultar_cuenta_demo con ese token (solo servidor, contra la «API» de la app demo)");
const cuenta = await fetch(`${app}/api/demo-oauth/cuenta`, { headers: { authorization: `Bearer ${cred.token}` } });
console.log(`   ${cuenta.status}`, await cuenta.json());

paso(7, "POST /api/conexiones/[id]/desconectar  (revoca el token en el proveedor y borra el secreto)");
const des = await desconectarHandler(pedir(`/api/conexiones/${fila.id}/desconectar`, { method: "POST" }), fila.id, api);
console.log(`   ${des.status}`, await des.json());
const tras = await fetch(`${app}/api/demo-oauth/cuenta`, { headers: { authorization: `Bearer ${cred.token}` } });
console.log(`   el token antiguo ahora responde ${tras.status} · obtenerCredenciales → ${(await obtenerCredenciales(api.deps, fila.company_id, "demo")) === null ? "null (sin credenciales)" : "¡todavía hay!"}`);

paso(8, "Los agentes que la necesitan");
const { data: ag } = await db.from("agent_tools").select("agent_id").eq("company_id", fila.company_id).eq("tool_id", "consultar_cuenta_demo").limit(1);
if (ag?.[0]) console.log("   ", await (await faltantesHandler(pedir(`/api/agentes/${ag[0].agent_id}/integraciones`), ag[0].agent_id, api)).json());
else console.log("   (ningún agente de la semilla tiene la herramienta demo; los tests lo cubren: «Falta conectar X» e «integración no conectada»)");
console.log("\nHecho. `npm run db:reset` limpia cualquier dato de prueba.");
