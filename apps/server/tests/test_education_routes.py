"""The catalogue as the learner's app asks for it."""

import pytest
from fastapi.testclient import TestClient

from app.education.catalogue import systems
from app.factory import create_app
from app.settings import Settings


@pytest.fixture(scope="module")
def client():
    return TestClient(
        create_app(
            Settings(
                aws_bearer_token_bedrock="bedrock-test",
                session_secret="s",
                _env_file=None,
            )
        )
    )


def test_every_system_is_listed_without_a_session(client):
    response = client.get("/api/education/systems")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert {item["id"] for item in response.json()} == set(systems())


def test_a_countrys_systems_come_main_first(client):
    found = client.get("/api/education/countries/GB").json()

    assert found[0]["main"] is True
    assert all(item["country"] == "GB" for item in found)
    first = found[0]["levels"][0]
    assert {"id", "stage", "year", "age", "name", "aliases"} <= set(first)


def test_a_country_not_covered_gets_numbered_grades(client):
    (found,) = client.get("/api/education/countries/AQ").json()

    assert found["status"] == "draft"
    levels = found["levels"]
    assert [level["name"]["en"] for level in levels] == [
        f"Grade {year}" for year in range(1, 13)
    ]
    assert (levels[0]["age"], levels[-1]["age"]) == (6, 17)
    assert [levels[i]["stage"] for i in (5, 6, 9)] == [
        "primary",
        "lower-secondary",
        "upper-secondary",
    ]


def test_a_system_is_served_whole(client):
    nigeria = client.get("/api/education/systems/NG").json()

    names = [level["name"]["en"] for level in nigeria["levels"]]
    assert names[:4] == ["Nursery 1", "Nursery 2", "Kindergarten", "Primary 1"]
    assert nigeria["levels"][9]["name"]["en"] == "JSS 1"
    assert nigeria["levels"][9]["age"] == 12


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/api/education/systems/ZZ-XYZ", 404),
        ("/api/education/systems/ng", 422),
        ("/api/education/countries/nga", 422),
    ],
)
def test_what_is_not_a_system_is_refused(client, path, status):
    assert client.get(path).status_code == status
