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
    // A minus sign before a decimal, percentage, unit or ordinal is kept.
    ["It is -2.5 degrees.", "It is minus two point five degrees."],
    ["It fell -5% today.", "It fell minus five percent today."],
    ["It is -5 kg.", "It is minus five kilograms."],
    ["It is 3.5kg.", "It is three point five kilograms."],
    ["The rope is 12.5 cm long.", "The rope is twelve point five centimetres long."],
    ["Add 3 -2.5.", "Add three minus two point five."],
    ["Add 100 or 20.", "Add one hundred or twenty."],
    ["5 X 5 is 25.", "five times five is twenty-five."],
    ["It is 2.5 kg.", "It is two point five kilograms."],
    ["Turn to pages 12-15.", "Turn to pages twelve to fifteen."],
    ["Count in twos: 2, 4, 6, 8.", "Count in twos: two, four, six, eight."],
    ["Say it with me: 6 times 7 is 42.", "Say it with me: six times seven is forty-two."],
    ["Half past 2 is 2:30.", "Half past two is two thirty."],
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
    // Readings that would be accepted for the wrong sum or the wrong sign.
    "Add 100 and 20.",
    "Count 500 and 60.",
    "10-5=5.",
    "What is 7-3?",
    "5-3=2.",
    // Symbols the readings do not cover are never dropped silently.
    "You got 2.5% of them.",
    "You got 50 % of them.",
    "It costs ₦1.50.",
    "Is 5 >= 3?",
    "8 ÷ 2 is 4.",
    "8 − 2 is 6.",
    // Odd number forms.
    "Add 12 345.",
    "This is the 1th.",
    "This is the 2st.",
    "It is 1,000,000,000.",
    // A dropped dash, sign or operator must never match a reply that leaves it out.
    "It is –5 degrees.",
    "It is —5 degrees.",
    "What is 5 - -3?",
    "What is 8 – 5?",
    "What is x - 5?",
    "Take 5 kg - 3 kg.",
    "3*-2 is -6.",
    "What is √9?",
    "Is 5 ≥ 3?",
    "Is 5 ≠ 3?",
    "5^2 is 25.",
    // 3-7 is a subtraction unless a word around it says it is a range.
    "What is 3-7?",
    "What is 2-5?",
    "0-1",
    "Say the sum 1-2.",
    "Take 7-3 away.",
    // Every way of joining "and" to a hundred.
    "100 AND 20",
    "Add 100 and -5.",
    "Add 200 and ₦5.",
    "Add 200 and twenty.",
    // Ranges beside decimals, ordinals and codes.
    "Count 4-4.5.",
    "Read the 1st-3rd.",
    "Call 1-800.",
    "The date is 05-10.",
    "Add 5\u00a0500.",
    "It is 012,345.",
    // The third review: a spaced dash is not always a minus.
    "Class runs 8:00 - 9:00.",
    "Read pages 5 - 10.",
    "Children aged 3 - 5 may join.",
    "Walk 10 - 20 minutes.",
    "Days 1 - 7",
    "Between 5-10 pupils.",
    // A hyphen after a converted number, unit or amount.
    "What is 5-x?",
    "Solve 10-y.",
    "You have ₦5-₦3.",
    "Take 5kg-3kg.",
    "Take 5 kg-3 kg.",
    "It fell 50%-20%.",
    // Two numbers with only a space between them read as one number.
    "Sort 30 5 12.",
    "Sort 20 5.",
    "Pick 50 3 items.",
    "Order 100 20 3.",
    "Add 100 5.",
    "Add 1,000 5.",
    // Times and money written as decimals; ratios that look like times.
    "At 9.00 am.",
    "School ends at 2.45 pm.",
    "Come at 6.30.",
    "It costs 5.50.",
    "It costs 10.50.",
    "Mix cement and sand 1:10.",
    "The ratio is 2:15.",
    "Ratio 3:30 of boys.",
    // Emergency numbers, numbers, dates, units with no words here.
    "Dial 112.",
    "Call 199 now.",
    "No. 5 is next.",
    "N 500 is a lot.",
    "On 5 June it rains.",
    "June 5 is a Friday.",
    "The 5th of June.",
    "It is 5 m long.",
    "It is 5 KG.",
    "It weighs 5 kgs.",
    "That is 3 m².",
    "It is 00.5.",
    "It is 007.5.",
    "This is the 01st.",
    // Symbols the readings have no words for, spaced or not.
    "Half is 1 / 2.",
    "It goes 5 km/h.",
    "Mix 5 g/ml.",
    "Ratio 3 : 4.",
    "3 ∙ 4 is 12.",
    "3 · 4 is 12.",
    "3 ✕ 4 is 12.",
    "3 ∗ 4 is 12.",
    "3 ∶ 4.",
    "3 ∕ 4.",
    "3 ＋ 4.",
    "3 ＝ 4.",
    "5 → 3.",
    "5 + 3 = 8 ✓",
    "It is 5².",
    "It is 1½.",
    "It is 3：30.",
    "He is 5'6\" tall.",
    "That is 5's.",
    "It is ５ now.",
    "It is ٥ now.",
    "① is first.",
    "3 x -4 is -12.",
    "3 x y is 3y.",
    "In class 3, what is 2-5?",
    "1" + ",000".repeat(1000),
  ])("declines %s, which has more than one reading or none it can check", (line) => {
    expect(expectedReading(line)).toBeNull();
  });
});

describe("expectedReading on a long line", () => {
  it("stays fast when a line is packed with dashes and operators", () => {
    const line = "1-2 ".repeat(30_000) + "+";
    const started = Date.now();
    expect(expectedReading(line)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("still reads a range when a word says it is one", () => {
    expect(expectedReading("Count 5-10.")).toBe("Count five to ten.");
    expect(expectedReading("Ages 6-8 may join.")).toBe("Ages six to eight may join.");
    expect(expectedReading("Turn to pages 12-15.")).toBe("Turn to pages twelve to fifteen.");
  });
});
