/**
 * Panel interno de certificación contra la base LOCAL real: cola y filtros, asignación por categorías, decisión con lista de
 * comprobación, segunda opinión obligatoria, «pedir cambios», activación automática, plantillas, métricas y que ninguna empresa puede
 * leer ni ejecutar nada de esto (RLS y permisos). Ejecutar: npm run test:panel
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { sesionRevisor, type SesionRevisor } from "../../src/lib/admin/certificacion/acceso.ts";
import { CHECKLIST, type PuntoId, type PuntoRevisado } from "../../src/lib/admin/certificacion/config.ts";
import { decidir, detalleDePlantilla, detalleDeSolicitud, listarCola, metricasDelEquipo, RevisionError, soltarSolicitud, tomarSolicitud } from "../../src/lib/admin/certificacion/servicio.ts";
import { clienteLocal } from "../ayuda/clienteLocal.ts";

const { db, url } = clienteLocal();
const DIA = 86_400_000;
const lista = (fallos: PuntoId[] = []): PuntoRevisado[] => CHECKLIST.map((p) => ({ id: p.id, ok: !fallos.includes(p.id) }));
const codigo = (c: string) => (e: unknown) => e instanceof RevisionError && e.codigo === c;

const empresas: string[] = [], revisores: string[] = [], plantillas: string[] = [];
after(async () => {
  // Nada de esto debe quedarse en la cola ni en el selector de revisores de la base local.
  if (empresas.length) await db.from("certification_requests").update({ estado: "cancelada", resuelto_en: new Date().toISOString(), asignado_a: null }).in("company_id", empresas).in("estado", ["pendiente_examen", "pendiente_revision", "en_revision", "segunda_opinion"]);
  if (plantillas.length) {
    await db.from("template_review_requests").update({ estado: "cancelada", resuelto_en: new Date().toISOString(), asignado_a: null }).in("template_id", plantillas).in("estado", ["pendiente_revision", "en_revision", "segunda_opinion"]);
    await db.from("agent_templates").update({ activa: false }).in("id", plantillas);
  }
  if (revisores.length) await db.from("reviewers").update({ activo: false }).in("user_id", revisores);
  await db.from("notifications").delete().in("company_id", empresas.length ? empresas : [randomUUID()]);
});

async function revisor(categorias: string[], rol: "revisor_samgple" | "admin_samgple" = "revisor_samgple"): Promise<SesionRevisor> {
  const nombre = `Prueba ${randomUUID().slice(0, 6)}`;
  const { data, error } = await db.auth.admin.createUser({ email: `rev-${randomUUID().slice(0, 10)}@samgple.example`, password: randomUUID(), email_confirm: true });
  assert.ifError(error);
  const userId = data.user!.id;
  assert.ifError((await db.from("reviewers").insert({ user_id: userId, rol, nombre, categorias })).error);
  revisores.push(userId);
  return { userId, rol, nombre, categorias, esDeDesarrollo: false };
}

/** Una empresa con un agente en certificación y su solicitud pendiente de revisión. */
async function solicitud(o: { tipoDepartamento?: string; herramientas?: { tool_id: string; permiso: string }[]; via?: string; enColaHace?: number; activar?: boolean } = {}) {
  const companyId = randomUUID(), departmentId = randomUUID(), agentId = randomUUID(), tipo = o.tipoDepartamento ?? "atencion";
  assert.ifError((await db.from("companies").insert({ id: companyId, name: `test-panel ${companyId.slice(0, 6)}` })).error);
  empresas.push(companyId);
  assert.ifError((await db.from("departments").insert({ id: departmentId, company_id: companyId, name: "Departamento", slug: `d-${companyId.slice(0, 6)}`, tipo })).error);
  assert.ifError((await db.from("agents").insert({ id: agentId, company_id: companyId, department_id: departmentId, slug: `a-${agentId.slice(0, 8)}`, name: "Nora", role: "Atención", creator_name: "Empresa", model: "claude-haiku-5-5", objetivo: "Atender dudas", estado: "en_certificacion" })).error);
  if (o.herramientas?.length) assert.ifError((await db.from("agent_tools").insert(o.herramientas.map((h) => ({ ...h, agent_id: agentId, company_id: companyId })))).error);
  const enCola = new Date(Date.now() - (o.enColaHace ?? 1) * 3_600_000).toISOString();
  const r = await db.from("certification_requests").insert({ company_id: companyId, agent_id: agentId, agent_version: 1, tipo: "nueva", via: o.via ?? "completa", estado: "pendiente_revision", enviado_en: enCola, en_cola_desde: enCola, activar_al_aprobar: o.activar ?? false }).select("id").single();
  assert.ifError(r.error);
  return { companyId, agentId, id: r.data!.id as string, ref: { clase: "agente" as const, id: r.data!.id as string } };
}
const fila = async (id: string) => (await db.from("certification_requests").select("*").eq("id", id).single()).data as Record<string, unknown>;
const agente = async (id: string) => (await db.from("agents").select("estado, version_certificada, certificado_hasta").eq("id", id).single()).data as Record<string, unknown>;
const avisos = async (companyId: string) => ((await db.from("notifications").select("titulo, cuerpo, metadatos").eq("company_id", companyId).eq("tipo", "certificacion_estado").order("creado_en")).data ?? []) as { titulo: string; cuerpo: string; metadatos: Record<string, unknown> }[];
const aprobar = (s: SesionRevisor, ref: { clase: "agente" | "plantilla"; id: string }, comentario?: string) => decidir(db, s, { ...ref, decision: "aprobar", checklist: lista(), comentario });

