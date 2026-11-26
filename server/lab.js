import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { consultarAvance, estudiantes, herramientaAvance, herramientaExposicion } from "./estudiantes.js";

const maxPdf = 4_000_000;
const timeout = 50_000;
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const problem = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = value => createHash("sha256").update(value).digest();
const eq = (left, right) => timingSafeEqual(digest(left), digest(right));

function issue(data, session, key) {
  const payload = Buffer.from(JSON.stringify({ ...data, session, exp: Date.now() + 12 * 3600_000 })).toString("base64url");
  const signature = createHmac("sha256", key).update("lab-v1:" + payload).digest("base64url");
  return payload + "." + signature;
}

function readRef(ref, kind, session, key) {
  if (typeof ref !== "string" || ref.length > 2500) throw problem("La referencia de esta sesión no es válida.");
  const [payload, signature, extra] = ref.split(".");
  if (!payload || !signature || extra || !eq(signature, createHmac("sha256", key).update("lab-v1:" + payload).digest("base64url"))) {
    throw problem("La referencia de esta sesión no es válida.");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.kind !== kind || data.session !== session || data.exp < Date.now()) {
    throw problem("La referencia venció o pertenece a otra sesión. Abre un chat nuevo o vuelve a cargar el PDF.");
  }
  return data;
}

function makeClient(env, request, fetcher) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]);
  return async (path, data, method = data ? "POST" : "GET") => {
    const headers = { Authorization: "Bearer " + env.OPENAI_API_KEY };
    const isForm = data instanceof FormData;
    if (data && !isForm) headers["Content-Type"] = "application/json";
    const response = await fetcher("https://api.openai.com/v1" + path, {
      method, headers, signal, body: data && (isForm || typeof data === "string" ? data : JSON.stringify(data)),
    });
    const result = await response.json();
    if (!response.ok) {
      const messages = {
        401: "OpenAI rechazó la clave configurada en el servidor.",
        403: "El proyecto de OpenAI no tiene acceso al recurso o modelo.",
        404: "OpenAI no encontró el modelo o el recurso. Revisa el modelo o vuelve a cargar el PDF.",
        429: "OpenAI devolvió un límite de uso. Revisa el saldo y los límites del proyecto.",
      };
      throw problem(messages[response.status] ?? "OpenAI rechazó la solicitud. Revisa el modelo y el estado del PDF.", 502);
    }
    return result;
  };
}

async function loadDocument(request, client, seal) {
  const form = await request.formData();
  const file = form.get("pdf");
  const mode = form.get("mode");
  if (!["pdf", "rag"].includes(mode) || !(file instanceof File) || !file.size || file.size > maxPdf ||
      !file.name.toLowerCase().endsWith(".pdf") || await file.slice(0, 5).text() !== "%PDF-") {
    throw problem("Adjunta un PDF válido de hasta 4 MB.");
  }
  const name = file.name.replace(/[\r\n]/g, "").slice(0, 160);
  const upload = new FormData();
  upload.append("purpose", "user_data");
  upload.append("file", file, name);
  const uploaded = await client("/files", upload);
  if (mode === "pdf") return { name, state: "completed", ref: seal({ kind: "doc", mode, name, fileId: uploaded.id }) };

  const store = await client("/vector_stores", {
    name: "Laboratorio Simulador 3", expires_after: { anchor: "last_active_at", days: 1 },
  });
  const indexed = await client("/vector_stores/" + store.id + "/files", {
    file_id: uploaded.id,
    chunking_strategy: { type: "static", static: { max_chunk_size_tokens: 160, chunk_overlap_tokens: 30 } },
  });
  return {
    name, state: indexed.status,
    ref: seal({ kind: "doc", mode, name, fileId: uploaded.id, storeId: store.id }),
  };
}

function usageOf(calls) {
  const counts = { entrada: 0, salida: 0, total: 0, cache: 0, llamadas: calls.length };
  const complete = calls.every(call => call.usage);
  if (!complete) return null;
  for (const { usage } of calls) {
    counts.entrada += usage.input_tokens;
    counts.salida += usage.output_tokens;
    counts.total += usage.total_tokens ?? usage.input_tokens + usage.output_tokens;
    counts.cache += usage.input_tokens_details?.cached_tokens ?? 0;
  }
  return counts;
}

