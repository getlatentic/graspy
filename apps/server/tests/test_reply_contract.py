"""The contracts the web app and the views check themselves against, compared as
data."""

import json
import runpy
from pathlib import Path

EXPORT = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/export_reply_contract.py")
)


def test_the_exported_contract_matches_the_server():
    assert json.loads(EXPORT["TARGET"].read_text(encoding="utf-8")) == json.loads(
        EXPORT["contract"]()
    ), "run: uv run python scripts/export_reply_contract.py"


def test_the_views_card_contract_matches_the_server():
    """The views, in ui/, read what the app never does: the cards' content."""
    assert json.loads(EXPORT["VIEWS_TARGET"].read_text(encoding="utf-8")) == json.loads(
        EXPORT["card_contract"]()
    ), "run: uv run python scripts/export_reply_contract.py"
