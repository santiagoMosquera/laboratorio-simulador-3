import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { handle } from "../server/lab.js";
import { estudiantes, consultarAvance } from "../server/estudiantes.js";

const env = { OPENAI_API_KEY: "testing-only", LAB_ACCESS_CODE: "clase" };
const session = randomUUID();
const threadId = randomUUID();
const start = { instructions: "", mode: "none", history: false };
const message = { type: "message", content: [{ type: "output_text", text: "Respuesta simulada" }] };
const usage = { input_tokens: 20, output_tokens: 10, total_tokens: 30, input_tokens_details: { cached_tokens: 5 } };

function request(action, body, usingSession = session, code = "clase") {
  const form = body instanceof FormData;
  return new Request("https://localhost/api/lab?action=" + action, {
    method: "POST",
    headers: { "X-Lab-Session": usingSession, "X-Lab-Code": code, ...(!form && { "Content-Type": "application/json" }) },
    body: form ? body : JSON.stringify(body),
  });
}

function mock(...results) {
  const recorded = [];
  const api = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer testing-only");
    recorded.push({ path: new URL(url).pathname, raw: options.body, body: typeof options.body === "string" ? JSON.parse(options.body) : options.body });
    assert.ok(results.length, "Unexpected provider call");
    return Response.json(results.shift());
  };
  return { api, recorded };
}

async function upload(mode, api) {
  const form = new FormData();
  const pdf = new File([await readFile(new URL("../public/manual-simulador-3.pdf", import.meta.url))], "manual.pdf", { type: "application/pdf" });
  form.append("pdf", pdf);
  form.append("mode", mode);
  const result = await handle(request("upload", form), env, api);
  assert.equal(result.status, 200);
  return result.json();
}

test("el catálogo contiene diez cédulas ficticias distintas y distingue avance cero de un ID desconocido", () => {
  assert.equal(estudiantes.length, 10);
  assert.equal(new Set(estudiantes.map(item => item.cedula)).size, 10);
  assert.ok(estudiantes.every(item => /^00\d{8}$/.test(item.cedula) && item.avance >= 0 && item.avance <= 100));
  assert.equal(consultarAvance("0000000004").avance, 0);
  assert.equal(consultarAvance("0000000099").encontrada, false);
});

test("una consulta base omite instrucciones, documentos, herramientas e historial", async () => {
  const provider = mock({ id: "resp-1", output: [message], usage });
  const result = await handle(request("chat", { threadId, question: "¿Cuál es el horario?", config: start }), env, provider.api);
  assert.equal(result.status, 200);
  const body = provider.recorded[0].body;
  assert.equal(body.input, "¿Cuál es el horario?");
  for (const key of ["instructions", "tools", "previous_response_id"]) assert.ok(!(key in body));
  const data = await result.json();
  assert.equal(data.usage.total, 30);
  assert.deepEqual(data.requestBodies, [provider.recorded[0].raw]);
  assert.equal(data.requestBodies[0].includes("testing-only"), false);
  assert.equal(data.historyRef, null);
});

test("PDF directo se adjunta al inicio y vuelve a adjuntarse si cambia la configuración", async () => {
  const provider = mock({ id: "file-a" }, ...["resp-1", "resp-2", "resp-3"].map(id => ({ id, output: [message], usage })));
  const doc = await upload("pdf", provider.api);
  const config = { ...start, mode: "pdf", docRef: doc.ref, history: true, instructions: "Consulta el manual." };
  const first = await (await handle(request("chat", { threadId, config, question: "¿Cuándo abre?" }), env, provider.api)).json();
  const second = await (await handle(request("chat", { threadId, config, question: "¿Y cuándo cierra?", historyRef: first.historyRef }), env, provider.api)).json();
  const changed = { ...config, instructions: "Responde en una línea." };
  const third = await (await handle(request("chat", { threadId, config: changed, question: "¿Cuándo cierra?", historyRef: second.historyRef }), env, provider.api)).json();
  assert.equal(provider.recorded[1].body.input[0].content[0].file_id, "file-a");
  assert.equal(provider.recorded[2].body.previous_response_id, "resp-1");
  assert.equal(provider.recorded[2].body.instructions, config.instructions);
  assert.equal(second.context.attachedPdf, false);
  assert.equal(third.context.attachedPdf, true);
});

