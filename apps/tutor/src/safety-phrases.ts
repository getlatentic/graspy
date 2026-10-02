/**
 * The phrases that say a child needs the toilet or a drink, or is hurt, ill, hit or frightened, as a small child or a
 * Nigerian child says them. Each is a need and nothing else: topical words (a snake, a stomach, water in a word problem) are
 * not here, and water is a need only where it is asked for. A word that may be a number misheard is handled by safety.ts.
 */

const any = (alternatives: string[]) => new RegExp(`\\b(${alternatives.join("|")})\\b`, "i");

const THE = "(some |a |the |my )?";
const BODY = "head|hand|hands|leg|legs|foot|feet|finger|fingers|arm|arms|eye|eyes|knee|knees|toe|toes|face|nose|mouth|back|neck|ear|ears|body";
const HARM = "touch(es|ed|ing)?|slap(s|ped|ping)?|punch(es|ed|ing)?|pinch(es|ed|ing)?|push(es|ed|ing)?|kick(s|ed|ing)?|hit(s|ting)?|beat(s|ing)?|bit(e|es|ing|ten)?|stab(bed|bing)?|flog(ged|ging)?|troubl(es|ed|ing)|disturb(s|ed|ing)?|scratch(es|ed|ing)?";

export const TOILET = any([
  "toilets?", "bathrooms?", "restrooms?", "washrooms?", "loo", "latrine", "pee", "peed", "peeing", "piss", "pissing", "poo", "pooh",
  "poop", "shit", "wee", "urinate", "diarrhoea", "diarrhea", "thirsty", "thirst", "puke", "throw up", "ease myself", "wan ease",
  "wet (myself|my pants|my trousers|my clothes)", "i am pressed", "pass urine", "(short|long) call", "nature is calling",
  "(want|wan|need) to go out(side)?", "wan go out", "make i go out", "(want|wan|need) to (get|take|go and (get|take)) water", "let me take water", "water abeg", "call of nature", "nature'?s call", "potty", "belle dey press me", "i dey pressed", "(may|can|could) i (be excused|go out(side)?)", "let me go out(side)?",
  "(do|doing|need to do|want to do|go for) (a )?number (one|two)",
]);

export const DRINK = [
  `\\b(i|we)\\s+(need|want|wan|would like|will like)\\s+(to\\s+)?(go and )?${THE}(drink|water)\\b`,
  `\\b(can|may|could) i (have|get|drink|take)\\s+${THE}(water|drink)\\b`,
  "\\b(can|may|could) i drink\\b",
  `\\b(can|may|could) i go and (drink|get|fetch)\\b`,
  `\\b(bring|give|fetch) me\\s+${THE}water\\b`,
  "\\babeg\\s+(some |a )?water\\b",
  `\\blet me (go and )?(drink|get)\\s+${THE}(water|drink)\\b`,
].map((source) => new RegExp(source, "i"));

export const HURT = any([
  "hurt", "hurts", "hurting", "pain", "paining", "painful", "ache", "aching", "aches", "(stomach|tooth|ear|head|back)ache", "fever",
  "malaria", "vomit", "vomiting", "vomited", "dizzy", "sick", "bleeding", "bleed", "scared", "afraid", "frightened", "terrified",
  "unwell", "injured", "faint(ed|ing)?", "choking", "belly", "(can't|cannot|cant) breathe", "cut myself", "broke my (arm|leg)",
  "stung me", "bitten", "swallowed", "feel bad", "no well", "not feeling (fine|good|well)",
  "(see|there is|saw) blood", "blood is coming", "i (fell|slipped) (off|down|over|on|from)", "slipped and fell",
  `(hit|cut|burnt|burned|banged|bumped|scratched) my (${BODY})`,
  "(don't|do not|dont) feel (good|fine|well)", "(am not|im not|i'm not) (feeling )?well", "(am|is|im|i'm|feel|feeling|been) ill",
  `(${HARM}) me`, "(got|been|was) (beaten|hit|slapped|pushed|kicked|flogged)",
  "(want|call|need|bring) (my )?(mummy|mommy|mum|mom|mama|daddy|dad|papa|mother|father|grown[- ]?up)", "(call|bring|get) (my |the )?teacher",
  "i (need|want) (a |the )?(nurse|grown[- ]?up)", "(fight|fighting|bully|bullying) me", "pulled my hair", "i (dey )?fear",
  "(want to (see|go to)|miss|where is) (my )?(mummy|mommy|mum|mom|mama|daddy|dad|papa|parents?)", "(want|call|need|bring) (my )?parents?",
]);

/** "I am afraid it is five" is polite, not frightened. */
export const NOT_FEAR =
  /\b(i am|i['’]?m) afraid (it|that|its|this|the answer|i (do not|don't|dont|cannot|can't|cant|have to|think|am not|did not|didn't|forgot)|we (do not|don't|dont|cannot|can't|cant))\b/gi;
