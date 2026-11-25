import { createServer } from "node:http";
import { evaluate, parseRequest, reportDigest, AGENT_CARD } from "./index.js";

const port = Number(process.env.CIRCUIT_EVALUATOR_PORT ?? 15192);
if (!Number.isInteger(port) || port < 15191 || port > 15199) throw new Error("Use a spare fixture port 15191–15199");
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const host = req.headers.host;
  if (req.socket.remoteAddress !== "127.0.0.1" || host !== "127.0.0.1:" + port) { res.writeHead(403); res.end('{"error":"Loopback peer and expected Host required"}'); return; }
  if (req.method === "GET" && req.url === "/health") { res.end('{"status":"ready","network":"bsc-testnet"}'); return; }
  if (req.method === "GET" && req.url === "/agent-card") { res.end(JSON.stringify(AGENT_CARD)); return; }
  if (req.method !== "POST" || req.url !== "/evaluate") { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
  let bytes = 0; const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) { const b = Buffer.from(chunk); bytes += b.length; if (bytes > 4096) { res.writeHead(413); res.end('{"error":"Request too large"}'); return; } chunks.push(b); }
    const input = parseRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const report = await evaluate(input);
    res.end(JSON.stringify({ report, digest: reportDigest(report) }));
  } catch (error) { res.writeHead(400); res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Evaluation failed" })); }
});
server.listen(port, "127.0.0.1", () => process.stdout.write("Wattness evaluator listening on fixture port " + port + "\n"));
