"""The contract the web app and the Android app share conversations by,
compared as data."""

import json
import runpy
from pathlib import Path

import pytest

EXPORT = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/export_thread_contract.py")
)


@pytest.mark.parametrize("target", EXPORT["TARGETS"], ids=["web", "android"])
def test_each_apps_thread_contract_matches_the_server(target):
    assert json.loads(target.read_text(encoding="utf-8")) == json.loads(
        EXPORT["contract"]()
    ), "run: uv run python scripts/export_thread_contract.py"


def test_the_contract_reads_back_every_message_it_sent():
    wire = json.loads(EXPORT["contract"]())
    sent = {
        message["id"]: {"metadata": None, **message}
        for thread in wire["sent"]["threads"]
        for message in thread["messages"]
    }
    read = {
        message["id"]: message
        for thread in wire["changes"]["threads"]
        for message in thread["messages"]
    }

    assert read == sent
