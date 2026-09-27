"""How the tutor and topic lessons write for each stage of schooling. The
sentence limits are content/child-language.md's bands for early years and
primary. Secondary has none: measured, a cap of 20 or 25 words cut its
sentences by a third, and its writing should stay as it is."""

from __future__ import annotations

from dataclasses import dataclass

from ..education.stage import Stage


@dataclass(frozen=True)
class StageWriting:
    # Who the tutor is for: "a tutor for primary school learners".
    school: str
    max_sentence_words: int | None
    words: str
    examples: str
    steps: str
    questions: str

    def guidance(self) -> str:
        limit = (
            f"Sentences of at most {self.max_sentence_words} words. "
            if self.max_sentence_words
            else ""
        )
        return f"{limit}{self.words} {self.examples} {self.steps} {self.questions}"


WRITING: dict[Stage, StageWriting] = {
    Stage.EARLY_YEARS: StageWriting(
        school="nursery and kindergarten",
        max_sentence_words=8,
        words="Words a small child says at home; no new terms.",
        examples="Examples they can see and touch: family, food, animals, "
        "toys, fingers and stones.",
        steps="One idea, one step at a time, said again the same way.",
        questions="Questions of one short sentence, with answers of one or two "
        "words; a passage is 50 to 80 words.",
    ),
    Stage.LOWER_PRIMARY: StageWriting(
        school="primary school",
        max_sentence_words=10,
        words="Everyday words a child of this age knows; say what a new word "
        "means once, simply, then use it.",
        examples="Examples from their day: home, family, school, the market, "
        "food, play and animals, with things they can count or hold.",
        steps="One idea at a time in small steps; show it before asking it.",
        questions="Questions of one short sentence and one step, with options "
        "of a few words; a passage is 60 to 120 words.",
    ),
    Stage.UPPER_PRIMARY: StageWriting(
        school="primary school",
        max_sentence_words=14,
        words="Plain words; give each subject word a short meaning the first "
        "time it is used.",
        examples="Examples from their town: market prices in the local money, "
        "farming, games and sport, school life.",
        steps="A worked example before the rule, in two or three steps, each shown.",
        questions="Questions of one or two sentences, with short options; a "
        "passage is 120 to 250 words.",
    ),
    Stage.JUNIOR_SECONDARY: StageWriting(
        school="junior secondary school",
        max_sentence_words=None,
        words="Clear language with the subject's proper terms, each explained "
        "when first used.",
        examples="Examples from everyday life in their country: trade and "
        "prices, transport, phones, health, their community.",
        steps="The rule, a worked example, then the learner's turn; up to four steps.",
        questions="Questions may need two steps; a passage is 200 to 400 words.",
    ),
    Stage.SENIOR_SECONDARY: StageWriting(
        school="senior secondary school",
        max_sentence_words=None,
        words="The subject's full vocabulary, as their school-leaving exams use it.",
        examples="Examples from their country's economy, technology, industry "
        "and careers, and exam-style problems.",
        steps="Give the reasoning in full; problems may take several steps, "
        "each named.",
        questions="Exam-style questions that may take several steps; a passage "
        "is 300 to 500 words.",
    ),
    Stage.AFTER_SCHOOL: StageWriting(
        school="university and college",
        max_sentence_words=None,
        words="The academic language of their course.",
        examples="Examples from work and research in their field and country.",
        steps="Assume what secondary school teaches, and go into depth.",
        questions="Questions at the level of their course.",
    ),
}