describe("cola de revisión", () => {
  it("ordena por antigüedad, marca las que superan el plazo de su vía y filtra por tipo, vía, departamento y empresa", async () => {
    const yo = await revisor(["atencion", "ventas"]);
    const vieja = await solicitud({ enColaHace: 24 * 12, via: "completa" });                          // 12 días: fuera de plazo seguro
    const rapida = await solicitud({ enColaHace: 24 * 9, via: "rapida_plantilla", tipoDepartamento: "ventas" });
    const reciente = await solicitud({ enColaHace: 0.2 });
    const ajena = await solicitud({ tipoDepartamento: "marketing" });
    const cola = await listarCola(db, yo);
    const mias = [vieja, rapida, reciente, ajena].map((s) => cola.enCola.findIndex((f) => f.id === s.id));
    assert.ok(mias.every((i) => i >= 0), "las cuatro están en la cola");
    assert.ok(mias[0]! < mias[1]! && mias[1]! < mias[2]!, "de la más antigua a la más reciente");
    const de = (s: { id: string }) => cola.enCola.find((f) => f.id === s.id)!;
    assert.equal(de(vieja).espera.fueraDePlazo, true); assert.equal(de(vieja).espera.plazo, 48);
    assert.equal(de(rapida).espera.fueraDePlazo, true); assert.equal(de(rapida).espera.plazo, 24);
    assert.equal(de(reciente).espera.fueraDePlazo, false);
    assert.equal(de(reciente).puedeCoger, true);
    assert.equal(de(ajena).puedeCoger, false); assert.match(de(ajena).motivoNoCoger!, /categoría/);
    assert.equal(de(vieja).empresa?.startsWith("test-panel"), true);

    const soloRapidas = await listarCola(db, yo, { via: "rapida_plantilla" });
    assert.ok(soloRapidas.enCola.some((f) => f.id === rapida.id) && soloRapidas.enCola.every((f) => f.via === "rapida_plantilla"));
    const soloVentas = await listarCola(db, yo, { departamento: "ventas" });
    assert.ok(soloVentas.enCola.some((f) => f.id === rapida.id) && soloVentas.enCola.every((f) => f.departamento === "ventas"));
    const deUnaEmpresa = await listarCola(db, yo, { empresa: vieja.companyId });
    assert.deepEqual(deUnaEmpresa.enCola.map((f) => f.id), [vieja.id]);
    assert.equal((await listarCola(db, yo, { tipo: "periodica", empresa: vieja.companyId })).enCola.length, 0);
    // Un plazo configurado más largo quita la marca.
    const conPlazoLargo = await listarCola(db, yo, { empresa: vieja.companyId }, new Date(), { REVISION_PLAZO_COMPLETA_HORAS: "1000" });
    assert.equal(conPlazoLargo.enCola[0]!.espera.fueraDePlazo, false);
  });
});

