import { describe, expect, it } from "vitest";
import { z } from "zod";

import contract from "../../contracts/command-answers.json";
import { READS_THE_ANSWER, type Unread } from "./commandAnswers";
import { levelled } from "./levelled";
import { payloadFields, type Definitions } from "./payloadFields";

/**
 * The two halves of a Tauri command, held to each other.
 *
 * Three contracts broke in one week with both suites green — a renamed key on
 * a shipped scheme package, a renamed key inside a sealed plan, and a lesson
 * workspace the frontend then refused to read at all. Every one was found by
 * opening the app and reading an error a teacher would have met first.
 *
 * `contracts/command-answers.json` is written by the Rust suite from the types
 * the commands actually use, so it cannot drift from them without that suite
 * failing. What is checked here is the other half.
 */
const backend = contract as { answers: Record<string, unknown>; types: Definitions };

const parsed = Object.entries(READS_THE_ANSWER).flatMap(([command, reader]) =>
  reader instanceof z.ZodType ? [{ command, reader }] : [],
);

describe("what a command answers with", () => {
  /// A command nobody said how to read is a command whose answer can change
  /// shape in silence, which is the whole of this.
  it("is said for every command, and for nothing that is not one", () => {
    expect(Object.keys(READS_THE_ANSWER).sort()).toEqual(Object.keys(backend.answers).sort());
  });

  it.each(parsed)("$command sends what its schema reads", ({ command, reader }) => {
    const read = z.toJSONSchema(reader, { io: "output", unrepresentable: "any" });

    const [sends, reads] = levelled(
      payloadFields(backend.answers[command], backend.types),
      payloadFields(read, (read.$defs ?? {}) as Definitions),
    );

    expect(sends).toEqual(reads);
  });

  /// An answer nothing parses reaches the screen unchecked, so each one is
  /// named rather than left to be discovered.
  it("names the answers nothing parses yet", () => {
    const unparsed: Unread = "nothing parses this answer yet";

    expect(
      Object.keys(READS_THE_ANSWER).filter((command) => READS_THE_ANSWER[command] === unparsed),
    ).toEqual([
      "download_model",
      "download_photograph_reading",
      "get_model_installation",
      "get_photograph_reading_installation",
      "import_model",
      "import_photograph_reading",
      "launch_health",
      "list_lesson_models",
      "retry_launch",
    ]);
  });
});
