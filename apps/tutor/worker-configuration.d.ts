interface Env {
  Learner: DurableObjectNamespace<import("./src/learner").Learner>;
  /** Workers AI. Typed by what we ask of it, because the shipped catalogue predates gpt-oss-120b. */
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
  AUDIO: R2Bucket;
  SPITCH_API_KEY: string;
  /** Where the spelling model runs: workers-ai (the default) or bedrock. */
  SPELLER_HOST?: string;
  /** Bedrock's key and region, needed only when SPELLER_HOST is bedrock. Secret and variable. */
  AWS_BEARER_TOKEN_BEDROCK?: string;
  AWS_REGION?: string;
}