describe("asignación", () => {
  it("coger pasa a «en revisión» y queda asignada; solo en sus categorías; nadie más la coge; se puede devolver", async () => {
    const elena = await revisor(["atencion"]), diego = await revisor(["atencion"]), marketing = await revisor(["marketing"]);
    const s = await solicitud();
    await assert.rejects(tomarSolicitud(db, marketing, s.ref), codigo("categoria_no_asignada"));
    assert.equal(await tomarSolicitud(db, elena, s.ref), "en_revision");
    let f = await fila(s.id);
    assert.equal(f.estado, "en_revision"); assert.equal(f.asignado_a, elena.userId); assert.ok(f.asignado_en);
    await assert.rejects(tomarSolicitud(db, diego, s.ref), codigo("ya_asignada"));
    await assert.rejects(aprobar(diego, s.ref), codigo("no_asignada"), "quien no la tiene asignada no decide");
    const cola = await listarCola(db, elena);
    assert.ok(cola.mias.some((x) => x.id === s.id) && !cola.enCola.some((x) => x.id === s.id));
    assert.ok((await listarCola(db, diego)).asignadas.some((x) => x.id === s.id && x.asignadoNombre === elena.nombre));
    await assert.rejects(soltarSolicitud(db, diego, s.ref), codigo("no_asignada"));
    await soltarSolicitud(db, elena, s.ref);
    f = await fila(s.id);
    assert.equal(f.estado, "pendiente_revision"); assert.equal(f.asignado_a, null);
    assert.equal(await tomarSolicitud(db, diego, s.ref), "en_revision");
  });
  it("un revisor inactivo o alguien que no es revisor no coge nada", async () => {
    const baja = await revisor(["atencion"]);
    await db.from("reviewers").update({ activo: false }).eq("user_id", baja.userId);
    const s = await solicitud();
    await assert.rejects(tomarSolicitud(db, baja, s.ref), codigo("revisor_no_valido"));
    await assert.rejects(tomarSolicitud(db, { ...baja, userId: randomUUID() }, s.ref), codigo("revisor_no_valido"));
    assert.equal((await fila(s.id)).estado, "pendiente_revision");
  });
});

