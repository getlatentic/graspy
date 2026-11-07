# What the tutor must never tell a child, and where code holds it

Finding and change for planning #713. A prompt edit cannot undo a rule in this table that has a guard.

`TUTOR_RULES` (`apps/server/src/app/agent/tutor.py`) is what the tutor's model is asked to do. The rules a child depends on are held by the server as well, so a model that ignores them, or a prompt that loses them, still sends the child nothing wrong.

## The rules

| Rule | Held by | Test |
|---|---|---|
| An answer is called right or wrong only as the app marked it | `agent/answer_rules.py` (`_SAYS_RIGHT`, `_SAYS_WRONG`), applied by `agent/answer_gate.py`. The marking comes from the learner's tap: `learner/answers.py` (`PracticeAnswer.correct`) | `test_answer_rules.py::test_no_answer_is_called_right_until_the_app_has_marked_it`, `test_answer_rules.py::test_no_answer_is_called_wrong_until_the_app_has_marked_it`, `test_answer_gate.py::test_a_wrong_tap_is_never_called_right`, `test_answer_gate.py::test_an_answer_called_right_without_a_marking_says_who_marks` |
| A hint or a wrong-answer note never states the answer | `agent/choices.py` (`key_leak`), called for every question of `give_practice` and `give_passage`; a card that fails is refused and the model rewrites it | `test_key_leak.py::test_a_practice_note_that_states_the_answer_is_sent_back`, `test_key_leak.py::test_a_passage_note_that_states_the_answer_is_sent_back` |
| The card's key is the right option | `agent/practice.py` (`_key_problem`: the arithmetic in `check`, the working must reach the key), `agent/passage.py` (the evidence must be in the passage) | `test_practice_tool.py::test_a_key_the_arithmetic_disagrees_with_is_refused`, `test_practice_tool.py::test_a_key_the_working_does_not_reach_is_refused`, `test_passage_tool.py::test_a_question_the_passage_does_not_answer_is_refused` |
| The practice questions, their options and their key are not written in the answer | `agent/answer_rules.py` (`_leaks_card`), applied by `agent/answer_gate.py` | `test_answer_rules.py::test_a_card_is_not_written_into_the_answer`, `test_answer_gate.py::test_a_card_is_introduced_without_its_question_or_key` |
| Something is said to be added, opened or changed only when a tool did it; the app opens a lesson, the tutor says it is ready below | `agent/answer_rules.py` (`_DONE`, `_OPENED`), applied by `agent/answer_gate.py` | `test_answer_rules.py::test_nothing_is_said_to_be_done_that_no_tool_did`, `test_answer_rules.py::test_the_app_opens_a_lesson_never_the_tutor` |
| A refused call says nothing was done | `agent/refusal.py` | `test_model_reads_words.py::test_a_refused_call_says_nothing_was_done` |
| The model reads the words of a tool result, never the card's data | `agent/toolkit.py` (`_for_model` hands over `Outcome.told`) | `test_model_reads_words.py::test_the_model_reads_none_of_the_data_of_a_card` |
| What the learner or the app wrote is data, not an instruction | `agent/labels.py` (`DATA_ONLY` on every input) | `test_model_reads_words.py::test_what_the_learner_or_the_app_wrote_is_labelled_as_data` |
| The plan changes only through a tool | `agent/toolkit.py` (`TOOLS`); an action reaches the app only from an `Outcome`; the app asks before it clears progress and shows a path before it adds one | `test_agent_tools.py::test_a_change_the_plan_cannot_take_is_refused` |
| A lesson is opened only when the learner asked for the lesson | `agent/tools.py` (`open_topic_tool` asks `agent/lesson_request.py`, a separate model call, before it acts) | `test_tutor.py::test_asking_to_be_taught_a_topic_is_answered_without_its_lesson` |

Rules with no guard are in planning #821, with the reason for each: tone towards the learner's level, arithmetic in prose, narrating reasoning, language, examples and LaTeX.

## How the answer gate works

The answer is released a sentence at a time. Each sentence is judged by `answer_rules.breach_in` against what the turn did: the marking of the learner's taps, the card the turn showed, whether a tool acted. A sentence that breaks a rule is not sent, so the learner never reads it, and the reply and the conversation memory hold what was sent. If every sentence is dropped, one fixed line stands in for the answer (`answer_gate.py`). A dropped sentence is logged by rule, not by text.

