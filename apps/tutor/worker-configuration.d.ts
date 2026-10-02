interface Env {
  Learner: DurableObjectNamespace<import("./src/learner").Learner>;
  /** Workers AI. Typed by what we ask of it, because the shipped catalogue predates gpt-oss-120b. */
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
  AUDIO: R2Bucket;
  SPITCH_API_KEY: string;
  /** Where the spelling model runs: workers-ai (the default) or bedrock. */
  SPELLER_HOST?: string;
  /** The model on that host; each host has a default. */
  SPELLER_MODEL?: string;
  /** Bedrock's key and region, needed only when SPELLER_HOST is bedrock. Secret and variable. */
  AWS_BEARER_TOKEN_BEDROCK?: string;
  AWS_REGION?: string;
  /** "clef" reads what a child meant with Cloudflare's Clef decision model (src/interpret.ts); unset keeps the small reader. */
  INTERPRETER?: string;
  /** "on" routes what a child said that is no number to an action (src/router.ts); unset leaves the usual marking. */
  ROUTER?: string;
  /** The Bedrock model that routes when Clef is not sure; google.gemma-4-26b-a4b by default. */
  ROUTER_MODEL?: string;
  /** "on" reads what a child said as an observation of independent judgments that policy.ts decides on, in place of the router's one choice; "shadow" runs it beside the router and only logs the two (src/shadow.ts). */
  OBSERVER?: string;
  /** "on" adds the child's words to the shadow log; for staging, where the children are simulated. */
  OBSERVER_LOG_TEXT?: string;
  /** The Bedrock model that observes; the router's model by default. */
  OBSERVER_MODEL?: string;
}
