package com.latentic.graspy.practice

private val UNITS = listOf(
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
)
private val TENS = listOf("twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")

/** English words for 0..999, as the teacher says a product; the same words in every app language. */
fun numberWords(value: Int): String = when {
    value < 20 -> UNITS[value]
    value < 100 -> TENS[value / 10 - 2] + (value % 10).takeIf { it > 0 }?.let { "-${UNITS[it]}" }.orEmpty()
    else -> "${UNITS[value / 100]} hundred" + (value % 100).takeIf { it > 0 }?.let { " and ${numberWords(it)}" }.orEmpty()
}
