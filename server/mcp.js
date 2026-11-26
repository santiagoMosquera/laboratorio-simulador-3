import { createHash, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { consultarAvance, herramientaAvance } from "./estudiantes.js";

const digest = text => createHash("sha256").update(text).digest();

export async function handleMcp(request, env = process.env) {
  const token = env.MCP_ACCESS_TOKEN?.trim();
  const headers = { "Cache-Control": "no-store" };
  if (!token) return new Response("MCP no está configurado.", { status: 503, headers });
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest("Bearer " + token))) {
    headers["WWW-Authenticate"] = "Bearer";
    return new Response("Se requiere el token del servidor MCP.", { status: 401, headers });
  }

  const server = new McpServer({ name: "simulador-3", version: "1.0.0" });
  server.registerTool(herramientaAvance.name, {
    description: herramientaAvance.description,
    inputSchema: z.strictObject({
      cedula: z.string().regex(/^\d{10}$/).describe(herramientaAvance.parameters.properties.cedula.description),
    }),
    annotations: { readOnlyHint: true },
  }, ({ cedula }) => {
    const result = consultarAvance(cedula);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
