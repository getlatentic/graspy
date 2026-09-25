"""The models write markedly better English than Yoruba, Hausa or Igbo, so
those are generated in English and translated."""

TRANSLATED_LANGUAGES = frozenset({"yoruba", "hausa", "igbo"})

GENERATION_LANGUAGE = "English"


def needs_translation(language: str) -> bool:
    return language.strip().lower() in TRANSLATED_LANGUAGES


def generation_language_for(language: str) -> str:
    return GENERATION_LANGUAGE if needs_translation(language) else language
