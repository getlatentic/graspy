"""The calculate tool evaluates model-supplied strings: a security boundary."""

import math
import time

import pytest

from app.agent.sandbox import CalculationError, evaluate

# Reaches os.popen / os.environ through a class walk, with every name inside
# the lambda's own code object, where a check of co_names would miss it.
_POPEN = (
    "(lambda: [c for c in ().__class__.__base__.__subclasses__() "
    "if c.__name__=='_wrap_close'][0].__init__.__globals__"
    "['popen']('id').read())()"
)
_ENVIRON = (
    "(lambda: [c for c in ().__class__.__base__.__subclasses__() "
    "if c.__name__=='_wrap_close'][0].__init__.__globals__"
    "['environ'].get('AWS_BEARER_TOKEN_BEDROCK'))()"
)

ESCAPES = [
    pytest.param(_POPEN, id="shell-exec-via-lambda"),
    pytest.param(_ENVIRON, id="env-read-via-lambda"),
    pytest.param("__import__('os').system('id')", id="import"),
    pytest.param("().__class__.__base__.__subclasses__()", id="class-walk"),
    pytest.param(
        "[c for c in ().__class__.__base__.__subclasses__()]", id="comprehension"
    ),
    pytest.param("open('/etc/passwd').read()", id="file-read"),
    pytest.param("math.__loader__.load_module('os')", id="module-attribute"),
    pytest.param("(1).__class__.__mro__", id="dunder-attribute"),
    pytest.param("globals()", id="globals"),
    pytest.param("'a'*10", id="non-numeric-literal"),
    pytest.param("os.system('id')", id="other-module"),
    pytest.param("x + 1", id="unknown-name"),
    pytest.param("math.tau_", id="unknown-constant"),
    pytest.param("round(3.14159, ndigits=2)", id="keyword-argument"),
    pytest.param("1 << 100000", id="shift"),
    pytest.param("2 +", id="unparseable"),
    pytest.param("1+" * 250 + "1", id="too-long"),
]


@pytest.mark.parametrize("expression", ESCAPES)
def test_rejects_escape(expression):
    with pytest.raises(CalculationError):
        evaluate(expression)


# Uncapped, each of these holds a CPU for seconds to minutes, and the first
# needs about 400 MB, three times a Worker's memory. Capping only the exponent
# would let a huge base through, and comb and perm need caps of their own.
DENIAL_OF_SERVICE = [
    pytest.param("((10**1000)**1000)**1000", id="power-of-a-power"),
    pytest.param("math.factorial(1000)**1000", id="power-of-a-factorial"),
    pytest.param("math.comb(10**6, 5*10**5)", id="large-combination"),
    pytest.param("math.perm(10**5, 10**5)", id="large-permutation"),
    pytest.param("math.perm(10**5)", id="permutation-of-all"),
    pytest.param("*".join(["(10**900)"] * 5), id="product-chain"),
    pytest.param("9**9**9", id="nested-exponent"),
    pytest.param("2**100000", id="large-exponent"),
    pytest.param("math.factorial(10**9)", id="large-factorial"),
]


@pytest.mark.parametrize("expression", DENIAL_OF_SERVICE)
def test_rejects_runaway_computation(expression):
    """Refused before the work is done, not after: a check on the result alone
    would pass these, slowly."""
    started = time.perf_counter()

    with pytest.raises(CalculationError):
        evaluate(expression)

    assert time.perf_counter() - started < 0.5


ARITHMETIC = [
    ("0.15 * 240", 36.0),
    ("2 + 3 * 4", 14),
    ("(2 + 3) * 4", 20),
    ("-5 + 2", -3),
    ("7 // 2", 3),
    ("7 % 2", 1),
    ("2 ** 10", 1024),
    ("math.sqrt(144)", 12.0),
    ("sqrt(144)", 12.0),
    ("abs(-4)", 4),
    ("round(3.14159, 2)", 3.14),
    ("min(3, 1, 2)", 1),
    ("max(3, 1, 2)", 3),
    ("math.pi", math.pi),
    ("pi * 2", math.tau),
    ("math.log(math.e)", 1.0),
    ("math.comb(52, 5)", 2_598_960),
    ("math.perm(10, 3)", 720),
    ("1 ** 100000", 1),
]


@pytest.mark.parametrize("expression,expected", ARITHMETIC)
def test_evaluates_arithmetic(expression, expected):
    assert evaluate(expression) == pytest.approx(expected)


def test_reports_failure_as_an_error_not_a_result():
    """A failure returned as a successful result would be presented by the
    model as an answer."""
    with pytest.raises(CalculationError):
        evaluate("1 / 0")


def test_numbers_up_to_the_limit_are_still_worked_with():
    """The bound is about 3,000 digits, well past anything a lesson needs."""
    assert evaluate("math.factorial(1000)") == math.factorial(1000)
    assert evaluate("2 ** 9999") == 2**9999


@pytest.mark.parametrize(
    ("expression", "reason"),
    [
        ("'a'", "only numbers are allowed"),
        ("True + 1", "only numbers are allowed"),
        ("[1, 2]", "List is not allowed here"),
        ("x + 1", "unknown name 'x'"),
        ("os.pi", "attribute access is not allowed here"),
        ("(1).real", "attribute access is not allowed here"),
        ("math.nothing", "unknown constant 'nothing'"),
        ("5 & 3", "BitAnd is not allowed"),
        ("~5", "Invert is not allowed"),
        ("round(1.5, ndigits=0)", "keyword arguments are not allowed"),
        ("nothing(1)", "unknown function 'nothing'"),
        ("os.system(1)", "unknown module 'os'"),
        ("(lambda: 1)()", "expression is not a direct function call"),
        ("f[0](1)", "expression is not a direct function call"),
        ("2 +", "could not parse the expression: invalid syntax"),
        ("1" * 501, "expression is too long"),
        ("2 ** 10000", "the result is too large to work with"),
        ("2 ** (10 ** 3000)", "pow would give a number too large to work with"),
        (
            "math.factorial(1001)",
            "factorial would give a number too large to work with",
        ),
        ("1 / 0", "division by zero"),
        ("math.factorial(5.5)", "'float' object cannot be interpreted as an integer"),
        ("math.comb(5.0, 2)", "'float' object cannot be interpreted as an integer"),
    ],
)
def test_a_refusal_says_what_to_change(expression, reason):
    """The reason goes back to the model, which uses it to write a better
    expression on its next step."""
    with pytest.raises(CalculationError) as refused:
        evaluate(expression)

    assert str(refused.value) == reason


def test_an_expression_at_the_length_limit_is_evaluated():
    assert evaluate("1" * 500) == int("1" * 500)


@pytest.mark.parametrize(
    "expression",
    ["1" + "+1" * 60, "-" * 60 + "1", "abs(" * 60 + "1" + ")" * 60],
    ids=["long-chain", "stacked-signs", "nested-calls"],
)
def test_deep_nesting_is_refused_before_it_is_walked(expression):
    with pytest.raises(CalculationError) as refused:
        evaluate(expression)

    assert str(refused.value) == "expression is nested too deeply"


def test_nesting_is_allowed_up_to_the_limit():
    """Forty-eight signs over a number is fifty levels: the expression, each
    sign, and the number."""
    assert evaluate("-" * 48 + "1") == 1

    with pytest.raises(CalculationError, match="nested too deeply"):
        evaluate("-" * 49 + "1")


def test_nesting_a_learner_writes_is_evaluated():
    assert evaluate("((2 + 3) * (4 - 1)) / (5 + " + "1 + " * 20 + "0)") == 0.6
