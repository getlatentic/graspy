import { describe, expect, it } from "vitest";
import { numberWords } from "../src/lines";
import { needFor } from "../src/safety";

describe("what a child's words ask for", () => {
  it.each([
    ["I feel sick and I think it is ten", "needs_grownup"],
    ["I am ill, ten", "needs_grownup"],
    ["my leg is aching, ten", "needs_grownup"],
    ["I have a fever", "needs_grownup"],
    ["somebody hit me", "needs_grownup"],
    ["ten but my tummy is paining me", "needs_grownup"],
    ["I need the toilet", "needs_help"],
    ["I need to ease myself", "needs_help"],
    ["please let me go for a short call", "needs_help"],
    ["I want to drink water", "needs_help"],
    ["I am peeing myself, ten", "needs_help"],
    ["I wan piss", "needs_help"],
    ["I need the restroom", "needs_help"],
    ["I want to use the loo", "needs_help"],
    ["I wet myself", "needs_help"],
    ["water", "needs_help"],
    ["he is hitting me", "needs_grownup"],
    ["he pushed me", "needs_grownup"],
    ["I am not feeling well", "needs_grownup"],
    ["I can't breathe", "needs_grownup"],
  ])("%s is %s", (heard, need) => expect(needFor(heard)).toBe(need));

  it.each([
    "ten",
    "I'll say ten",
    "one thousand ml of water",
    "ten cups of water",
    "it is the week after next",
    "seven weeks",
    "five bottles of water please",
    "ten bottles of water I want ten",
    "I'm afraid it is five",
  ])("%s asks for nothing", (heard) => expect(needFor(heard)).toBeNull());

  it.each([
    ["pain", 10],
    ["tummy", 10],
    ["it is poo", 2],
  ] as const)("%s alone is the number %i misheard, not a need", (heard, answer) => expect(needFor(heard, answer)).toBeNull());

  it("is a need where the lone word is not the number asked for", () => {
    expect(needFor("pain", 7)).toBe("needs_grownup");
    expect(needFor("pain")).toBe("needs_grownup");
    expect(needFor("sick", 7)).toBe("needs_grownup");
    expect(needFor("I am sick", 6)).toBe("needs_grownup");
  });

  it("takes a lone word for the answer through the courtesy and the repeating that follow a number", () => {
    for (const heard of ["pain please", "pain sir", "pain o", "sick ma"]) {
      expect(needFor(heard, heard.startsWith("sick") ? 6 : 10), heard).toBeNull();
    }
  });

  it("never takes a word that is a need in every other mouth for the number", () => {
    for (const [heard, answer] of [["toilet", 20], ["bleeding", 20], ["vomit", 40], ["hurt", 90], ["scared", 70]] as const) {
      expect(needFor(heard, answer), heard).not.toBeNull();
    }
  });

  it("reads such a word among the numbers of a count or a table as one of them", () => {
    expect(needFor("one two three four five sick seven eight nine ten")).toBeNull();
    expect(needFor("two times three is sick")).toBeNull();
    expect(needFor("one two poo four")).toBeNull();
    expect(needFor("one two three I am hurt")).toBe("needs_grownup");
  });

  it("leaves topical words and a water word problem alone, and answers a request for water", () => {
    for (const heard of ["five snake", "a cow has four stomach", "ten blood", "five breathe", "ten people drink water", "get water ten", "ten litres of water"]) {
      expect(needFor(heard, 10), heard).toBeNull();
    }
    expect(needFor("water", 3, "How many cups of water in three jugs?")).toBeNull();
    for (const heard of ["can I have some water", "I want to drink", "I need a drink", "bring me water", "abeg water", "I wan water"]) {
      expect(needFor(heard, 10), heard).toBe("needs_help");
    }
  });

  it("never takes a toilet word for a number it was not attested for", () => {
    for (const [heard, answer] of [["pee", 5], ["pee pee", 1], ["pee", 2], ["poo poo", 5], ["poo", 8], ["poop", 8], ["water", 3], ["water", 15], ["wee", 2], ["pain", 7]] as const) {
      expect(needFor(heard, answer), `${heard} for ${answer}`).not.toBeNull();
    }
  });

  it("reads a word for a need that stands for part of a number as that part, and only where the number is the one asked for", () => {
    for (const [heard, answer] of [["forty poo", 42], ["twenty poo", 22], ["thirsty five", 35], ["thirty sick", 36], ["ten", 10]] as const) {
      expect(needFor(heard, answer), heard).toBeNull();
    }
    expect(needFor("forty poo", 40)).toBe("needs_help");
    expect(needFor("thirty sick", 30)).toBe("needs_grownup");
  });

  it("keeps a count or an alphabet whole where it has a need word and a closing word or two", () => {
    const alphabet = "a b c d e f g h i j k l m n o pee q r s t u v w x y z".split(" ");
    expect(needFor(`${alphabet.join(" ")} now I know my abcs`, null, "", alphabet)).toBeNull();
    expect(needFor("one two three four five six seven eight nine pain I finished")).toBeNull();
    expect(needFor("one two three four five six seven eight nine ten thank you sir")).toBeNull();
    expect(needFor("one poo three four five six seven eight nine ten thank you")).toBeNull();
    expect(needFor("one two free four five sick seven eight nine ten")).toBeNull();
    expect(needFor("one two three four five six seven eight nine ten, my belly")).toBe("needs_grownup");
  });

  it("hears a need said after a count, a table or an alphabet, and does not lose the step to a word that is the next number", () => {
    const alphabet = "a b c d e f g h i j k l m n o pee q r s t u v w x y z".split(" ");
    const letters = alphabet.join(" ");
    for (const tail of ["I am sick", "I feel sick", "I am in pain", "I am thirsty", "I want to poo", "I'm ill", "I don't feel well", "I can't breathe", "I see blood", "I want to pee", "I need to drink water", "can I drink water", "may I go out", "I am pressed", "I need water"]) {
      expect(needFor(`one two three four five ${tail}`, null), tail).not.toBeNull();
      expect(needFor(`${letters} ${tail}`, null, "", alphabet), tail).not.toBeNull();
    }
    for (const run of ["two four sick", "2 4 sick", "four five sick", "five sick", "eight nine pain", "ten twenty thirsty", "one poo three"]) {
      expect(needFor(run, null), run).toBeNull();
    }
  });

  it("takes no two words for need as one number, and no number that is not said as it is written", () => {
    for (const [heard, answer] of [["tummy pain", 20], ["pain tummy", 20], ["pain and tummy", 20], ["sick pain", 16], ["tummy poo", 12], ["pain two", 12], ["sick seven", 13], ["pain pain", 10], ["sick sick sick", 6]] as const) {
      expect(needFor(heard, answer), `${heard} for ${answer}`).not.toBeNull();
    }
  });

  it("reads ordinary words around the misheard answer as the answer", () => {
    for (const heard of ["e be pain", "that is pain", "that's pain", "so pain", "okay pain", "my answer is pain", "ehm pain", "pain thank you"]) {
      expect(needFor(heard, 10), heard).toBeNull();
    }
    expect(needFor("that is poo", 2)).toBeNull();
    expect(needFor("thirty poo thank you", 32)).toBeNull();
  });

  it("hears the apostrophes a recogniser writes, and the compounds", () => {
    for (const heard of ["I don’t feel well", "I’m not well", "I can’t breathe", "I'm ill", "I have a stomachache", "stomach ache"]) {
      expect(needFor(heard, 10), heard).toBe("needs_grownup");
    }
    expect(needFor("I want teacher to say it again", 10)).toBeNull();
    expect(needFor("call teacher", 10)).toBe("needs_grownup");
  });

  it("hears the toilet, the drink, the parent and the hurt as the review heard them said", () => {
    for (const heard of ["I want to go outside", "I need to go outside", "I wet my pants", "I have wet my trousers", "I am pressed", "I want to go and drink water", "can I drink", "let me drink water", "I want to get water", "let me take water", "I wan go out", "make I go out", "call of nature", "I need the potty"]) {
      expect(needFor(heard, 10), heard).toBe("needs_help");
    }
    for (const heard of ["mom", "mum", "dad", "I want my mom", "I want my dad", "mom help me", "I need a grown-up", "there is blood", "I see blood", "I fell off my chair", "I slipped and fell", "I feel faint", "I am fainting", "I was bitten by a dog", "I broke my arm", "I have malaria", "I swallowed a coin", "he is touching me", "he is slapping me", "he is punching me", "he is pinching me", "he is troubling me", "I got beaten", "I have been beaten", "he is fighting me", "I dey fear", "I want my parents", "I want to see my mummy", "I need the nurse", "I need help", "abeg help me", "I want a grown up"]) {
      expect(needFor(heard, 10), heard).toBe("needs_grownup");
    }
  });

  it("takes a letter's spoken form for the letter, not a need", () => {
    const letter = ["p", "pee", "pea"];
    expect(needFor("n, o, pee, q", null, "", ["n", "o", "pee", "q", ...letter])).toBeNull();
    expect(needFor("it is pee", null, "", letter)).toBeNull();
    expect(needFor("I need to pee", null, "", letter)).toBe("needs_help");
  });

  it("takes thirsty for thirty and leaves 'help me is it ten' an answer, but a call for help alone is one", () => {
    expect(needFor("thirsty", 30)).toBeNull();
    expect(needFor("I think it is thirsty", 30)).toBeNull();
    expect(needFor("thirsty", 7)).toBe("needs_help");
    expect(needFor("the answer is number two", 2)).toBeNull();
    expect(needFor("help me is it ten", 10)).toBeNull();
    for (const heard of ["help", "help me", "mummy", "please help me"]) expect(needFor(heard, 10), heard).toBe("needs_grownup");
    expect(needFor("I am afraid I do not know", 10)).toBeNull();
  });

  it("leaves the ordinary lead-ins and narration of an answer alone", () => {
    for (const heard of ["let me get it nine", "let me go first", "let me get my pencil", "I cut my cake into nine", "I hit my friend", "nine I fell", "I am afraid I do not know", "the answer is number two"]) {
      expect(needFor(heard, 9), heard).toBeNull();
    }
  });

  it("hears a call for help said however it is dressed, and the euphemisms for the toilet, and a real fear", () => {
    for (const heard of ["help me please", "help me help me", "teacher help me", "somebody help me", "mummy help me", "mummy mummy", "oh mummy", "help help"]) {
      expect(needFor(heard, 10), heard).toBe("needs_grownup");
    }
    for (const heard of ["I want to do number two", "I want to do a number one", "I cut my finger", "I hit my head", "I am afraid I will be beaten", "I fell down"]) {
      expect(needFor(heard, 10), heard).not.toBeNull();
    }
  });

  it("answers the phrasings a child uses for being unwell, hit, or needing out", () => {
    for (const heard of ["I don't feel well", "I am not well", "I feel unwell", "I fainted", "I am choking", "toothache", "he punched me", "I was beaten", "my belly", "help me", "I want my mummy"]) {
      expect(needFor(heard, 10), heard).toBe("needs_grownup");
    }
    for (const heard of ["may I go out", "can I go outside", "may I drink water", "let me drink water", "can I go and get water", "I hit my head", "I cut my finger", "a bee stung me", "ants are biting me", "I want my mother", "I do not feel good", "I have vomited", "he is disturbing me"]) {
      expect(needFor(heard, 10), heard).not.toBeNull();
    }
    for (const heard of ["I want to throw up", "I wan ease", "I want to pass urine", "I need the washroom", "nature is calling", "I want to go out"]) {
      expect(needFor(heard, 10), heard).toBe("needs_help");
    }
  });

  it("leaves the recogniser's word for six alone", () => {
    expect(needFor("sicks", 6)).toBeNull();
    expect(needFor("fifty sicks", 56)).toBeNull();
  });

  it("is a need once anything else is said around such a word", () => {
    expect(needFor("my belly", 10)).toBe("needs_grownup");
    expect(needFor("I feel sick", 6)).toBe("needs_grownup");
    expect(needFor("I need water", 3)).toBe("needs_help");
  });
});

