"""The slide and practice prompts for writing a part again, told what was
wrong with the check written before. A first draft is asked with its prompt
unchanged."""

from __future__ import annotations

import dspy

CHECK_PROBLEM = "check_problem"


def told_the_problem(signature: type[dspy.Signature]) -> type[dspy.Signature]:
    return signature.append(
        CHECK_PROBLEM,
        dspy.InputField(
            desc="What was wrong with the check when it was written before. "
            "Write every field again, with a check that is right."
        ),
        str,
    )
