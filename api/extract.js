// Vercel serverless function: POST /api/extract  { url, text }
import { handleExtract } from "../lib/handler.js";

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST" });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { status, body: out } = await handleExtract(body || {}, req.headers);
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(out);
}
