"""How a tool tells the model it refused: the reason, then that nothing was done, so the model
does not report the action as done."""

from __future__ import annotations

NOTHING_DONE = "Nothing was done."


def refusal(reason: str, **data: object) -> dict:
    """The tool's result for a refused call. ``data`` is what the model needs to try again."""
    reason = reason.strip()
    if not reason.endswith((".", "!", "?")):
        reason += "."
    return {"error": f"{reason} {NOTHING_DONE}", **data}
