package com.latentic.graspy.practice

import com.latentic.graspy.localization.SchoolClass

/** Which times tables a class works through; the Worker's lesson policy decides the moves within them. */
object Curriculum {
    private val startTable = mapOf(
        SchoolClass.PRIMARY_1 to 1,
        SchoolClass.PRIMARY_2 to 1,
        SchoolClass.PRIMARY_3 to 2,
        SchoolClass.PRIMARY_4 to 2,
        SchoolClass.PRIMARY_5 to 3,
        SchoolClass.PRIMARY_6 to 4,
        SchoolClass.JSS_1 to 6,
        SchoolClass.JSS_2 to 6,
        SchoolClass.JSS_3 to 6,
    )
    const val LAST_TABLE = 12

    fun startTable(schoolClass: SchoolClass): Int = startTable.getValue(schoolClass)

    fun tables(schoolClass: SchoolClass): IntRange = startTable(schoolClass)..LAST_TABLE

    val NUMBER_WORDS = mapOf(
        1 to "one", 2 to "two", 3 to "three", 4 to "four", 5 to "five", 6 to "six",
        7 to "seven", 8 to "eight", 9 to "nine", 10 to "ten", 11 to "eleven", 12 to "twelve",
    )
}

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

/** Table number carried by a lesson prompt ID, or null for other prompts. */
fun tableOfPrompt(promptId: String?): Int? = promptId?.let { LESSON_TABLE.find(it)?.groupValues?.get(1)?.toInt() }

private val LESSON_TABLE = Regex("""^mul_(?:table_|fact_)([1-9]|1[0-2])(?:_|x)""")
