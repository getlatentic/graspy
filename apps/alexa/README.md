# Alexa+ with graspy

This is a development tool, not shipped to learners: a stand-in for Alexa+ and an end-to-end check of graspy's `/mcp/public` tools. It can be retired when Amazon opens add-on access to us (planning issue getlatentic/planning#720).

A simulated Alexa+ that teaches a child maths by calling graspy's tutor as tools over MCP.

Alexa+ is the assistant the child talks to: the voice, the conversation, everything that is not maths. graspy is a tool she calls when the child wants to practise. The split is deliberate:

- graspy makes each question in code and marks each answer in code (`apps/server/src/app/spoken`). The assistant never decides what is right.
- Alexa says the question exactly as graspy wrote it, passes on what the child said, and turns graspy's verdict, hint or worked answer into warm speech.
- Her tools are the four `/mcp/public` lists (`next_question`, `check_answer`, `hint`, `show_working`): a public endpoint with no sign-in, because none of them touches a learner's record. The page shows each call and what graspy answered.
- Her instructions are the plugin's skill, `plugins/graspy/skills/teach-maths-with-graspy/SKILL.md`, read when the server starts. `plugins/graspy` is an [Agent Plugins](https://agent-plugins.org/) package (`plugin.json`, `mcp.json`, the skill) that any MCP client can install; it points at the staging server until production is chosen.

The assistant here is `openai.gpt-oss-120b` on Amazon Bedrock. A real Alexa+ add-on would use the same endpoint as its server URL. We could not register one: the add-ons console says "Coming Soon" for our account and the `alexa-ai` CLI is not public, so this has not been tried against Alexa+.

## Run it

You need Node 24 and [uv](https://docs.astral.sh/uv/). From the repository root, start graspy's API (see `docs/DEVELOPMENT.md` for its settings):

```bash
cd apps/server && uv run serve        # http://127.0.0.1:8081
```

Then the simulator, with an Amazon Bedrock API key:

```bash
cd apps/alexa
AWS_BEARER_TOKEN_BEDROCK=... node server.mjs   # http://127.0.0.1:8790
```

Open the page and talk or type. The microphone and the voice need Chrome or Edge. `GRASPY_URL` points the simulator at another graspy server, `MODEL` at another model, and `LLM_BASE_URL` at another Bedrock base URL (default `https://bedrock-mantle.us-east-1.api.aws/v1`; an origin alone gets `/v1`). Like the server, it sends the key only to `bedrock-mantle.<region>.api.aws` over https on port 443 and stops at startup on anything else.

```bash
node --test agent.test.mjs
```

## Files

| File | What it does |
|---|---|
| `mcp-client.mjs` | A small MCP client: handshake, `tools/list` for the model's tools, `tools/call` |
| `agent.mjs` | Alexa's turn: the model calls tools until it has something to say; a question is said as graspy wrote it |
| `server.mjs` | Serves the page and runs a turn for it |
| `index.html` | The page: ring, transcript, voice in and out, and the calls graspy answered |