describe("decisión", () => {
  it("aprobar: exige los 9 puntos cumplidos; crea la certificación de 6 meses, el agente queda «certificado» y se avisa a la empresa", async () => {
    const elena = await revisor(["atencion"]);
    const s = await solicitud();
    await tomarSolicitud(db, elena, s.ref);
    await assert.rejects(decidir(db, elena, { ...s.ref, decision: "aprobar", checklist: lista(["rgpd"]) }), codigo("checklist_incompleta"));
    await assert.rejects(decidir(db, elena, { ...s.ref, decision: "aprobar", checklist: lista().slice(0, 8) }), codigo("checklist_invalida"));
    // La base lo impide también si el servidor no lo hubiera comprobado.
    const directo = await db.rpc("revision_decidir", { p_request_id: s.id, p_revisor: elena.userId, p_decision: "aprobar", p_checklist: lista(["rgpd"]), p_comentario: null, p_notas: null });
    assert.match(directo.error?.message ?? "", /CHECKLIST_INCOMPLETA/);
    assert.equal((await db.from("certification_reviews").select("id", { count: "exact", head: true }).eq("request_id", s.id)).count, 0, "un intento rechazado no deja revisión");

    const d = await detalleDeSolicitud(db, elena, s.id);
    assert.deepEqual(d!.motivosSegundaOpinion, [], "sin herramientas sensibles: no hace falta segunda opinión");
    const r = await decidir(db, elena, { ...s.ref, decision: "aprobar", checklist: lista(), comentario: "Todo correcto.", notas: "NOTA-INTERNA: cliente nuevo" });
    assert.deepEqual(r, { estado: "aprobada", segundaOpinion: false });
    const a = await agente(s.agentId);
    assert.equal(a.estado, "certificado"); assert.equal(a.version_certificada, 1);
    const meses = (new Date(a.certificado_hasta as string).getTime() - Date.now()) / (30 * DIA);
    assert.ok(meses > 5.8 && meses < 6.3);
    const { data: cert } = await db.from("certifications").select("estado, agent_version, request_id").eq("agent_id", s.agentId);
    assert.deepEqual(cert, [{ estado: "vigente", agent_version: 1, request_id: s.id }]);
    const ultimo = (await avisos(s.companyId)).at(-1)!;
    assert.match(ultimo.titulo, /Nora está certificado/); assert.match(ultimo.cuerpo, /Ya puedes activarlo\./); assert.match(ultimo.cuerpo, /Comentario del revisor: Todo correcto\./);
    assert.ok(!JSON.stringify(await avisos(s.companyId)).includes("NOTA-INTERNA"), "las notas internas no llegan a la empresa");
    await assert.rejects(aprobar(elena, s.ref), codigo("no_asignada"), "una solicitud cerrada no se vuelve a decidir");
  });

  it("si la empresa lo dejó marcado al enviarlo, al aprobar se activa solo", async () => {
    const elena = await revisor(["atencion"]);
    const s = await solicitud({ activar: true });
    await tomarSolicitud(db, elena, s.ref);
    await aprobar(elena, s.ref);
    assert.equal((await agente(s.agentId)).estado, "activo");
    assert.equal((await db.rpc("agente_puede_trabajar", { p_agent_id: s.agentId })).data, true);
    assert.match((await avisos(s.companyId)).at(-1)!.cuerpo, /Se ha activado, como pediste al enviarlo\./);
  });

  it("pedir cambios: comentario obligatorio; el agente vuelve a «en pruebas» y la empresa recibe el comentario", async () => {
    const elena = await revisor(["atencion"]);
    const s = await solicitud();
    await tomarSolicitud(db, elena, s.ref);
    await assert.rejects(decidir(db, elena, { ...s.ref, decision: "pedir_cambios", checklist: lista(["aviso_ia"]) }), codigo("comentario_obligatorio"));
    await assert.rejects(decidir(db, elena, { ...s.ref, decision: "pedir_cambios", checklist: lista(["aviso_ia"]), comentario: "   " }), codigo("comentario_obligatorio"));
    const r = await decidir(db, elena, { ...s.ref, decision: "pedir_cambios", checklist: lista(["aviso_ia"]), comentario: "Configura el aviso de IA." });
    assert.deepEqual(r, { estado: "cambios_solicitados", segundaOpinion: false });
    assert.equal((await agente(s.agentId)).estado, "en_pruebas");
    const ultimo = (await avisos(s.companyId)).at(-1)!;
    assert.match(ultimo.titulo, /Hay que hacer cambios en Nora/); assert.match(ultimo.cuerpo, /Configura el aviso de IA\./);
    assert.equal((await fila(s.id)).comentario_empresa, "Configura el aviso de IA.");
  });
});

