interface Env {
  Learner: DurableObjectNamespace<import("./src/learner").Learner>;
  /** Workers AI. Typed by what we ask of it, because the shipped catalogue predates gpt-oss-120b. */
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
  AUDIO: R2Bucket;
  SPITCH_API_KEY: string;
}
