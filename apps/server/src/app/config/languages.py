"""The models write markedly better English than Yoruba, Hausa, Igbo or
Nigerian Pidgin, so those are generated in English and translated.

Asked for Nigerian Pidgin directly, gpt-oss-120b wrote a fifth to a half of a
lesson's passages in it and the quizzes in English; translated, three quarters
and more, quizzes included (two Nigerian primary lessons each way)."""

TRANSLATED_LANGUAGES = frozenset({"yoruba", "hausa", "igbo", "nigerian pidgin"})

GENERATION_LANGUAGE = "English"


def needs_translation(language: str) -> bool:
    return language.strip().lower() in TRANSLATED_LANGUAGES


def generation_language_for(language: str) -> str:
    return GENERATION_LANGUAGE if needs_translation(language) else language
