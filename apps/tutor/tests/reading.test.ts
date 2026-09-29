import { describe, expect, it } from "vitest";
import { expectedReading } from "../src/reading";

describe("expectedReading", () => {
  it.each([
    ["Well done! You counted 1, 2, 3, 4, 5.", "Well done! You counted one, two, three, four, five."],
    ["3 + 4 = 7.", "three plus four equals seven."],
    ["2+3=5.", "two plus three equals five."],
    ["10 - 6 = 4.", "ten minus six equals four."],
    ["3 x 4 = 12.", "three times four equals twelve."],
    ["Is 7 > 5?", "Is seven greater than five?"],
    ["-5 is below zero.", "minus five is below zero."],
    ["It is 3:30 now.", "It is three thirty now."],
    ["School starts at 8:00.", "School starts at eight o'clock."],
    ["It is 7:05 in the morning.", "It is seven oh five in the morning."],
    ["The bell rings at 12:45.", "The bell rings at twelve forty-five."],
    ["You paid ₦500 for 12 mangoes.", "You paid five hundred naira for twelve mangoes."],
    ["A ball costs ₦2,000.", "A ball costs two thousand naira."],
    ["It cost ₦1,000,000.", "It cost one million naira."],
    ["You got 50% of them.", "You got fifty percent of them."],
    ["That is 2.5 metres.", "That is two point five metres."],
    ["Round 3.14 to 3.1.", "Round three point one four to three point one."],
    ["You came 1st!", "You came first!"],
    ["This is your 3rd try.", "This is your third try."],
    ["It is the 21st.", "It is the twenty-first."],
    ["She is 20th in line.", "She is twentieth in line."],
    ["It weighs 3 kg.", "It weighs three kilograms."],
    ["The box is 20 cm by 15 cm.", "The box is twenty centimetres by fifteen centimetres."],
    ["Pour 500 ml of water.", "Pour five hundred millilitres of water."],
    ["Count 5-10.", "Count five to ten."],
    ["Ages 6-8 may join.", "Ages six to eight may join."],
    ["The school has 1,200 pupils.", "The school has one thousand two hundred pupils."],
    ["Nigeria has over 200,000,000 people.", "Nigeria has over two hundred million people."],
    ["Well done!", "Well done!"],
  ])("reads %s", (line, reading) => {
    expect(expectedReading(line)).toBe(reading);
  });

  it.each([
    "Nigeria became free in 1960.",
    "The test is on 12 June 2026.",
    "Call 08012345678.",
    "Your ID is 4471.",
    "The hall seats 2500 people.",
    "1/2 plus 1/4 is 3/4.",
    "Half is 1/2.",
    "Use A4 paper.",
    "Sit in seat B7.",
    "Class 3B, sit down please.",
    "The team is U12.",
    "The bag is N750.",
    "Use 1-2-3 to start.",
    "Nine 9s are 81.",
  ])("declines %s, which has more than one reading", (line) => {
    expect(expectedReading(line)).toBeNull();
  });
});
