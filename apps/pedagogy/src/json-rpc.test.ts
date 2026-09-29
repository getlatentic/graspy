import { afterEach, describe, expect, it } from "vitest";
import { JsonRpcProcess } from "./json-rpc.ts";

const ECHO = `
require("readline").createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  console.log(JSON.stringify({ jsonrpc: "2.0", method: "job.progress", params: {} }));
  if (method === "fail") console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { message: "no" } }));
  else if (method === "die") process.exit(3);
  else console.log(JSON.stringify({ jsonrpc: "2.0", id, result: { method, params } }));
});`;

let engine: JsonRpcProcess | null = null;
afterEach(() => engine?.close());

describe("JsonRpcProcess", () => {
  it("matches each reply to its call and ignores notifications", async () => {
    engine = new JsonRpcProcess("node", ["-e", ECHO]);
    const [a, b] = await Promise.all([engine.call("a", { n: 1 }), engine.call("b")]);
    expect(a).toEqual({ method: "a", params: { n: 1 } });
    expect(b).toEqual({ method: "b", params: {} });
  });

  it("rejects a call the engine answers with an error", async () => {
    engine = new JsonRpcProcess("node", ["-e", ECHO]);
    await expect(engine.call("fail")).rejects.toThrow("no");
  });

  it("rejects calls waiting when the engine dies", async () => {
    engine = new JsonRpcProcess("node", ["-e", ECHO]);
    await expect(engine.call("die")).rejects.toThrow(/code 3/);
  });
});