function herramientaMcp(env) {
  const token = env.MCP_ACCESS_TOKEN?.trim();
  let url;
  try { url = new URL(env.MCP_SERVER_URL?.trim()); } catch { /* Se valida abajo. */ }
  if (!token || url?.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw problem("Configura MCP_SERVER_URL con la URL HTTPS de /api/mcp y MCP_ACCESS_TOKEN en el servidor.", 503);
  }
  return {
    type: "mcp", server_label: "simulador_3", server_url: url.href, authorization: token,
    allowed_tools: [herramientaAvance.name], require_approval: "never",
  };
}

async function chat(body, client, unseal, seal, model, env) {
  const { question, config, threadId, historyRef } = body;
  if (typeof question !== "string" || !question.trim() || question.length > 4000 ||
      !config || typeof config.instructions !== "string" || config.instructions.length > 10000 ||
      !["none", "pdf", "rag"].includes(config.mode) || typeof threadId !== "string" || !/^[a-f0-9-]{36}$/.test(threadId)) {
    throw problem("La pregunta o la configuración no son válidas.");
  }

  const doc = config.mode === "none" ? null : unseal(config.docRef, "doc");
  if (doc && doc.mode !== config.mode) throw problem("Vuelve a cargar el PDF para este modo de consulta.");
  const progressTool = config.progressTool ?? (config.progress === true ? "direct" : "none");
  if (!["none", "direct", "mcp"].includes(progressTool)) throw problem("El modo de consulta de avance no es válido.");
  const mcp = progressTool === "mcp" ? herramientaMcp(env) : null;
  const fingerprint = digest(JSON.stringify([config.instructions, config.mode, doc?.fileId, doc?.storeId,
    progressTool === "direct", config.exposure === true, ...(mcp ? [mcp.server_url] : [])])).toString("hex");
  const chain = config.history && historyRef ? unseal(historyRef, "chat") : null;
  const previous = chain?.threadId === threadId && chain.fingerprint === fingerprint ? chain.id : null;

  const tools = [];
  if (doc?.mode === "rag") tools.push({ type: "file_search", vector_store_ids: [doc.storeId], max_num_results: 3 });
  if (progressTool === "direct") tools.push(herramientaAvance);
  if (mcp) tools.push(mcp);
  if (config.exposure === true) tools.push(herramientaExposicion);
  const attachPdf = doc?.mode === "pdf" && !previous;
  const input = attachPdf
    ? [{ role: "user", content: [{ type: "input_file", file_id: doc.fileId }, { type: "input_text", text: question }] }]
    : question;
  const common = { model, ...(config.instructions && { instructions: config.instructions }) };
  const requestBodies = [];
  const sendResponse = payload => {
    const body = JSON.stringify(payload);
    requestBodies.push(mcp ? JSON.stringify(payload, (key, value) =>
      key === "authorization" ? "[oculto]" : value) : body);
    return client("/responses", body);
  };
  const calls = [await sendResponse({
    ...common, input, store: Boolean(config.history || tools.some(tool => tool.type === "function")),
    ...(previous && { previous_response_id: previous }),
    ...(tools.length && { tools }),
    ...(doc?.mode === "rag" && { include: ["file_search_call.results"] }),
    max_output_tokens: 1200,
  })];

  const activity = [];
  const fragments = [];
  const mcpTrace = [];
  for (let step = 0; step < 4; step += 1) {
    const response = calls.at(-1);
    for (const item of response.output ?? []) {
      if (mcp && ["mcp_list_tools", "mcp_call"].includes(item.type) && item.server_label === mcp.server_label) {
        mcpTrace.push(item);
      }
      if (item.type === "file_search_call") {
        for (const result of item.results ?? []) {
          fragments.push({ archivo: result.filename, texto: result.text, relevancia: result.score });
        }
      }
    }
    const pending = (response.output ?? []).filter(item => item.type === "function_call");
    if (!pending.length) {
      const answer = (response.output ?? []).flatMap(item => item.type === "message" ? item.content ?? [] : [])
        .map(item => item.type === "output_text" ? item.text : item.type === "refusal" ? item.refusal : "")
        .filter(Boolean).join("\n");
      const mcpFailure = mcpTrace.some(item => item.error || item.status === "failed" || item.status === "incomplete");
      if (!answer && !mcpFailure) throw problem("El modelo no devolvió una respuesta de texto para este turno.", 502);
      return {
        answer: answer || "La consulta MCP falló. Revisa la traza de este turno.",
        usage: usageOf(calls), activity, fragments, requestBodies, mcpTrace,
        historyRef: config.history ? seal({ kind: "chat", threadId, fingerprint, id: response.id }) : null,
        context: {
          question, instructions: config.instructions, mode: config.mode, document: doc?.name ?? null,
          attachedPdf: Boolean(attachPdf), linkedHistory: Boolean(previous), model, progressTool,
        },
      };
    }
    if (step === 3 || pending.length > 5) throw problem("El turno alcanzó el límite de consultas de herramientas.", 502);
    const outputs = pending.map(call => {
      let data;
      let args = {};
      try { args = JSON.parse(call.arguments) ?? {}; } catch { /* La herramienta devolverá un error de entrada. */ }
      if (call.name === herramientaAvance.name && progressTool === "direct") {
        data = typeof args.cedula === "string" && /^\d{10}$/.test(args.cedula)
          ? consultarAvance(args.cedula)
          : { encontrada: false, detalle: "La cédula de práctica debe tener 10 dígitos." };
      } else if (call.name === herramientaExposicion.name && config.exposure === true) {
        data = { grupoFicticio: estudiantes.map(({ cedula, notaFicticia }) => ({ cedula, nota: notaFicticia })) };
      } else {
        data = { error: "Herramienta no habilitada." };
      }
      activity.push({ herramienta: call.name, argumentos: args, resultado: data });
      return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(data) };
    });
    calls.push(await sendResponse({
      ...common, input: outputs, previous_response_id: response.id, store: true,
      ...((mcp || doc?.mode === "rag") && { tools: tools.filter(tool => tool.type !== "function") }),
      ...(doc?.mode === "rag" && { include: ["file_search_call.results"] }),
      max_output_tokens: 1200,
    }));
  }
}

