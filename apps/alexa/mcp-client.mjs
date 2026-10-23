// A minimal MCP client for graspy's /mcp: Streamable HTTP, one JSON answer per POST.

const PROTOCOL_VERSION = "2025-11-25";

export class McpClient {
  #next = 1;

  /** `url` is the MCP endpoint; `token` is a session for an endpoint that asks for one, and null for the public one. */
  constructor(url, token = null, fetchImpl = fetch) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async #post(message) {
    const response = await this.fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        "mcp-protocol-version": PROTOCOL_VERSION,
      },
      body: JSON.stringify(message),
    });
    if (response.status === 202) return null;
    if (!response.ok) throw new Error(`graspy /mcp answered ${response.status}`);
    return response.json();
  }

  async request(method, params = {}) {
    const answer = await this.#post({ jsonrpc: "2.0", id: this.#next++, method, params });
    if (answer.error) throw new Error(`${method}: ${answer.error.message}`);
    return answer.result;
  }

  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "alexa-plus-simulator", version: "1.0.0" },
    });
    await this.#post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return result;
  }

  /** The tools an assistant may call: those the server lists for the model and no view. */
  async tools() {
    const { tools } = await this.request("tools/list");
    return tools.filter((tool) => (tool._meta?.ui?.visibility ?? ["model", "app"]).join() === "model");
  }

  async call(name, args) {
    return this.request("tools/call", { name, arguments: args });
  }
}