describe("no right answer is a need", () => {
  const forms = [
    (n: string) => n,
    (n: string) => `it is ${n}`,
    (n: string) => `I think ${n}`,
    (n: string) => `the answer is ${n}`,
    (n: string) => `na ${n}`,
    (n: string) => `e be ${n}`,
    (n: string) => `I get ${n}`,
    (n: string) => `me I see ${n}`,
    (n: string) => `let me get it ${n}`,
    (n: string) => `let me go first, ${n}`,
    (n: string) => `${n} cups of water`,
    (n: string) => `${n} please sir`,
    (n: string) => `I cut my cake into ${n}`,
    (n: string) => `${n} sweets, I hit my friend`,
    (n: string) => `abeg ${n}`,
    (n: string) => `I am afraid I do not know, is it ${n}`,
  ];

  it("for the numbers a word for a need stands in for, as the recogniser writes them", () => {
    const wrong: string[] = [];
    for (let n = 1; n <= 100; n += 1) {
      const spoken = numberWords(n);
      for (const [word, stands] of [["poo", "two"], ["sick", "six"], ["pain", "ten"], ["thirsty", "thirty"]] as const) {
        if (spoken.endsWith(stands) && needFor(spoken.slice(0, spoken.length - stands.length).replace(/-$/, " ") + word, n) !== null) wrong.push(`${spoken} as ${word}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("for 1 to 100 said in sixteen ways, spoken or in digits", () => {
    const needs: string[] = [];
    for (let n = 1; n <= 100; n += 1) {
      for (const say of forms) {
        for (const spoken of [numberWords(n), String(n)]) {
          const heard = say(spoken);
          if (needFor(heard, n) !== null) needs.push(heard);
        }
      }
    }
    expect(needs).toEqual([]);
  });
});
