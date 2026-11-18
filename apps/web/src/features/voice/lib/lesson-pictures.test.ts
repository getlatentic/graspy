import { describe, expect, it } from "vitest";
import type { CatalogueLesson } from "@/lib/voice/voice-types";
import {
  PICTURE_URLS,
  lessonPicture,
  pictureNameOf,
  pictureNames,
} from "./lesson-pictures";

const lesson = (plan_id: string, topic: string): CatalogueLesson => ({
  plan_id,
  subject: "mathematics",
  topic,
  title: { en: plan_id },
  standing: "untouched",
  days_correct: 0,
  current: false,
});

describe("pictureNameOf", () => {
  it("gives a lesson with a picture of its own that picture, before its theme's", () => {
    expect(
      pictureNameOf(lesson("english.alphabet.letter-sounds", "alphabet")),
    ).toBe("letter-sounds");
    expect(
      pictureNameOf(lesson("english.alphabet.saying-the-alphabet", "alphabet")),
    ).toBe("alphabet");
    expect(
      pictureNameOf(lesson("mathematics.number.counting-to-ten", "number")),
    ).toBe("counting");
    expect(
      pictureNameOf(
        lesson("mathematics.operations.addition-facts-to-twenty", "operations"),
      ),
    ).toBe("adding");
  });

  it("gives every lesson of a theme with one picture that picture", () => {
    expect(
      pictureNameOf(
        lesson("mathematics.multiplication.table-7", "multiplication"),
      ),
    ).toBe("times-tables");
    expect(
      pictureNameOf(lesson("mathematics.number.prime-numbers", "number")),
    ).toBe("number");
    expect(
      pictureNameOf(lesson("mathematics.time.telling-the-time", "time")),
    ).toBe("telling-the-time");
    expect(
      pictureNameOf(lesson("mathematics.money.naira-and-kobo", "money")),
    ).toBe("naira-and-kobo");
    expect(
      pictureNameOf(lesson("mathematics.shapes.naming-shapes", "shapes")),
    ).toBe("shapes");
    expect(
      pictureNameOf(
        lesson(
          "mathematics.fractions.fractions-decimals-percentages",
          "fractions",
        ),
      ),
    ).toBe("fractions");
  });

  it("gives a lesson no picture fits nothing, even for a name that is built into objects", () => {
    expect(
      pictureNameOf(
        lesson("mathematics.operations.division-facts", "operations"),
      ),
    ).toBeUndefined();
    expect(pictureNameOf(lesson("constructor", "toString"))).toBeUndefined();
  });
});

describe("lessonPicture", () => {
  it("serves a file for every picture named", () => {
    for (const name of pictureNames())
      expect(PICTURE_URLS[name], name).toBeTruthy();
  });

  it("is a different file for each of the ten pictures", () => {
    expect(new Set(pictureNames().map((name) => PICTURE_URLS[name])).size).toBe(
      10,
    );
  });

  it("is nothing for a lesson without a picture", () => {
    expect(
      lessonPicture(
        lesson("mathematics.operations.division-facts", "operations"),
      ),
    ).toBeUndefined();
  });
});
