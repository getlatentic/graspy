import { routeAgentRequest } from "agents";
import { checkLlmConfig } from "./llm-config";

export { Learner } from "./learner";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    checkLlmConfig(env);
    const routed = await routeAgentRequest(request, env);
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
