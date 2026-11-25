import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import lab from "../api/lab.js";

const types = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", pdf: "application/pdf" };
const port = Number(process.env.PORT || 3000);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:" + port);
    if (url.pathname === "/api/lab") {
      const withBody = !["GET", "HEAD"].includes(req.method);
      const result = await lab.fetch(new Request(url, {
        method: req.method, headers: req.headers,
        ...(withBody && { body: Readable.toWeb(req), duplex: "half" }),
      }));
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }

    const filename = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (req.method !== "GET" || !/^[a-z0-9._-]+\.(html|js|css|pdf)$/i.test(filename)) {
      res.writeHead(404).end("Página no encontrada");
      return;
    }
    const data = await readFile(new URL("../public/" + filename, import.meta.url));
    res.writeHead(200, { "Content-Type": types[filename.split(".").at(-1)] }).end(data);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500).end("No se pudo cargar el recurso");
  }
}).listen(port, "127.0.0.1", () => console.log("Laboratorio disponible en http://localhost:" + port));
