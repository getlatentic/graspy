import { afterEach, describe, expect, it, vi } from "vitest";
import { spellNumbers } from "../src/spell";
import { SPELL_TIMEOUT_MS, bedrockPath } from "../src/speller-host";

function speller(reply: unknown, calls: { n: number } = { n: 0 }) {
  return {
    calls,
    env: {
      AI: {
        run: async () => {
          calls.n += 1;
          if (reply instanceof Error) throw reply;
          return { choices: [{ message: { content: reply } }] };
        },
      },
    } as unknown as Env,
  };
}

describe("spellNumbers", () => {
  it("does not ask a model about a line with no digits", async () => {
    const { env, calls } = speller("x");
    expect(await spellNumbers(env, "Well done!", "en")).toBe("Well done!");
    expect(calls.n).toBe(0);
  });

  it("takes the model's spelling when every number comes back as its words, in order", async () => {
    const { env } = speller("You said forty-five. Now say fifty.");
    expect(await spellNumbers(env, "You said 45. Now say 50.", "en")).toBe("You said forty-five. Now say fifty.");
  });

  it.each([
    ["a changed number", "You said fifty-four. Now say fifty."],
    ["a number out of order", "You said fifty. Now say forty-five."],
    ["digits left in", "You said forty-five. Now say 50."],
    ["a rewritten line", "You said forty-five. Now say fifty. ".repeat(6)],
    ["nothing at all", ""],
  ])("keeps the line as it was after %s", async (_why, reply) => {
    const { env } = speller(reply);
    expect(await spellNumbers(env, "You said 45. Now say 50.", "en")).toBe("You said 45. Now say 50.");
  });

  it.each([
    ["Say 5.", "Say fifty-five."],
    ["You said 2.", "You said twenty-two."],
    ["Count to 20.", "Count to twenty-five."],
    ["You got 100.", "You got one hundred twenty."],
    ["You said 7.", "You said seventy-seven."],
    ["Take 3 from 5.", "Take thirty-three from fifty-five."],
  ])("does not let a number grow into a longer one: %s", async (line, reply) => {
    const { env } = speller(reply);
    expect(await spellNumbers(env, line, "en")).toBe(line);
  });

  it("takes a short line whose numbers spell out long", async () => {
    const { env } = speller("Twelve times twelve is one hundred and forty-four.");
    expect(await spellNumbers(env, "12 times 12 is 144.", "en")).toBe("Twelve times twelve is one hundred and forty-four.");
  });

  it.each([
    ["-2.5", "two point five"],
    ["Add 100 and 20.", "Add one hundred and twenty."],
    ["10-5=5.", "Ten to five equals five."],
    ["You got 2.5% of them.", "You got two point five of them."],
    ["Oh, you have 5!", "Zero, you have five!"],
    ["5 - 3 = 2.", "Five negative three equals two."],
  ])("does not take %s spelled as %s", async (line, reply) => {
    const { env } = speller(reply);
    expect(await spellNumbers(env, line, "en")).toBe(line);
  });

  it.each([
    ["What is 3-7?", "What is three to seven?"],
    ["It is –5 degrees.", "It is five degrees."],
    ["What is 8 – 5?", "What is eight five?"],
    ["Is 5 ≥ 3?", "Is five three?"],
    ["Add 100 AND 20.", "Add one hundred and twenty."],
  ])("does not take %s spelled as %s", async (line, reply) => {
    const { env, calls } = speller(reply);
    expect(await spellNumbers(env, line, "en")).toBe(line);
    expect(calls.n).toBe(0);
  });

  it("takes a minus in front of a decimal", async () => {
    const { env } = speller("It is minus two point five degrees.");
    expect(await spellNumbers(env, "It is -2.5 degrees.", "en")).toBe("It is minus two point five degrees.");
  });

  it("keeps the line, and the marked answer, when a number is too long to write", async () => {
    const { env, calls } = speller("anything");
    const line = "1" + ",000".repeat(1000);
    expect(await spellNumbers(env, line, "en")).toBe(line);
    expect(calls.n).toBe(0);
  });

  it("does not let a word beside a number change", async () => {
    const { env } = speller("That is right, forty-five.");
    expect(await spellNumbers(env, "That is wrong, 45.", "en")).toBe("That is wrong, 45.");
  });

  it.each([
    ["You got 21.", "You got twenty and one."],
    ["You got 21.", "You got twenty, one."],
    ["You got 56.", "You got fifty and six."],
  ])("does not let one number become two: %s", async (line, reply) => {
    const { env } = speller(reply);
    expect(await spellNumbers(env, line, "en")).toBe(line);
  });

  it("takes the small differences of writing: case, hyphens and an added 'and'", async () => {
    expect(await spellNumbers(speller("you got One Hundred and five!").env, "You got 105!", "en")).toBe("you got One Hundred and five!");
    expect(await spellNumbers(speller("You said forty five.").env, "You said 45.", "en")).toBe("You said forty five.");
  });

  it("does not trust the model with a line that has more than one reading", async () => {
    for (const line of ["It happened in 1990.", "Call 08012345678.", "Sit in seat B7.", "Half is 1/2.", "The team is U12."]) {
      const { env, calls } = speller("anything");
      expect(await spellNumbers(env, line, "en")).toBe(line);
      expect(calls.n).toBe(0);
    }
  });

  it.each([
    ["It is 3:30 now.", "It is three thirty now."],
    ["You paid ₦500.", "You paid five hundred naira."],
    ["You got 50% of them.", "You got fifty percent of them."],
    ["3 + 4 = 7.", "Three plus four equals seven."],
    ["It weighs 3 kg.", "It weighs three kilograms."],
    ["It weighs 3 kg.", "It weighs three kilogram."],
    ["Draw a line of 10 cm.", "Draw a line of ten centimeters."],
    ["Count 5-10.", "Count five to ten."],
    ["-5 is below zero.", "Negative five is below zero."],
    ["You came 1st!", "You came first!"],
    ["3 x 4 = 12.", "Three times four is twelve."],
    ["It is 7:05 now.", "It is seven zero five now."],
  ])("takes the spelling of %s as %s", async (line, reply) => {
    const { env } = speller(reply);
    expect(await spellNumbers(env, line, "en")).toBe(reply);
  });

  it.each([
    ["It is 3:30 now.", "It is three:thirty now."],
    ["You paid ₦500.", "You paid ₦five hundred."],
    ["You got 50% of them.", "You got fifty% of them."],
    ["3 + 4 = 7.", "Three + four = seven."],
    ["It weighs 3 kg.", "It weighs three kg."],
    ["Count 5-10.", "Count five-ten."],
    ["School starts at 8:00.", "School starts at eight zero zero."],
    ["It is 3:30 now.", "It is three fifty now."],
  ])("does not take %s spelled as %s", async (line, reply) => {
    const { env } = speller(reply);
    expect(await spellNumbers(env, line, "en")).toBe(line);
  });

  it("leaves every other language for the teacher to rewrite, until English is proven", async () => {
    const { env, calls } = speller("okan");
    expect(await spellNumbers(env, "O ka 1, 2.", "yo")).toBe("O ka 1, 2.");
    expect(await spellNumbers(env, "Na 5.", "pcm")).toBe("Na 5.");
    expect(calls.n).toBe(0);
  });

  it("keeps the line when the model cannot be reached", async () => {
    const { env } = speller(new Error("down"));
    expect(await spellNumbers(env, "You said 45.", "en")).toBe("You said 45.");
  });
});

