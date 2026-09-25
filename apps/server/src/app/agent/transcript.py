from __future__ import annotations

from collections.abc import Sequence

from .memory import Exchange

START = "This is the start of the conversation."


def _rendered(exchange: Exchange) -> str:
    lines = [f"Learner: {exchange['message']}"]
    if "app" in exchange:
        lines.append(f"(In the app, with this message.\n{exchange['app']})")
    lines.append(f"Tutor: {exchange['answer']}")
    if "card" in exchange:
        lines.append(f"(The app showed this as a card.\n{exchange['card']})")
    return "\n".join(lines)


def render(exchanges: Sequence[Exchange], summary: str = "") -> str:
    """The exchanges, oldest first, after the summary of what came before."""
    parts = (
        [f"Summary of the conversation before these exchanges: {summary}"]
        if summary
        else []
    )
    parts += [_rendered(exchange) for exchange in exchanges]
    return "\n\n".join(parts) or START