describe("segunda opinión obligatoria", () => {
  const sensibles: [string, { tool_id: string; permiso: string }[], RegExp][] = [
    ["escribe en el CRM", [{ tool_id: "crear_contacto_crm", permiso: "aprobacion" }], /CRM/],
    ["envía mensajes externos sin aprobación", [{ tool_id: "responder_whatsapp", permiso: "sola" }], /sin aprobación/],
  ];
  for (const [nombre, herramientas, motivo] of sensibles) {
    it(`un agente que ${nombre}: aprobar no lo cierra; lo cierra OTRA persona`, async () => {
      const elena = await revisor(["atencion"]), diego = await revisor(["atencion"]);
      const s = await solicitud({ herramientas });
      await tomarSolicitud(db, elena, s.ref);
      const r1 = await aprobar(elena, s.ref, "Me parece bien.");
      assert.deepEqual(r1, { estado: "segunda_opinion", segundaOpinion: true });
      assert.equal((await agente(s.agentId)).estado, "en_certificacion", "todavía no está certificado");
      let f = await fila(s.id);
      assert.equal(f.estado, "segunda_opinion"); assert.equal(f.primer_revisor, elena.userId); assert.equal(f.asignado_a, null);
      assert.match(JSON.stringify(f.segunda_opinion_motivos), motivo);
      await assert.rejects(tomarSolicitud(db, elena, s.ref), codigo("mismo_revisor"), "la primera persona no puede dar la segunda opinión");
      const cola = await listarCola(db, elena, { empresa: s.companyId });
      assert.equal(cola.enCola[0]!.puedeCoger, false);
      assert.equal((await listarCola(db, diego, { empresa: s.companyId })).enCola[0]!.puedeCoger, true);

      assert.equal(await tomarSolicitud(db, diego, s.ref), "segunda_opinion");
      const r2 = await aprobar(diego, s.ref);
      assert.deepEqual(r2, { estado: "aprobada", segundaOpinion: false });
      assert.equal((await agente(s.agentId)).estado, "certificado");
      f = await fila(s.id);
      assert.equal(f.comentario_empresa, "Me parece bien.", "si la segunda no comenta, vale el comentario de la primera");
      const { data: revs } = await db.from("certification_reviews").select("revisor_id, rol, decision").eq("request_id", s.id).order("creado_en");
      assert.deepEqual(revs, [{ revisor_id: elena.userId, rol: "principal", decision: "aprobar" }, { revisor_id: diego.userId, rol: "segunda_opinion", decision: "aprobar" }]);
    });
  }

  it("la base no deja saltársela: aunque el servidor dijera que no hace falta, un rechazo siempre pasa por otra persona", async () => {
    const elena = await revisor(["atencion"]), diego = await revisor(["atencion"]);
    const s = await solicitud();
    await tomarSolicitud(db, elena, s.ref);
    const r = await decidir(db, elena, { ...s.ref, decision: "rechazar", checklist: lista(["objetivo"]), comentario: "El objetivo no es realista." });
    assert.deepEqual(r, { estado: "segunda_opinion", segundaOpinion: true });
    assert.equal((await agente(s.agentId)).estado, "en_certificacion");
    assert.equal((await avisos(s.companyId)).some((n) => n.metadatos.estado === "rechazada"), false, "la empresa aún no recibe el rechazo");
    const directo = await db.rpc("revision_tomar", { p_request_id: s.id, p_revisor: elena.userId });
    assert.match(directo.error?.message ?? "", /MISMO_REVISOR/);
    await tomarSolicitud(db, diego, s.ref);
    const r2 = await decidir(db, diego, { ...s.ref, decision: "rechazar", checklist: lista(["objetivo"]), comentario: "Confirmado: hay que acotar el objetivo." });
    assert.equal(r2.estado, "rechazada");
    assert.equal((await agente(s.agentId)).estado, "rechazado");
    assert.match((await avisos(s.companyId)).at(-1)!.cuerpo, /Confirmado: hay que acotar el objetivo\./);
  });

  it("si las dos opiniones no coinciden, no se cierra: solo la coge un administrador (que no haya opinado) y decide", async () => {
    const elena = await revisor(["atencion"]), diego = await revisor(["atencion"]), tercero = await revisor(["atencion"]), admin = await revisor(["atencion"], "admin_samgple");
    const s = await solicitud();
    await tomarSolicitud(db, elena, s.ref);
    await decidir(db, elena, { ...s.ref, decision: "rechazar", checklist: lista(["permisos"]), comentario: "Demasiados permisos." });
    await tomarSolicitud(db, diego, s.ref);
    const r = await aprobar(diego, s.ref, "A mí me parece correcto.");
    assert.deepEqual(r, { estado: "segunda_opinion", segundaOpinion: true });
    const f = await fila(s.id);
    assert.equal(f.desacuerdo, true); assert.equal(f.asignado_a, null);
    assert.equal((await agente(s.agentId)).estado, "en_certificacion");
    await assert.rejects(tomarSolicitud(db, tercero, s.ref), codigo("solo_admin"));
    await assert.rejects(tomarSolicitud(db, diego, s.ref), codigo("mismo_revisor"));
    const d = await detalleDeSolicitud(db, admin, s.id);
    assert.equal(d!.desacuerdo, true); assert.equal(d!.puedeCoger, true); assert.equal(d!.revisiones.length, 2);
    await tomarSolicitud(db, admin, s.ref);
    assert.equal((await aprobar(admin, s.ref, "Los permisos están justificados.")).estado, "aprobada");
    assert.equal((await agente(s.agentId)).estado, "certificado");
  });
});

