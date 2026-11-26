import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcp } from "../server/mcp.js";
import { consultarAvance } from "../server/estudiantes.js";

const url = new URL("https://simulador.example/api/mcp");
const env = { MCP_ACCESS_TOKEN: "testing-mcp-only" };

test("un segundo cliente MCP descubre e invoca la misma consulta de avance", async () => {
  const client = new Client({ name: "tutores", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: "Bearer " + env.MCP_ACCESS_TOKEN } },
    fetch: (input, options) => handleMcp(new Request(input, options), env),
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ["consultar_avance"]);
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.equal(tools[0].inputSchema.properties.cedula.type, "string");

    for (const cedula of ["0000000002", "0000000004", "0000000099"]) {
      const result = await client.callTool({ name: "consultar_avance", arguments: { cedula } });
      assert.deepEqual(result.structuredContent, consultarAvance(cedula));
    }
    const invalid = await client.callTool({ name: "consultar_avance", arguments: { cedula: "2" } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
});

test("el endpoint MCP exige su token", async () => {
  const result = await handleMcp(new Request(url, {
    method: "POST", headers: { Authorization: "Bearer incorrecto" },
  }), env);
  assert.equal(result.status, 401);
});
