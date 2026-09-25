"""DSPy's DummyLM through the real JSON adapter, and what it was asked."""

import re
from contextlib import AbstractContextManager

import dspy
from dspy.utils.dummies import DummyLM


def stand_in(answers: list[dict]) -> tuple[DummyLM, AbstractContextManager]:
    """A model that gives these answers in order, and the context that makes
    it the model for the code under test."""
    adapter = dspy.JSONAdapter()
    lm = DummyLM(answers, adapter=adapter)
    return lm, dspy.context(lm=lm, adapter=adapter)


def inputs(lm: DummyLM, call: int) -> dict[str, str]:
    """The input fields of one model call, as the adapter rendered them."""
    prompt = lm.history[call]["messages"][-1]["content"].split("\n\nRespond with")[0]
    sections = re.split(r"\[\[ ## (\w+) ## \]\]\n", prompt)[1:]
    return {name: value.strip() for name, value in zip(sections[::2], sections[1::2])}