describe("vista de revisión", () => {
  it("enseña la configuración enviada, las instrucciones base de la plantilla y las diferencias; nunca datos de clientes de la empresa", async () => {
    const yo = await revisor(["atencion", "ventas", "operaciones", "marketing", "direccion", "personalizado"], "admin_samgple");
    const { data: sara } = await db.from("certification_requests").select("id").eq("id", "5a4a0000-0000-4000-8000-0000000000c1").maybeSingle();
    if (!sara) return;   // sin los datos de prueba del panel no hay nada que mirar aquí
    const d = (await detalleDeSolicitud(db, yo, sara.id as string))!;
    assert.equal(d.agente.nombre, "Sara"); assert.equal(d.empresa, "Clínica Dental Sol, S.L."); assert.equal(d.via, "rapida_plantilla");
    assert.ok(d.plantilla && d.plantilla.instruccionesBase.length > 200, "el revisor sí ve las instrucciones base");
    assert.equal(d.config.herramientas.find((t) => t.tool_id === "responder_whatsapp")?.permiso, "sola");
    assert.ok(d.examen && d.examen.bloques.length === 5 && d.examen.casos.every((c) => typeof c.motivo === "string" && typeof c.cumple === "boolean"));
    assert.ok(d.conocimiento.length >= 1 && d.traspasos.length >= 1 && d.config.reglas?.aviso_ia_texto);
    assert.equal(d.diferencias, null, "es una solicitud nueva");
    const claves = JSON.stringify(Object.keys(d)).toLowerCase();
    for (const prohibido of ["correo", "email", "contact", "memoria", "memory"]) assert.ok(!claves.includes(prohibido), `la vista no incluye «${prohibido}»`);

    const { data: lucia } = await db.from("certification_requests").select("id").eq("agent_id", "0e9902f1-d636-4806-a597-7d1d4bf9e7b4").eq("tipo", "cambio_importante").in("estado", ["pendiente_revision", "en_revision", "segunda_opinion"]).maybeSingle();
    if (lucia) {
      const c = (await detalleDeSolicitud(db, yo, lucia.id as string))!;
      assert.ok(c.diferencias && c.diferencias.cambios.some((x) => x.campo === "Instrucciones de la empresa"), "un cambio enseña las diferencias con la versión certificada");
    }
    assert.equal(await detalleDeSolicitud(db, yo, randomUUID()), null);
  });
});

