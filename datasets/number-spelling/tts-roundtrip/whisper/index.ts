// Transcribes base64 audio clips with Whisper on Workers AI, for run.py. POST {"items":[{"id","audio"}]}.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { items } = (await request.json()) as { items: { id: string; audio: string }[] };
    const out = [];
    for (const { id, audio } of items) {
      const t = Date.now();
      try {
        const r = (await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio, language: "en" })) as { text?: string };
        out.push({ id, text: (r.text ?? "").trim(), ms: Date.now() - t });
      } catch (e) {
        out.push({ id, text: null, error: String(e).slice(0, 150), ms: Date.now() - t });
      }
    }
    return Response.json(out);
  },
};
