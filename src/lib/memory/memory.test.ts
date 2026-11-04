import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMBEDDING_DIMENSIONS, type Embedder } from "./embedder.ts";
import { FakeEmbedder } from "./fakeEmbedder.ts";
import { InMemoryStore } from "./inMemoryStore.ts";
import { createMemoryService } from "./service.ts";
import { toMemoryData } from "./toMemoryData.ts";
import { VoyageEmbedder } from "./voyageEmbedder.ts";

const A = "a64499d1-7f43-4a43-abc8-41a313dc4018";
const B = "b0000000-0000-4000-8000-000000000001";
const CONTACT = "3284e4bb-f1b6-4970-a406-41ca6176e2c5";
const setup = () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryStore();
  return { embedder, store, svc: createMemoryService({ store, embedder }) };
};
const dato = (title: string, content: string) => ({ contactId: CONTACT, type: "dato" as const, title, content, agentId: "lucia-ramos" });

describe("servicio de memoria", () => {
  it("vectoriza el nodo como documento y la consulta como query", async () => {
    const { svc, embedder } = setup();
    await svc.addNode(A, dato("Objeción: precio", "Considera caro el plan anual"));
    await svc.search(A, "precio caro");
    assert.deepEqual(embedder.calls.map((c) => c.kind), ["document", "query"]);
    assert.equal(embedder.calls[0].texts[0], "Objeción: precio\nConsidera caro el plan anual");
  });

  it("la búsqueda devuelve primero el nodo más parecido", async () => {
    const { svc } = setup();
    await svc.addNode(A, dato("Objeción: precio", "Considera caro el plan anual de 4200 euros"));
    await svc.addNode(A, dato("Prefiere llamadas por la tarde", "Atiende pacientes por la mañana, contactar a partir de las 16:00"));
    const hits = await svc.search(A, "le parece caro el precio del plan");
    assert.equal(hits[0].title, "Objeción: precio");
    assert.ok(hits[0].similarity > hits[1].similarity);
  });

  it("una empresa no ve los nodos de otra al buscar ni al cargar", async () => {
    const { svc } = setup();
    await svc.addNode(A, dato("Secreto de A", "presupuesto confidencial"));
    assert.deepEqual(await svc.search(B, "presupuesto confidencial"), []);
    assert.equal((await svc.loadGraph(B)).nodes.length, 0);
    assert.equal((await svc.loadGraph(A)).nodes.length, 1);
  });

  it("no guarda nada si el embedder falla", async () => {
    const store = new InMemoryStore();
    const broken: Embedder = { model: "roto", dimensions: EMBEDDING_DIMENSIONS, embed: async () => { throw new Error("sin red"); } };
    const svc = createMemoryService({ store, embedder: broken });
    await assert.rejects(svc.addNode(A, dato("x", "y")), /sin red/);
    assert.equal((await store.listNodes(A)).length, 0);
  });

  it("rechaza un embedder con otra dimensión y la falta de embedder", async () => {
    const store = new InMemoryStore();
    const small: Embedder = { model: "pequeño", dimensions: 256, embed: async () => [[0]] };
    await assert.rejects(createMemoryService({ store, embedder: small }).search(A, "hola"), /dimensiones/);
    await assert.rejects(createMemoryService({ store, embedder: null }).search(A, "hola"), /embedder/);
  });

  it("valida la entrada", async () => {
    const { svc } = setup();
    await assert.rejects(svc.addNode(A, { ...dato("", "x") }));
    await assert.rejects(svc.addNode(A, { ...dato("ok", "x"), contactId: "no-es-uuid" }));
    await assert.rejects(svc.search(A, "   "));
  });
});

describe("toMemoryData", () => {
  it("agrupa por contacto y omite nodos sin agente o sin contacto", async () => {
    const { svc, store } = setup();
    const n1 = await svc.addNode(A, dato("Uno", "a"));
    const n2 = await svc.addNode(A, { ...dato("Dos", "b"), type: "tarea" });
    const huerfano = await svc.addNode(A, { ...dato("Suelto", "c"), contactId: null });
    store.contacts.push({ id: CONTACT, companyId: A, name: "Laura Gómez", organization: "Clínica Sol" });
    store.edges.push({ id: "e1", companyId: A, from: n1.id, to: n2.id, kind: "tiene_pendiente" }, { id: "e2", companyId: A, from: n1.id, to: huerfano.id, kind: "recibio" });
    const data = toMemoryData(await svc.loadGraph(A));
    assert.deepEqual(data.clients.map((c) => [c.name, c.company]), [["Laura Gómez", "Clínica Sol"]]);
    assert.equal(data.nodes.length, 2);
    assert.equal(data.nodes[0].creatorId, "lucia-ramos");
    assert.deepEqual(data.edges.map((e) => e.id), ["e1"]);
  });
});

describe("VoyageEmbedder", () => {
  const ok = (n: number) => async () =>
    new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: n - 1 - i, embedding: new Array(EMBEDDING_DIMENSIONS).fill(i) })) }));

  it("pide voyage-3.5 a 1024 dimensiones, ordena por índice y trocea en lotes de 128", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_u: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      return ok(body.input.length)();
    }) as typeof fetch;
    const out = await new VoyageEmbedder("k", fetchImpl).embed(Array.from({ length: 130 }, (_, i) => `t${i}`), "document");
    assert.equal(out.length, 130);
    assert.deepEqual(bodies.map((b) => (b.input as string[]).length), [128, 2]);
    assert.equal(bodies[0].model, "voyage-3.5");
    assert.equal(bodies[0].output_dimension, 1024);
    assert.equal(bodies[0].input_type, "document");
    assert.equal(out[0][0], 127); // el índice 0 llegó el último en la respuesta y se reordenó
  });

  it("no filtra la clave ni el cuerpo en los errores", async () => {
    const fetchImpl = (async () => new Response("clave-secreta-en-el-cuerpo", { status: 401 })) as typeof fetch;
    await assert.rejects(new VoyageEmbedder("clave-secreta", fetchImpl).embed(["a"], "query"), (e: Error) => e.message === "Voyage respondió con HTTP 401.");
  });

  it("rechaza vectores de otra dimensión", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }))) as typeof fetch;
    await assert.rejects(new VoyageEmbedder("k", fetchImpl).embed(["a"], "query"), /dimensión/);
  });
});