describe("plantillas: misma cola y mismo proceso", () => {
  it("una versión nueva entra sola en la cola y solo se certifica con dos opiniones coincidentes", async () => {
    const elena = await revisor(["operaciones"]), diego = await revisor(["operaciones"]), otro = await revisor(["ventas"]);
    const tpl = `test-panel-${randomUUID().slice(0, 8)}`;
    plantillas.push(tpl);
    assert.ifError((await db.from("agent_templates").insert({ id: tpl, nombre_por_defecto: "Plantilla de prueba", rol: "CRM", departamento_tipo: "operaciones", descripcion_publica: "Prueba", instrucciones_base: "BASE-SECRETA-V1", herramientas_disponibles: [{ id: "buscar_en_memoria", permiso_defecto: "sola", editable: true }] })).error);
    const { data: reqs } = await db.from("template_review_requests").select("id, estado, template_version").eq("template_id", tpl);
    assert.equal(reqs!.length, 1); assert.equal(reqs![0]!.estado, "pendiente_revision"); assert.equal(reqs![0]!.template_version, 1);
    const ref = { clase: "plantilla" as const, id: reqs![0]!.id as string };
    assert.equal((await db.rpc("plantilla_certificada", { p_template_id: tpl, p_version: 1 })).data, false, "sin certificar no se publica");

    const enCola = (await listarCola(db, elena, { empresa: "plantillas" })).enCola.find((f) => f.id === ref.id)!;
    assert.equal(enCola.clase, "plantilla"); assert.equal(enCola.departamento, "operaciones"); assert.equal(enCola.puedeCoger, true);
    await assert.rejects(tomarSolicitud(db, otro, ref), codigo("categoria_no_asignada"));
    await tomarSolicitud(db, elena, ref);
    const d = (await detalleDePlantilla(db, elena, ref.id))!;
    assert.equal(d.plantilla.instruccionesBase, "BASE-SECRETA-V1"); assert.equal(d.esMia, true);
    await assert.rejects(decidir(db, elena, { ...ref, decision: "aprobar", checklist: lista(["coste"]) }), codigo("checklist_incompleta"));
    assert.deepEqual(await aprobar(elena, ref), { estado: "segunda_opinion", segundaOpinion: true }, "una plantilla siempre necesita segunda opinión");
    assert.equal((await db.rpc("plantilla_certificada", { p_template_id: tpl, p_version: 1 })).data, false);
    await assert.rejects(tomarSolicitud(db, elena, ref), codigo("mismo_revisor"));
    await tomarSolicitud(db, diego, ref);
    assert.equal((await aprobar(diego, ref)).estado, "aprobada");
    assert.equal((await db.rpc("plantilla_certificada", { p_template_id: tpl, p_version: 1 })).data, true);
    const { data: cert } = await db.from("template_certifications").select("estado, certificado_por, caduca_en").eq("template_id", tpl);
    assert.equal(cert!.length, 1); assert.equal(cert![0]!.certificado_por, diego.userId);
    assert.ok(new Date(cert![0]!.caduca_en as string).getTime() > Date.now() + 170 * DIA);

    // Publicar otra versión vuelve a pedir revisión (y cancela una anterior que siguiera abierta).
    assert.ifError((await db.from("agent_templates").update({ version: 2, instrucciones_base: "BASE-SECRETA-V2" }).eq("id", tpl)).error);
    const { data: v2 } = await db.from("template_review_requests").select("estado, template_version").eq("template_id", tpl).order("template_version");
    assert.deepEqual(v2, [{ estado: "aprobada", template_version: 1 }, { estado: "pendiente_revision", template_version: 2 }]);
    assert.equal((await db.rpc("plantilla_certificada", { p_template_id: tpl })).data, false, "la versión nueva no está publicada hasta certificarse");
  });
});