describe("the spelling model's host", () => {
  afterEach(() => vi.unstubAllGlobals());
  const bedrock = { SPELLER_HOST: "bedrock", AWS_BEARER_TOKEN_BEDROCK: "key", AI: { run: () => Promise.reject(new Error("not used")) } } as unknown as Env;

  it("asks Workers AI unless told otherwise", async () => {
    const { env, calls } = speller("You said forty-five.");
    expect(await spellNumbers(env, "You said 45.", "en")).toBe("You said forty-five.");
    expect(calls.n).toBe(1);
  });

  it("asks Bedrock, with its key and the model's Bedrock name, when SPELLER_HOST is bedrock", async () => {
    const fetched = vi.fn(async () => Response.json({ choices: [{ message: { content: "You said forty-five." } }] }));
    vi.stubGlobal("fetch", fetched);

    expect(await spellNumbers(bedrock, "You said 45.", "en")).toBe("You said forty-five.");

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer key");
    expect(JSON.parse(String(init.body)).model).toBe("google.gemma-4-e2b");
  });

  it("asks Bedrock for Gemma 4 on its own path, without a reasoning setting", async () => {
    const fetched = vi.fn(async () => Response.json({ choices: [{ message: { content: "You said forty-five." } }] }));
    vi.stubGlobal("fetch", fetched);
    const gemma = { ...bedrock, SPELLER_MODEL: "google.gemma-4-e2b" } as unknown as Env;

    await spellNumbers(gemma, "You said 45.", "en");

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "google.gemma-4-e2b" });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("reasoning_effort");
  });

  it("chooses the path by model", () => {
    expect(bedrockPath("google.gemma-4-31b")).toBe("/openai/v1");
    expect(bedrockPath("openai.gpt-oss-20b")).toBe("/v1");
    expect(bedrockPath("qwen.qwen3-next-80b-a3b-instruct")).toBe("/v1");
  });

  it("keeps the line when Bedrock is chosen without its key, or refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    expect(await spellNumbers(bedrock, "You said 45.", "en")).toBe("You said 45.");
    const keyless = { ...bedrock, AWS_BEARER_TOKEN_BEDROCK: undefined } as unknown as Env;
    expect(await spellNumbers(keyless, "You said 45.", "en")).toBe("You said 45.");
  });

  it("keeps the line when the host is not one it knows", async () => {
    const odd = { SPELLER_HOST: "elsewhere" } as unknown as Env;
    expect(await spellNumbers(odd, "You said 45.", "en")).toBe("You said 45.");
  });
});

describe("a spelling that stalls", () => {
  afterEach(() => vi.useRealTimers());

  it("is given up on after four seconds, and the line goes back as it was", async () => {
    vi.useFakeTimers();
    const env = { AI: { run: () => new Promise(() => {}) } } as unknown as Env;

    const spelled = spellNumbers(env, "You said 45.", "en");
    await vi.advanceTimersByTimeAsync(SPELL_TIMEOUT_MS + 1);

    expect(await spelled).toBe("You said 45.");
  });

  it("does not hold a timer once the model has answered", async () => {
    vi.useFakeTimers();
    const { env } = speller("You said forty-five.");

    expect(await spellNumbers(env, "You said 45.", "en")).toBe("You said forty-five.");
    expect(vi.getTimerCount()).toBe(0);
  });
});