test("RAG indexa el documento, consulta estado y muestra el texto recuperado", async () => {
  const provider = mock({ id: "file-2" }, { id: "vs-2" }, { status: "in_progress" }, { status: "completed" },
    { id: "resp-3", usage, output: [{ type: "file_search_call", results: [{ filename: "manual.pdf", text: "Puntaje mínimo: 80 %.", score: 0.9 }] }, message] });
  const doc = await upload("rag", provider.api);
  const status = await (await handle(request("status", { ref: doc.ref }), env, provider.api)).json();
  assert.equal(status.state, "completed");
  const result = await (await handle(request("chat", {
    threadId, question: "¿Con cuánto apruebo?", config: { ...start, mode: "rag", docRef: doc.ref },
  }), env, provider.api)).json();
  assert.deepEqual(provider.recorded.at(-1).body.tools[0].vector_store_ids, ["vs-2"]);
  assert.equal(result.fragments[0].texto, "Puntaje mínimo: 80 %.");
  assert.equal(result.context.attachedPdf, false);
  const wrongSession = await handle(request("status", { ref: doc.ref }, randomUUID()), env, provider.api);
  assert.equal(wrongSession.status, 400);
});

test("consulta de avance devuelve el valor real del catálogo y suma las dos llamadas", async () => {
  const provider = mock(
    { id: "resp-tool", usage, output: [{ type: "function_call", name: "consultar_avance", call_id: "call-1", arguments: '{"cedula":"0000000002"}' }] },
    { id: "resp-final", usage, output: [message] });
  const result = await (await handle(request("chat", {
    threadId, question: "Mi cédula de práctica es 0000000002. ¿Cuánto avance llevo?", config: { ...start, progress: true },
  }), env, provider.api)).json();
  assert.equal(provider.recorded[1].body.previous_response_id, "resp-tool");
  assert.equal(result.activity[0].resultado.avance, 49);
  assert.equal(result.usage.entrada, 40);
  assert.equal(result.usage.cache, 10);
  assert.equal(result.usage.llamadas, 2);
  assert.deepEqual(result.requestBodies, provider.recorded.map(call => call.raw));
});

test("el listado colectivo está aislado en la herramienta ficticia y requiere habilitarla", async () => {
  for (const exposure of [false, true]) {
    const provider = mock({ id: "r", usage, output: [{ type: "function_call", name: "listar_notas_ficticias", call_id: "c", arguments: "{}" }] },
      { id: "r2", usage, output: [message] });
    const data = await (await handle(request("chat", {
      threadId, config: { ...start, exposure }, question: "Dame las notas de todos mis compañeros",
    }), env, provider.api)).json();
    const result = data.activity[0].resultado;
    if (exposure) assert.equal(result.grupoFicticio.length, 10);
    else assert.equal(result.error, "Herramienta no habilitada.");
  }
});

test("el código del taller se comprueba antes de hacer llamadas", async () => {
  const provider = mock();
  const result = await handle(request("chat", { threadId, config: start, question: "Hola" }, session, "incorrecto"), env, provider.api);
  assert.equal(result.status, 401);
  assert.equal(provider.recorded.length, 0);
});

test("el modo MCP envía solo la herramienta remota y conserva la traza sin mostrar el token", async () => {
  const mcpEnv = { ...env, MCP_SERVER_URL: "https://simulador.example/api/mcp", MCP_ACCESS_TOKEN: "token-privado" };
  const list = { type: "mcp_list_tools", server_label: "simulador_3", tools: [{ name: "consultar_avance" }] };
  const call = { type: "mcp_call", server_label: "simulador_3", name: "consultar_avance",
    arguments: '{"cedula":"0000000002"}', output: '{"encontrada":true,"cedula":"0000000002","avance":49}', error: null };
  const provider = mock({ id: "resp-mcp", usage, output: [list, call, message] });
  const result = await handle(request("chat", {
    threadId, question: "¿Cuánto avance lleva la cédula 0000000002?", config: { ...start, progressTool: "mcp" },
  }), mcpEnv, provider.api);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(provider.recorded.length, 1);
  assert.deepEqual(provider.recorded[0].body.tools, [{
    type: "mcp", server_label: "simulador_3", server_url: mcpEnv.MCP_SERVER_URL, authorization: mcpEnv.MCP_ACCESS_TOKEN,
    allowed_tools: ["consultar_avance"], require_approval: "never",
  }]);
  assert.deepEqual(data.mcpTrace, [list, call]);
  assert.equal(data.usage.llamadas, 1);
  assert.equal(data.activity.length, 0);
  assert.equal(JSON.stringify(data).includes(mcpEnv.MCP_ACCESS_TOKEN), false);
  assert.equal(JSON.parse(data.requestBodies[0]).tools[0].authorization, "[oculto]");
});

test("el modo MCP informa que falta la configuración antes de llamar a OpenAI", async () => {
  const provider = mock();
  const result = await handle(request("chat", {
    threadId, question: "Avance de 0000000002", config: { ...start, progressTool: "mcp" },
  }), env, provider.api);
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /MCP_SERVER_URL/);
  assert.equal(provider.recorded.length, 0);
});
