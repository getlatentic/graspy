import { describe, expect, it, vi } from "vitest";
import { createHaptics, type HapticsDeps } from "./create-haptics";
import { vibrationOutput } from "./haptic-device";
import { gamepadOutput } from "./haptic-gamepad";
import { MIN_GAP_MS } from "./haptic-patterns";

function setup(over: Partial<HapticsDeps> = {}) {
  const vibrate = vi.fn((_pattern: unknown) => true);
  const clock = { at: 1000 };
  const haptics = createHaptics({
    outputs: [vibrationOutput({ vibrate })!],
    enabled: () => true,
    hidden: () => false,
    reducedMotion: () => false,
    activated: () => true,
    now: () => clock.at,
    ...over,
  });
  return { haptics, vibrate, clock };
}

const pad = (playEffect: unknown, connected = true) =>
  ({ connected, vibrationActuator: { playEffect, reset: vi.fn() } }) as never;

describe("haptics", () => {
  it("vibrates the cue's pattern where the device can", () => {
    const { haptics, vibrate } = setup();
    haptics.trigger("wrong");
    expect(vibrate).toHaveBeenCalledWith([18, 70, 18]);
    expect(haptics.supported()).toBe(true);
  });

  it("does nothing where there is no output", () => {
    const { haptics } = setup({
      outputs: [vibrationOutput({}), vibrationOutput(undefined)].filter(
        (output) => output !== null,
      ),
    });
    expect(() => haptics.trigger("correct")).not.toThrow();
    expect(() => haptics.stop()).not.toThrow();
    expect(haptics.supported()).toBe(false);
  });

  it("is not supported on a desktop that has the method and no touch screen", () => {
    const { haptics } = setup({
      outputs: [vibrationOutput({ vibrate: () => true }, () => false)!],
    });
    expect(haptics.supported()).toBe(false);
  });

  it.each([
    ["the page is hidden", { hidden: () => true }],
    ["the learner prefers reduced motion", { reducedMotion: () => true }],
    ["the learner turned it off", { enabled: () => false }],
    ["nothing has been touched yet", { activated: () => false }],
  ])("is silent when %s", (_, over) => {
    const { haptics, vibrate } = setup(over);
    haptics.trigger("correct");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("drops a cue that comes within the gap, and plays the next one after it", () => {
    const { haptics, vibrate, clock } = setup();
    haptics.trigger("correct");
    clock.at += MIN_GAP_MS - 1;
    haptics.trigger("correct");
    expect(vibrate).toHaveBeenCalledTimes(1);
    clock.at += 1;
    haptics.trigger("correct");
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("lets a more important cue through the gap, and not a less important one", () => {
    const { haptics, vibrate, clock } = setup();
    haptics.trigger("press");
    clock.at += 10;
    haptics.trigger("correct");
    clock.at += 10;
    haptics.trigger("lessonComplete");
    clock.at += 10;
    haptics.trigger("wrong");
    clock.at += 10;
    haptics.trigger("press");
    expect(vibrate.mock.calls.map(([pattern]) => pattern)).toEqual([
      [12],
      [35],
      [25, 55, 35, 60, 45],
    ]);
  });

  it("does not spend the gap on a cue that was not allowed", () => {
    let hidden = true;
    const { haptics, vibrate } = setup({ hidden: () => hidden });
    haptics.trigger("correct");
    hidden = false;
    haptics.trigger("correct");
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("stops a running pattern", () => {
    const { haptics, vibrate } = setup();
    haptics.stop();
    expect(vibrate).toHaveBeenCalledWith(0);
  });

  it("survives a vibrate that throws", () => {
    const { haptics } = setup({
      outputs: [
        vibrationOutput({
          vibrate: () => {
            throw new Error("blocked");
          },
        })!,
      ],
    });
    expect(() => haptics.trigger("correct")).not.toThrow();
  });
});

describe("a controller", () => {
  it("rumbles gently with the cue's effect", () => {
    const playEffect = vi.fn(() => Promise.resolve("complete"));
    const output = gamepadOutput({
      getGamepads: () => [null, pad(playEffect)],
    })!;
    expect(output.available()).toBe(true);
    output.play("lessonComplete");
    const [type, params] = playEffect.mock.calls[0] as unknown as [
      string,
      Record<string, number>,
    ];
    expect(type).toBe("dual-rumble");
    expect(params.weakMagnitude).toBeLessThanOrEqual(0.2);
    expect(params.strongMagnitude).toBeLessThanOrEqual(0.2);
  });

  it("is unavailable with no controller, a disconnected one or no actuator", () => {
    expect(gamepadOutput({})).toBeNull();
    for (const pads of [
      [],
      [null],
      [pad(vi.fn(), false)],
      [{ connected: true }],
    ]) {
      const output = gamepadOutput({ getGamepads: () => pads as never })!;
      expect(output.available()).toBe(false);
      expect(() => output.play("correct")).not.toThrow();
    }
  });

  it("handles an effect the controller refuses", async () => {
    const refusal = Promise.reject(new DOMException("refused"));
    const handled = vi.spyOn(refusal, "catch");
    const playEffect = vi.fn(() => refusal);
    gamepadOutput({ getGamepads: () => [pad(playEffect)] })!.play("correct");
    await refusal.catch(() => undefined);
    expect(playEffect).toHaveBeenCalledOnce();
    expect(handled).toHaveBeenCalled();
  });

  it("rumbles alongside the phone, once each per cue", () => {
    const playEffect = vi.fn(() => Promise.resolve("complete"));
    const phone = vi.fn(() => true);
    const { haptics } = setup({
      outputs: [
        vibrationOutput({ vibrate: phone })!,
        gamepadOutput({ getGamepads: () => [pad(playEffect)] })!,
      ],
    });
    haptics.trigger("correct");
    expect(playEffect).toHaveBeenCalledOnce();
    expect(phone).toHaveBeenCalledOnce();
    expect(phone).toHaveBeenCalledWith([35]);
  });

  it("rumbles before the page has been touched, where a phone would wait", () => {
    const playEffect = vi.fn(() => Promise.resolve("complete"));
    const phone = vi.fn(() => true);
    const { haptics } = setup({
      activated: () => false,
      outputs: [
        vibrationOutput({ vibrate: phone })!,
        gamepadOutput({ getGamepads: () => [pad(playEffect)] })!,
      ],
    });
    haptics.trigger("correct");
    expect(playEffect).toHaveBeenCalledOnce();
    expect(phone).not.toHaveBeenCalled();
  });
});
