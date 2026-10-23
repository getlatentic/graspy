// Serves the simulated Alexa+ page and runs her turns against graspy's /mcp.
//   GRASPY_URL=http://127.0.0.1:8081 AWS_BEARER_TOKEN_BEDROCK=... node server.mjs

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { bedrock, takeTurn } from "./agent.mjs";
import { McpClient, sessionFor } from "./mcp-client.mjs";

const GRASPY_URL = (process.env.GRASPY_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const KEY = process.env.AWS_BEARER_TOKEN_BEDROCK;
const PORT = Number(process.env.PORT ?? 8790);
if (!KEY) throw new Error("Set AWS_BEARER_TOKEN_BEDROCK: the model that plays Alexa runs on Amazon Bedrock.");

const complete = bedrock({ key: KEY, region: process.env.AWS_REGION, model: process.env.MODEL });
const SESSION_MS = 6 * 60 * 60 * 1000;
let connection = null;

async function graspy() {
  if (connection && Date.now() - connection.at < SESSION_MS) return connection;
  const mcp = new McpClient(GRASPY_URL, await sessionFor(GRASPY_URL, `alexa-${randomUUID()}`));
  await mcp.initialize();
  connection = { at: Date.now(), mcp, tools: await mcp.tools() };
  return connection;
}

const send = (response, status, body, type = "application/json") => {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(type === "application/json" ? JSON.stringify(body) : body);
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
};

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      return send(response, 200, await readFile(new URL("./index.html", import.meta.url), "utf8"), "text/html; charset=utf-8");
    }
    if (request.method === "POST" && request.url === "/api/turn") {
      const { history = [], said = "" } = await readBody(request);
      const { mcp, tools } = await graspy();
      return send(response, 200, await takeTurn({ complete, mcp, tools, history, said: String(said).slice(0, 500) }));
    }
    send(response, 404, { error: "not found" });
  } catch (error) {
    connection = null;
    console.error(error.message);
    send(response, 502, { error: error.message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Alexa+ simulator on http://127.0.0.1:${PORT} → ${GRASPY_URL}/mcp`));
