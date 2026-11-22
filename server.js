// Minimal Node server for local dev or any Node host (Render, Railway, Fly...).
// Serves ./public and POST /api/extract.   Usage: ANTHROPIC_API_KEY=... npm start
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleExtract } from "./lib/handler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function readBody(req, limit = 100_000) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw new Error("Body too large");
  }
  return data ? JSON.parse(data) : {};
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/api/extract") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let body;
    try { body = await readBody(req); } catch {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Bad request" }));
      return;
    }
    const { status, body: out } = await handleExtract(body, req.headers);
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(out));
    return;
  }

  // Static files; unknown paths fall back to index.html (share target lands on /?...)
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(PUBLIC, "index.html");
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": path.basename(file) === "sw.js" ? "no-cache" : "public, max-age=0",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, () => console.log(`Recipe app on http://localhost:${PORT}`));
