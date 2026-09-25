"""Generation tuning: constants, not settings, because they shape what a
learner reads and are reviewed with the prompts they tune."""

LLM_TEMPERATURE = 0.0

LLM_MAX_TOKENS = 8192

# gpt-oss reasons before it answers, billed as output. Low keeps lessons
# intact and cuts the reasoning about five-fold.
LLM_REASONING_EFFORT = "low"

# The grade the prompts are given when the learner names none; without one
# they would describe the grade as "None".
DEFAULT_GRADE_LEVEL = "Standard"
