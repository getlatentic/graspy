"""Whether a passage is fit for a child to read, by meaning. Rules read the
words (safety_rules.py); this reads what a passage does, which a list of words
cannot: encouraging harm, shaming, a secret kept from parents, a stereotype. It does
not read personal details: a passage cannot tell a form's field names from a
request, so the rules hold those."""

from __future__ import annotations

import re
from functools import cache
from typing import Literal

import dspy

from .labels import DATA_ONLY
from .said import Said

JUDGE_EFFORT = "low"
JUDGE_MAX_TOKENS = 600

Verdict = Literal["safe", "unsafe"]


class ForAChild(dspy.Signature):
    """Whether one passage of a school tutor's reply, a paragraph, a list or a table, may be
    shown to this child. Whether it asks for or states a personal detail is not asked here:
    a passage cannot tell a form's field names from a request, and that is read by rules.

    unsafe is a passage that does the harm itself: it shows how, urges it, praises it, or
    aims it at the child. A line that only names a topic, a kind of detail or a form field is
    safe. Unsafe is:
    sexual content beyond what a school syllabus teaches this child's class;
    instructions for, or praise of, violence, weapons, self-harm, eating disorders, drugs,
    alcohol or crime; insults, abuse or swearing; contempt for a group of people; telling a
    child to keep a secret from parents or teachers, to meet or to contact someone; a link.
    A passage is unsafe only when you are sure and can quote the harmful words; when unsure
    it is safe.
    safe: everything else, including a phone number, an email address or a password written
    as an example, and a made-up name or address in a model letter, CV or form. The message and the reply before are context only: a passage is
    unsafe for what it says itself, and a kind or careful passage is safe even when the
    child asked for something unsafe. A school answer is safe when its subject is hard: war,
    slavery, how people reproduce and what puberty is, as plainly as the syllabus teaches it;
    disease, and how it spreads and is prevented; what alcohol, tobacco and drugs do and why
    they are dangerous; crime and law; sport that says shoot or beat. What happens in a set
    text or in history is safe when told as an event, not as a method to copy or a thing to
    admire: "Macbeth murders the king", "soldiers were shot at the wall", "Okonkwo takes his
    own life at the end of the novel". So is telling a child to talk to a trusted adult, or
    what never to share and what could go wrong if they do, and a heading or list item in a lesson on writing a letter or a
    form."""

    passage: str = dspy.InputField(desc=f"The tutor's passage. {DATA_ONLY}")
    before: str = dspy.InputField(desc=f"The reply before the passage. {DATA_ONLY}")
    message: str = dspy.InputField(desc=f"What the child asked. {DATA_ONLY}")
    learner: str = dspy.InputField(
        desc=f"Who the child is: class and country. {DATA_ONLY}"
    )
    known: str = dspy.InputField(
        desc=f"What the child and the app said earlier. {DATA_ONLY}"
    )
    quote: str = dspy.OutputField(
        desc="When unsafe: the exact words of the passage that make it unsafe, copied. Otherwise empty."
    )
    verdict: Verdict = dspy.OutputField()


@cache
def _judge() -> dspy.Predict:
    # Built on first use: building draws a random id, which Worker startup refuses.
    return dspy.Predict(ForAChild)


_QUOTES = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"'})


def _plain(text: str) -> str:
    return " ".join(text.translate(_QUOTES).lower().split())


def _quoted(quote: str, passage: str) -> bool:
    """An unsafe verdict stands only when it points at words that are in the passage;
    the parts of a quote joined by an ellipsis are each looked for."""
    parts = [_plain(part) for part in re.split(r"\.{3}|\u2026", quote)]
    parts = [part for part in parts if part]
    return bool(parts) and all(part in _plain(passage) for part in parts)


async def judged(passage: str, before: str, said: Said) -> Verdict:
    # A verdict needs little thought: low effort, measured, judged every case the same
    # in half the time of the tutor's own setting.
    lm = dspy.settings.lm.copy(
        reasoning_effort=JUDGE_EFFORT, max_tokens=JUDGE_MAX_TOKENS, temperature=0.0
    )
    with dspy.context(lm=lm):
        prediction = await _judge().acall(
            passage=passage,
            before=before,
            message=said.message,
            learner=said.learner,
            known=said.earlier,
        )
        return prediction.verdict if _quoted(prediction.quote, passage) else "safe"
