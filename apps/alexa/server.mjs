// Serves the simulated Alexa+ page and runs her turns against graspy's /mcp.
//   GRASPY_URL=http://127.0.0.1:8081 AWS_BEARER_TOKEN_BEDROCK=... node server.mjs

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { bedrock, instructionsFrom, takeTurn } from "./agent.mjs";
import { McpClient } from "./mcp-client.mjs";

const GRASPY_URL = (process.env.GRASPY_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
// The public endpoint an Alexa+ add-on would use: the spoken tools only, no sign-in.
const MCP_PATH = process.env.MCP_PATH ?? "/mcp/public";
const KEY = process.env.AWS_BEARER_TOKEN_BEDROCK;
const PORT = Number(process.env.PORT ?? 8790);
if (!KEY) throw new Error("Set AWS_BEARER_TOKEN_BEDROCK: the model that plays Alexa runs on Amazon Bedrock.");

const SKILL = new URL("../../plugins/graspy/skills/teach-maths-with-graspy/SKILL.md", import.meta.url);
const instructions = instructionsFrom(await readFile(SKILL, "utf8"));
const complete = bedrock({ key: KEY, region: process.env.AWS_REGION, model: process.env.MODEL });
const SESSION_MS = 6 * 60 * 60 * 1000;
let connection = null;

async function graspy() {
  if (connection && Date.now() - connection.at < SESSION_MS) return connection;
  const mcp = new McpClient(`${GRASPY_URL}${MCP_PATH}`);
  await mcp.initialize();
  connection = { at: Date.now(), mcp, tools: await mcp.tools() };
  return connection;
}

const send = (response, status, body, type = "application/json") => {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(type === "application/json" ? JSON.stringify(body) : body);
};

const MAX_BODY = 64 * 1024;
const MAX_HISTORY = 60;
const ROLES = new Set(["user", "assistant", "tool"]);

class BadRequest extends Error {}

/** Only this page may ask for a turn: another site's page could otherwise spend the model key from the learner's browser. */
const ownPage = (request) => {
  const origin = request.headers.origin;
  return request.headers["content-type"]?.startsWith("application/json") && (!origin || origin === `http://${request.headers.host}`);
};

const readBody = async (request) => {
  if (!ownPage(request)) throw new BadRequest("Send application/json from the page itself.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new BadRequest("The request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new BadRequest("The request is not JSON.");
  }
};

/** The page sends back what a turn returned: user, assistant and tool messages only, never a system prompt of its own. */
export const validHistory = (history) =>
  Array.isArray(history) && history.length <= MAX_HISTORY && history.every((message) => message && ROLES.has(message.role));

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      return send(response, 200, await readFile(new URL("./index.html", import.meta.url), "utf8"), "text/html; charset=utf-8");
    }
    if (request.method === "POST" && request.url === "/api/turn") {
      const { history = [], said = "" } = await readBody(request);
      if (!validHistory(history)) throw new BadRequest("The conversation is not one this page made.");
      const { mcp, tools } = await graspy();
      return send(response, 200, await takeTurn({ complete, mcp, tools, history, said: String(said).slice(0, 500), instructions }));
    }
    send(response, 404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequest) return send(response, 400, { error: error.message });
    connection = null;
    console.error(error.message);
    send(response, 502, { error: error.message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Alexa+ simulator on http://127.0.0.1:${PORT} → ${GRASPY_URL}${MCP_PATH}`));
