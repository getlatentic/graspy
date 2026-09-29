// Runs the tutor's real spelling prompt on a list of lines and returns the model's raw reply and the
// automated check's verdict for each. See ../README.md for how it was used.
import { asLine, spellingBrief, verdictOf } from "../../../apps/tutor/src/spell";
import { complete } from "../../../apps/tutor/src/speller-host";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { lines } = (await request.json()) as { lines: { id: string; line: string }[] };
    const out = [];
    for (const { id, line } of lines) {
      const started = Date.now();
      let reply: string | null = null;
      let error: string | null = null;
      try {
        reply = asLine(await complete(env, spellingBrief(line)));
      } catch (caught) {
        error = String(caught);
      }
      out.push({ id, reply, error, ms: Date.now() - started, verdict: /\d/.test(line) ? verdictOf(line, reply) : "no_digits" });
    }
    return Response.json(out);
  },
};
