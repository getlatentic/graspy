"""The words a question may be made of to be worked out in code. Before its
maths, a calculation may only use words that ask for a value: a word problem
tells a story there, and is left alone. After its maths, a noun may name what
is counted ("45% of 80 points"), but no word may change what is asked."""

from __future__ import annotations


def _words(text: str) -> frozenset[str]:
    return frozenset(text.split())


# Every word of a calculation before its maths is one of these.
ASKING = _words(
    """
    what what's whats is are does the of value find calculate work out evaluate
    compute determine state simplify simplified simplifying reduce solve after
    convert change express write rewrite give your answer result as a an to into
    in its simplest lowest form terms decimal decimals fraction fractions
    percentage percentages percent per cent mixed number numbers improper whole
    equivalent equal equals same which following one correct right product sum
    total difference quotient how many much there missing fill blank represent
    represents conversion length mass weight capacity volume
    """
)
# A lone number is only a question when it is to be changed.
CHANGING = _words(
    """
    convert change express write rewrite equivalent equal equals same simplify
    simplified simplifying reduce represent represents conversion
    """
)
# Words that, after a calculation's maths, change what it asks: a remainder, a
# share, a rate, a comparison, a rounding or a second step.
NOT_THE_VALUE = _words(
    """
    and or not than more less left remain remains remaining rest before each
    per every share shared shares among between altogether twice double doubled
    half halved times back extra change new old original lost gained won spent
    saved discount increase increased decrease decreased profit loss plus minus
    add added adding subtract subtracted subtracting multiply multiplied
    multiplying divide divided dividing nearest round rounded approximately
    about estimate places significant then next first one two three four five
    six seven eight nine ten twelve twenty hundred thousand dozen quarter third
    except incorrect wrong false mistake error total all together
    """
)
# After an equation, every word is one of these: a question that goes on to
# ask for anything else ("How much do two pens cost?") is left alone.
ASKING_FOR_THE_LETTER = _words(
    """
    what what's whats is the value of find calculate work out determine state
    solve correct right answer your give as a an in its simplest lowest form
    terms fraction decimal whole number mixed improper which equation satisfies
    makes true and check verify solution by substitution for
    """
)
# Before an equation, every word is one of these: words that only lead to it.
# "a quarter of x = 3" or "the reciprocal of x = 1/4" says what the letter
# is taken of, and is left alone.
LEADING_TO_THE_EQUATION = _words(
    """
    what what's whats is the value of find calculate work out determine state
    solve correct right for if given that in equation satisfies satisfy makes
    true which number unknown letter a an one-step one‑step two-step two‑step
    linear simple following this when
    """
)
# Words that ask for something other than an equation's letter.
NOT_THE_LETTER = _words(
    """
    not except incorrect wrong false mistake error errors coefficient constant
    term terms expression step steps first next operation inverse twice double
    doubled half halved square squared cube plus minus sum difference product
    quotient total more less times add added adding subtract subtracted
    subtracting multiply multiplied multiplying divide divided dividing side
    sides left remaining remains estimate approximately round nearest possible
    values
    """
)