describe("métricas del equipo", () => {
  it("solicitudes por semana, tiempo medio, porcentaje de aprobaciones y motivos de rechazo", async () => {
    const antes = await metricasDelEquipo(db);
    const elena = await revisor(["atencion"]);
    const a = await solicitud({ enColaHace: 5 }), b = await solicitud({ enColaHace: 5 });
    await tomarSolicitud(db, elena, a.ref); await aprobar(elena, a.ref);
    await tomarSolicitud(db, elena, b.ref);
    await decidir(db, elena, { ...b.ref, decision: "pedir_cambios", checklist: lista(["lssi", "rgpd"]), comentario: "Revisa el consentimiento." });
    const m = await metricasDelEquipo(db);
    assert.equal(m.semanas.length, 8);
    assert.equal(m.resueltas, antes.resueltas + 2); assert.equal(m.aprobadas, antes.aprobadas + 1); assert.equal(m.cambiosSolicitados, antes.cambiosSolicitados + 1);
    assert.equal(m.semanas.at(-1)!.resueltas, antes.semanas.at(-1)!.resueltas + 2);
    assert.ok(m.porcentajeAprobaciones !== null && m.porcentajeAprobaciones > 0 && m.porcentajeAprobaciones <= 100);
    assert.ok(m.tiempoMedioHoras !== null && m.tiempoMedioHoras >= 0);
    const veces = (x: typeof m, id: string) => x.motivosDeRechazo.find((r) => r.id === id)?.veces ?? 0;
    assert.equal(veces(m, "lssi"), veces(antes, "lssi") + 1); assert.equal(veces(m, "rgpd"), veces(antes, "rgpd") + 1);
    assert.equal(m.porRevisor.find((r) => r.nombre === elena.nombre)?.revisiones, 2);
  });
});

describe("ninguna empresa cliente puede entrar", () => {
  it("RLS y permisos: sin la clave de servicio no se lee ni se ejecuta nada del panel", async () => {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "x", { auth: { persistSession: false } });
    for (const tabla of ["reviewers", "certification_reviews", "certification_exams", "template_review_requests", "template_reviews", "template_certifications", "agent_template_versions"]) {
      const r = await anon.from(tabla).select("*").limit(1);
      assert.ok(r.error || (r.data ?? []).length === 0, `${tabla} no se puede leer`);
    }
    const s = await solicitud();
    const elena = await revisor(["atencion"]);
    assert.ok((await anon.rpc("revision_tomar", { p_request_id: s.id, p_revisor: elena.userId })).error);
    assert.ok((await anon.rpc("revision_decidir", { p_request_id: s.id, p_revisor: elena.userId, p_decision: "aprobar", p_checklist: lista(), p_comentario: null, p_notas: null })).error);
    assert.ok((await anon.rpc("plantilla_revision_decidir", { p_request_id: s.id, p_revisor: elena.userId, p_decision: "aprobar", p_checklist: lista(), p_comentario: null, p_notas: null })).error);
    assert.ok((await anon.from("reviewers").insert({ user_id: elena.userId, rol: "admin_samgple" })).error, "nadie se hace revisor a sí mismo");
    assert.equal((await fila(s.id)).estado, "pendiente_revision");
  });
  it("la sesión del panel solo vale para quien está en `reviewers` y activo", async () => {
    const elena = await revisor(["atencion"]);
    const cabeceras = (h: Record<string, string>) => new Headers(h);
    assert.equal(await sesionRevisor(cabeceras({ authorization: "Bearer no-es-un-jwt" }), db), null, "un token falso nunca cae al modo desarrollo");
    assert.equal(await sesionRevisor(cabeceras({ authorization: "Basic abc" }), db), null);
    const dev = { NODE_ENV: "development" };
    assert.equal((await sesionRevisor(cabeceras({ cookie: `dev_revisor=${elena.userId}` }), db, dev))?.userId, elena.userId);
    assert.equal(await sesionRevisor(cabeceras({ cookie: `dev_revisor=${randomUUID()}` }), db, dev), null, "alguien que no es revisor no entra ni en desarrollo");
    assert.equal(await sesionRevisor(cabeceras({ cookie: `dev_revisor=${elena.userId}` }), db, { NODE_ENV: "production", DEV_REVISOR_USER_ID: elena.userId }), null, "en producción no hay persona de desarrollo");
    await db.from("reviewers").update({ activo: false }).eq("user_id", elena.userId);
    assert.equal(await sesionRevisor(cabeceras({ cookie: `dev_revisor=${elena.userId}` }), db, dev), null, "un revisor dado de baja ya no entra");
  });
});