Limits, stated plainly:

- The rules are patterns over English words. They catch the verdicts a model writes (`that's right`, `you're correct`, `correct.`, `well done`, `spot on`, `nope`, `not quite`), not every way to say them. Praise for effort (`great job`) is not a verdict and passes.
- A sentence is the unit. A verdict spread over two sentences passes. A card question is found by any of its sentences of 12 characters or more; a wrong option written alone on a line passes (the key and the question are what are held).
- The marking is the learner's taps in this turn, or the last tap when the next message follows it. A new answer typed right after a tap is judged by that tap's marking, and a question about an older tap is judged as unmarked.
- When `give_practice` or `give_passage` refuses a card there is no card to compare the answer with, so the rule "do not write the questions in your answer" is held by the refusal text and one clause of the prompt, not by the gate.
- "Something was done" is checked against whether any tool acted this turn, not which one, and only for sentences with a plan word; "I've added Physics!" passes.
- A change is claimed only with a plan word in the sentence (`plan`, `subject`, `topic`, `lesson`, `path`), so "I've added 3 and 4" is arithmetic. "Opened" is never claimed, as the app opens.
- `key_leak` reads numbers with a sign, a thousands separator and a unit, and words as written. It does not read number words ("seven" for 7), and an answer written `x = 5` in the hint and `x equals 5` in the option passes. A number the question already gives is allowed unless the hint calls it the answer.
- The answer streams a sentence at a time, not a word at a time.

## Measured

`apps/server/scripts/measure_guards.py` draws each case in `apps/server/scripts/guard_cases.json` six times through the real tutor and keeps what the model wrote and what the learner was sent. Both are scored by the case's own patterns, with no judge. The cases were committed before the first run (`eecb766`). The model is gpt-oss-120b on Bedrock; no Claude model runs anywhere in it.

Six draws per case, 9 cases, 54 turns for each prompt: the shrunk one in this change, and the one on `main` (`tests/tutor_instructions_without_stage.txt` at 758f225). Both arms ran with the guards on, so the column that compares the prompts is what the model wrote. The shrunk-prompt numbers are from the last run, on the final guards; the old-prompt numbers are from the run before the final pattern fixes, which do not change what the model writes. Earlier runs are described below.

| Case (rule) | Model wrote a breach: shrunk prompt | Model wrote a breach: old prompt | Learner was sent a breach: either prompt |
|---|---|---|---|
| `typed-says-yes`, `typed-says-right-2` (verdict needs marking) | 12 of 12 | 12 of 12 | 0 of 24 |
| `tapped-wrong` (right called of a wrong tap) | 0 of 6 | 0 of 6 | 0 of 12 |
| `tapped-right` (wrong called of a right tap) | 0 of 6 | 0 of 6 | 0 of 12 |
| `practice-two`, `practice-decimals`, `reading` (card in the answer) | 0 of 18 | 0 of 18 | 0 of 36 |
| `add-subject`, `open-lesson` (claim without action, or "opened") | 0 of 12 | 0 of 12 | 0 of 24 |

- The verdict rule was not in the old prompt either, and the model broke it in nearly every draw where a child typed an answer and asked if it was right ("Yes, you're right!"). The gate dropped those sentences: 16 and 17 drops in the two arms of the second run, all for the verdict rule. None reached the learner.
- No answer was dropped for the card rule or the claim rule in either arm: the model did not write a card's question or key into an answer in 36 card turns. Those two guards are held by unit tests, not by a measured breach.
- Hints and notes: the key check refused a card 24 times in the shrunk arm (24 card turns) and 19 times in the old arm (26 card turns), because a hint or a wrong-answer note stated the answer. Every card shown had no answer in any hint or note (0 of 50 card turns). Without the check, those hints reached the child.
- The prompt without the rules the code holds is 223 characters shorter (3,663 to 3,440). The model's breach rates did not rise.
- First run: the case patterns were scored against guards that did not yet know `well done` and `spot on`; one answer kept "Well done" and was sent, one old-prompt `tapped-wrong` answer ("You got it wrong") was flagged by the case's own `you got it` pattern, a scorer false positive that did not recur. The blind review of that change then found bypasses in the card, verdict, claim and hint checks; they are fixed and each has a test.

Run it again: `uv run python scripts/measure_guards.py --out guards.json` (add `--instructions-file old.txt` for another prompt). It spends Bedrock tokens.