export async function handle(request, env = process.env, fetcher = fetch) {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const key = env.OPENAI_API_KEY?.trim();
    const access = env.LAB_ACCESS_CODE?.trim();
    if (!key || !access) throw problem("Configura OPENAI_API_KEY y LAB_ACCESS_CODE en el servidor.", 503);
    const session = request.headers.get("X-Lab-Session") ?? "";
    if (!/^[a-f0-9-]{36}$/.test(session) || !eq(request.headers.get("X-Lab-Code") ?? "", access)) {
      throw problem("Código de acceso incorrecto.", 401);
    }
    const action = new URL(request.url).searchParams.get("action");
    const client = makeClient(env, request, fetcher);
    const seal = data => issue(data, session, key);
    const unseal = (ref, kind) => readRef(ref, kind, session, key);
    if (action === "upload") return json(await loadDocument(request, client, seal));
    if (action === "status") {
      const { ref } = await request.json();
      const doc = unseal(ref, "doc");
      if (doc.mode === "pdf") return json({ state: "completed" });
      const current = await client("/vector_stores/" + doc.storeId + "/files/" + doc.fileId);
      return json({ state: current.status });
    }
    if (action === "chat") return json(await chat(await request.json(), client, unseal, seal, env.OPENAI_MODEL?.trim() || "gpt-6-luna", env));
    return json({ error: "Operación desconocida." }, 404);
  } catch (error) {
    if (error.status) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: "Solicitud no válida." }, 400);
    if (error.name === "TimeoutError" || error.name === "AbortError") return json({ error: "La consulta tardó demasiado. Intenta de nuevo." }, 504);
    return json({ error: "No se pudo completar la consulta. Revisa la conectividad con OpenAI." }, 502);
  }
}
