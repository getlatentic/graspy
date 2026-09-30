import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportSamples } from "./export-samples.ts";
import { sampleOf } from "./samples.ts";
import type { Run } from "./turn-log.ts";

function wav(seconds: number): Buffer {
  const data = Buffer.alloc(48_000 * 2 * seconds);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(48_000, 24);
  head.writeUInt32LE(96_000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const run: Run = {
  id: "r1", voice: { engine: "yarngo", reference: "voice-1", pitch: 1.2 }, persona: "sure", language: "en",
  learnerClass: "primary_4", plan: "p", startedAt: "2026-09-29T10:00:00Z", finished: "rest",
  turns: [
    {
      index: 1,
      move: { kind: "event", planId: "p", eventId: "e", event: "elicit_performance", promptId: "mul_fact_7x8_answer", says: "What is seven times eight?", shows: "7 × 8", asksForAnswer: true, reason: null },
      child: { said: "fifty six", isRight: true, note: "" },
      answerAudio: "answers/01.wav",
      marking: { heard: "56", parsedAnswer: 56, decision: "correct", feedback: "Well done", provider: "intron", latencyMs: 900 },
      replyWaitMs: 1000, pageNote: null, screenshots: [],
    },
    {
      index: 2,
      move: { kind: "event", planId: "p", eventId: "e2", event: "present_content", promptId: null, says: "Seven eights.", shows: null, asksForAnswer: false, reason: null },
      child: null, answerAudio: null, marking: null, replyWaitMs: null, pageNote: null, screenshots: [],
    },
  ],
};

describe("sampleOf", () => {
  it("says the recording is synthetic and keeps what the recogniser heard", () => {
    const record = sampleOf(run, run.turns[0], wav(2), { sampleRateHz: 48_000, channels: 1, bitsPerSample: 16, durationSeconds: 2 }, "audio/a.wav", "en");
    expect(record).toMatchObject({
      sample_id: "r1-t01", synthetic: true, intended_text: "fifty six", prompt_id: "mul_fact_7x8_answer",
      recogniser: { transcript: "56", parsed_answer: 56 }, hearing_fidelity: 1, decision: "correct", duration_seconds: 2,
      speaker: { engine: "yarngo", reference: "voice-1", pitch: 1.2, persona: "sure" },
    });
  });

  it("makes no sample of a turn in which nobody spoke", () => {
    expect(sampleOf(run, run.turns[1], wav(1), { sampleRateHz: 48_000, channels: 1, bitsPerSample: 16, durationSeconds: 1 }, "x", "en")).toBeNull();
  });
});

describe("exportSamples", () => {
  it("copies each recording once, however often it runs", () => {
    const root = mkdtempSync(join(tmpdir(), "export-"));
    const runDir = join(root, "runs", "r1");
    mkdirSync(join(runDir, "answers"), { recursive: true });
    writeFileSync(join(runDir, "run.json"), JSON.stringify({ run }));
    writeFileSync(join(runDir, "answers", "01.wav"), wav(2));
    const dest = join(root, "out");

    expect(exportSamples(join(root, "runs"), dest)).toBe(1);
    expect(exportSamples(join(root, "runs"), dest)).toBe(0);
    const lines = readFileSync(join(dest, "metadata.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(readFileSync(join(dest, "README.md"), "utf8")).toContain("synthetic");
  });
});
