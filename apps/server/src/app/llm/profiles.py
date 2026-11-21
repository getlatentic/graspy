"""Named models: a host, a model id and the base URL that serves it, kept
together. LLM_PROFILE picks one; LLM_HOST, LLM_MODEL_ID and LLM_BASE_URL, when
set, win over what the profile gives."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    host: str
    model_id: str
    # May name the deployment's {region}.
    base_url: str | None = None

    def url_in(self, region: str) -> str | None:
        return self.base_url.format(region=region) if self.base_url else None


BEDROCK_OPENAI_PATH = "https://bedrock-mantle.{region}.api.aws/openai/v1"

PROFILES: dict[str, Profile] = {
    "gpt-oss-120b": Profile("bedrock", "openai.gpt-oss-120b"),
    "gemma-4-31b": Profile("bedrock", "google.gemma-4-31b", BEDROCK_OPENAI_PATH),
    "gpt-oss-120b-workers-ai": Profile("workers-ai", "@cf/openai/gpt-oss-120b"),
}


def profile_named(name: str) -> Profile:
    try:
        return PROFILES[name]
    except KeyError:
        raise ValueError(
            f"LLM_PROFILE={name!r} is not a profile; use one of "
            f"{', '.join(sorted(PROFILES))}."
        ) from None
