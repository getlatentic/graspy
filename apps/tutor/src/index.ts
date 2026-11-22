import { routeAgentRequest } from "agents";
import { checkLlmConfig } from "./llm-config";
import { handleMathsCheck } from "./maths-check";

export { Learner } from "./learner";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    checkLlmConfig(env);
    if (new URL(request.url).pathname === "/maths/check") return handleMathsCheck(request);
    const routed = await routeAgentRequest(request, env);
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
