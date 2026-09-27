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
    # What every tutor answer holds at this stage; lessons have their own
    # slide plan.
    tutor_answer: str = ""

    def guidance(self) -> str:
        # A sentence limit alone shortens the explanation too: measured, the
        # tutor then gives a primary child fewer steps and local examples.
        limit = (
            f"Sentences of at most {self.max_sentence_words} words. Only the "
            "sentences are short: explain fully, with an example from the "
            "learner's own country. "
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
        examples="Examples that fit the idea, from a child's day in their "
        "country, named as they know them: home, school, the market, food, "
        "play and animals, with things they can count or hold.",
        steps="One idea at a time in small steps, each shown with an example.",
        questions="Questions of one short sentence and one step, with options "
        "of a few words; a passage is 60 to 120 words.",
        # The owner's rule: short sentences, full answers.
        tutor_answer="Every explanation has a worked example in a context "
        "the child knows from their own country, as short numbered steps, "
        "then one quick question the child can try: one line, with no "
        "options, as questions to tap go on a practice card.",
    ),
    Stage.UPPER_PRIMARY: StageWriting(
        school="primary school",
        max_sentence_words=14,
        words="Plain words; give each subject word a short meaning the first "
        "time it is used.",
        # Named money examples invite money sums where the idea is not about
        # money: measured, a fraction explained as a division of naira.
        examples="Examples that fit the idea, from their town and country, "
        "named as they know them: the market, farming, games and sport, "
        "school life.",
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
        # Held to the syllabus: measured, lessons for this stage otherwise
        # reach university detail, which a judge scored 2 of 5 for age.
        words="The subject's terms as their senior secondary syllabus uses "
        "them, each explained when first used.",
        examples="Examples from their country's economy, technology, industry "
        "and careers.",
        steps="Teach what their syllabus covers on the topic and no more: no "
        "calculation or mechanism it does not ask for. A worked example "
        "before the learner's turn.",
        questions="Questions on what was taught; a passage is 300 to 500 words.",
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
