const byId = id => document.getElementById(id);
const storageKey = "krakedev-lab-v1";
const id = () => crypto.randomUUID();
const base = { id: "base", name: "Pregunta sola", instructions: "", mode: "none", history: false, progress: false, exposure: false, doc: null };
const newChat = () => ({ id: id(), title: "Chat nuevo", messages: [], historyRef: null });

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.configs?.length && saved?.chats?.length && saved.session) return saved;
  } catch { /* Abre una sesión limpia si el almacenamiento no está disponible. */ }
  const first = newChat();
  return { session: id(), code: "", configs: [base], active: base.id, chats: [first], chatId: first.id };
}

const state = load();
const active = () => state.configs.find(config => config.id === state.active);
const current = () => state.chats.find(chat => chat.id === state.chatId);
let draftDoc = null;
let uploading = false;
const pending = new Set();
const messages = byId("messages");
const label = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};

function persist() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(state)); }
  catch {
    const message = "El navegador no pudo guardar más datos. Esta sesión sigue abierta.";
    byId("config-status").textContent = message;
    byId("chat-status").textContent = message;
  }
}

function screen(name) {
  for (const section of ["chat", "settings"]) {
    byId(section).hidden = section !== name;
    const button = byId("show-" + section);
    if (section === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function configOptions(selected = state.active) {
  const entries = state.configs.map(item => {
    const option = label("option", item.name + (item.id === state.active ? " · Activa" : ""));
    option.value = item.id;
    return option;
  });
  byId("saved").replaceChildren(...entries);
  byId("saved").value = selected;
}

function loadConfig(identifier) {
  const config = state.configs.find(item => item.id === identifier);
  configOptions(identifier);
  for (const field of ["name", "instructions", "mode"]) byId(field).value = config[field];
  for (const field of ["history", "progress", "exposure"]) byId(field).checked = config[field];
  draftDoc = config.doc;
  byId("pdf").value = "";
  byId("config-status").textContent = "";
  renderDoc();
}

function renderDoc() {
  const mode = byId("mode").value;
  byId("document").hidden = mode === "none";
  byId("pdf-label").textContent = mode === "rag" ? "Agregar contenido al RAG" : "Adjuntar PDF";
  byId("doc-status").textContent = draftDoc ? draftDoc.name + " · " + (draftDoc.state === "completed" ? "Listo" : "Procesando") : "Selecciona un PDF de hasta 4 MB.";
}

function saveConfig(add) {
  if (!byId("config-form").reportValidity()) return;
  if (uploading) {
    byId("config-status").textContent = "Espera a que termine la carga.";
    return;
  }
  const mode = byId("mode").value;
  if (mode !== "none" && draftDoc?.state !== "completed") {
    byId("config-status").textContent = "Carga el PDF y espera a que esté listo.";
    return;
  }
  const config = {
    id: add ? id() : byId("saved").value,
    name: byId("name").value.trim(),
    instructions: byId("instructions").value, mode,
    history: byId("history").checked,
    progress: byId("progress").checked,
    exposure: byId("exposure").checked,
    doc: mode === "none" ? null : draftDoc,
  };
  if (!config.name) {
    byId("config-status").textContent = "Escribe un nombre para la configuración.";
    return;
  }
  if (add) state.configs.push(config);
  else state.configs = state.configs.map(item => item.id === config.id ? config : item);
  state.active = config.id;
  persist();
  configOptions();
  renderChat();
  byId("config-status").textContent = "Configuración activa: " + config.name;
}

async function api(action, body) {
  const form = body instanceof FormData;
  const result = await fetch("/api/lab?action=" + action, {
    method: "POST",
    headers: {
      "X-Lab-Session": state.session, "X-Lab-Code": state.code,
      ...(!form && { "Content-Type": "application/json" }),
    },
    body: form ? body : JSON.stringify(body),
  });
  let data;
  try { data = await result.json(); }
  catch { throw new Error("El servidor devolvió una respuesta inesperada (" + result.status + ")."); }
  if (!result.ok) throw new Error(data.error || "Error de la aplicación.");
  return data;
}

async function upload() {
  const file = byId("pdf").files[0];
  if (!state.code) { byId("doc-status").textContent = "Ingresa el código de acceso abajo."; return; }
  if (!file || file.size > 4_000_000) { byId("doc-status").textContent = "Selecciona un PDF de hasta 4 MB."; return; }
  uploading = true;
  for (const name of ["upload", "mode", "saved", "pdf"]) byId(name).disabled = true;
  try {
    const form = new FormData();
    form.set("pdf", file);
    form.set("mode", byId("mode").value);
    byId("doc-status").textContent = "Subiendo PDF…";
    draftDoc = await api("upload", form);
    renderDoc();
    for (let i = 0; i < 75 && draftDoc.state === "in_progress"; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      draftDoc.state = (await api("status", { ref: draftDoc.ref })).state;
      renderDoc();
    }
    if (draftDoc.state !== "completed") {
      draftDoc = null;
      throw new Error("El PDF no quedó listo. Prueba con el manual de práctica o vuelve a cargarlo.");
    }
  } catch (error) {
    draftDoc = null;
    byId("doc-status").textContent = error.message;
  } finally {
    uploading = false;
    for (const name of ["upload", "mode", "saved", "pdf"]) byId(name).disabled = false;
  }
}

function details(title, value) {
  const node = document.createElement("details");
  node.append(label("summary", title), label("pre", typeof value === "string" ? value : JSON.stringify(value, null, 2)));
  return node;
}

function renderChat() {
  const chat = current();
  byId("chat-title").textContent = chat.title;
  byId("chat-config").textContent = "Configuración activa: " + active().name;
  byId("chats").replaceChildren(...state.chats.map(item => {
    const button = label("button", item.title, "thread");
    button.type = "button";
    if (item === chat) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => {
      state.chatId = item.id;
      byId("chat-status").textContent = "";
      persist();
      renderChat();
    });
    return button;
  }));
  messages.replaceChildren();
  if (!chat.messages.length) messages.append(label("p", "Escribe una pregunta sobre el simulador para empezar.", "empty"));
  for (const item of chat.messages) {
    const entry = label("article", "", "message " + item.role);
    entry.append(label("p", item.role === "user" ? "Tú" : "Asistente", "message-label"),
      label("p", item.text, "message-text"));
    if (item.role === "assistant") {
      const u = item.usage;
      const configUsed = item.configName ?? "No registrada";
      const modelUsed = item.context?.model ?? "No registrado";
      const historyUsed = item.context?.linkedHistory ? " · Con historial" : "";
      entry.append(label("p", "Configuración usada: " + configUsed + " · Modelo: " + modelUsed + historyUsed, "meta"));
      entry.append(label("p", u ? "Entrada " + u.entrada.toLocaleString("es-EC") + " · Salida " + u.salida.toLocaleString("es-EC") +
        " · Total " + u.total.toLocaleString("es-EC") + " tokens · " + u.llamadas + (u.llamadas === 1 ? " llamada" : " llamadas") +
        (u.cache ? " · Caché " + u.cache.toLocaleString("es-EC") : "") : "La API no reportó el consumo completo para este turno.", "metrics"));
      if (item.requestBodies?.length) {
        const trace = document.createElement("details");
        trace.append(label("summary", "Ver JSON enviado a OpenAI"));
        item.requestBodies.forEach((body, index) => {
          if (item.requestBodies.length > 1) trace.append(label("p", "Llamada " + (index + 1), "meta"));
          trace.append(label("pre", JSON.stringify(JSON.parse(body), null, 2)));
        });
        entry.append(trace);
      } else {
        entry.append(details("Ver JSON enviado a OpenAI", "Este turno se hizo antes de guardar el JSON. Envía una nueva pregunta para verlo."));
      }
      if (item.context.mode === "rag") entry.append(details("Ver fragmentos recuperados",
        item.fragments.length ? item.fragments : "La API no devolvió fragmentos en este turno."));
      if (item.activity.length) entry.append(details("Ver actividad de este turno", item.activity));
    }
    messages.append(entry);
  }
  if (pending.has(chat.id)) messages.append(label("p", "Consultando al asistente…", "meta"));
  byId("send").disabled = pending.has(chat.id);
  messages.scrollTop = messages.scrollHeight;
}

async function send(event) {
  event.preventDefault();
  const chat = current();
  const question = byId("question").value.trim();
  if (!question || pending.has(chat.id)) return;
  const config = structuredClone(active());
  if (!state.code) {
    byId("chat-status").textContent = "Ingresa el código del laboratorio en Configuración.";
    return;
  }
  const message = { role: "user", text: question };
  const oldTitle = chat.title;
  chat.messages.push(message);
  if (chat.messages.length === 1) chat.title = question.slice(0, 55);
  pending.add(chat.id);
  byId("question").value = "";
  byId("chat-status").textContent = "";
  renderChat();
  try {
    const result = await api("chat", {
      question, threadId: chat.id, historyRef: config.history ? chat.historyRef : null,
      config: { ...config, docRef: config.doc?.ref },
    });
    chat.messages.push({ role: "assistant", text: result.answer, configName: config.name,
      context: result.context, fragments: result.fragments, activity: result.activity, usage: result.usage,
      requestBodies: result.requestBodies });
    chat.historyRef = result.historyRef;
  } catch (error) {
    chat.messages = chat.messages.filter(item => item !== message);
    chat.title = oldTitle;
    if (current() === chat) {
      byId("chat-status").textContent = error.message;
      if (!byId("question").value) byId("question").value = question;
    }
  } finally {
    pending.delete(chat.id);
    persist();
    renderChat();
  }
}

byId("show-chat").addEventListener("click", () => screen("chat"));
const openSettings = () => { loadConfig(state.active); screen("settings"); };
byId("show-settings").addEventListener("click", openSettings);
byId("change-config").addEventListener("click", openSettings);
byId("new-chat").addEventListener("click", () => {
  const chat = newChat();
  state.chats.unshift(chat);
  state.chatId = chat.id;
  byId("question").value = "";
  byId("chat-status").textContent = "";
  persist();
  renderChat();
  byId("question").focus();
});
byId("config-form").addEventListener("submit", event => { event.preventDefault(); saveConfig(false); });
byId("duplicate").addEventListener("click", () => saveConfig(true));
byId("saved").addEventListener("change", event => loadConfig(event.target.value));
byId("mode").addEventListener("change", () => { draftDoc = null; byId("pdf").value = ""; renderDoc(); });
byId("upload").addEventListener("click", upload);
byId("access-code").value = state.code;
byId("access-code").addEventListener("input", event => { state.code = event.target.value.trim(); persist(); });
byId("chat-form").addEventListener("submit", send);
loadConfig(state.active);
renderChat();
