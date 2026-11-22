/**
 * The maths check as a local HTTP server, for apps/server/scripts/measure_check_maths.py: the same
 * handler the Worker serves at POST /maths/check, with no Workers runtime around it.
 *
 *     node bench/maths-check-server.ts 8797
 */
import { createServer } from "node:http";
import { handleMathsCheck } from "../src/maths-check.ts";

const port = Number(process.argv[2] ?? 8797);

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const request = new Request(`http://localhost${incoming.url}`, {
    method: incoming.method,
    headers: { "Content-Type": "application/json" },
    body: incoming.method === "POST" ? Buffer.concat(chunks) : undefined,
  });
  const response = await handleMathsCheck(request);
  outgoing.writeHead(response.status, { "Content-Type": "application/json" });
  outgoing.end(await response.text());
}).listen(port, "127.0.0.1", () => console.log(`maths check on ${port}`));
