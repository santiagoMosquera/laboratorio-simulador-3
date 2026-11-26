import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const cedula = process.argv[2] ?? "0000000002";
const url = process.argv[3] ?? process.env.MCP_SERVER_URL?.trim() ?? "";
const token = process.env.MCP_ACCESS_TOKEN?.trim();
const client = new Client({ name: "asistente-de-tutores-demo", version: "1.0.0" });

try {
  if (!/^\d{10}$/.test(cedula)) throw new Error("Usa una cédula ficticia de diez dígitos.");
  if (!token) throw new Error("Configura MCP_ACCESS_TOKEN en .env.local.");
  await client.connect(new StreamableHTTPClientTransport(new URL(url || "http://127.0.0.1:3000/api/mcp"), {
    requestInit: { headers: { Authorization: "Bearer " + token } },
  }));
  const catalogo = await client.listTools();
  console.log("tools/list", JSON.stringify(catalogo, null, 2));
  const tool = catalogo.tools.find(item => item.name === "consultar_avance");
  if (!tool) throw new Error("El servidor no ofrece consultar_avance.");
  const resultado = await client.callTool({ name: tool.name, arguments: { cedula } });
  console.log("tools/call", JSON.stringify(resultado, null, 2));
  if (resultado.isError) process.exitCode = 1;
} catch (error) {
  console.error("Cliente de tutores:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
