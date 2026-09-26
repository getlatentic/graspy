package com.latentic.graspy.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/** An option to choose, under its group's heading, found by its label or other names ("JS1" for "JSS 1"). */
data class SelectOption(val value: String, val label: String, val group: String? = null, val keywords: List<String> = emptyList())

// A name as it is searched: "JS 2", "js2" and "J.S. 2" are one name.
private val SEPARATORS = Regex("[\\s.\\-_/]+")
private fun searchable(name: String) = name.lowercase().replace(SEPARATORS, "")

fun matchingOptions(options: List<SelectOption>, term: String): List<SelectOption> {
    val query = searchable(term)
    return options.filter { option -> (listOf(option.label) + option.keywords).any { searchable(it).contains(query) } }
}

/** The web's searchable select: a field that opens the options, grouped as they were given, with a search. */
@Composable
fun SearchableSelect(
    label: String,
    value: String,
    options: List<SelectOption>,
    placeholder: String,
    noResults: String,
    enabled: Boolean = true,
    onChoose: (String) -> Unit,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val chosen = options.firstOrNull { it.value == value }?.label
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink)
        val shape = RoundedCornerShape(GraspyRadius.Control)
        Text(
            chosen ?: placeholder,
            style = MaterialTheme.typography.bodyLarge,
            color = if (chosen != null) GraspyColor.Ink else GraspyColor.Muted,
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(if (enabled) GraspyColor.Surface else GraspyColor.Raised)
                .border(1.dp, GraspyColor.Line, shape)
                .clickable(enabled = enabled, onClick = tapping { open = true })
                .semantics {
                    role = Role.DropdownList
                    contentDescription = "$label: ${chosen ?: placeholder}"
                }
                .padding(horizontal = space(4), vertical = space(3)),
        )
    }
    if (open) OptionSheet(label, options, placeholder, noResults, onClose = { open = false }) {
        onChoose(it)
        open = false
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OptionSheet(title: String, options: List<SelectOption>, placeholder: String, noResults: String, onClose: () -> Unit, onChoose: (String) -> Unit) {
    var term by rememberSaveable { mutableStateOf("") }
    val shown = if (term.isBlank()) options else matchingOptions(options, term)
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = GraspyColor.Surface) {
        Column(Modifier.padding(horizontal = space(4)).imePadding().navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(space(3))) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = GraspyColor.Ink)
            SearchField(term, placeholder) { term = it }
            if (shown.isEmpty()) Text(noResults, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = space(120))) {
                shown.groupBy { it.group }.forEach { (group, members) ->
                    group?.let { heading -> item(key = "group:$heading") { GroupHeading(heading) } }
                    items(members, key = { "option:${it.group}:${it.value}" }) { option ->
                        Text(
                            option.label,
                            style = MaterialTheme.typography.bodyLarge,
                            color = GraspyColor.Ink,
                            modifier = Modifier.fillMaxWidth().clickable(onClick = tapping { onChoose(option.value) }).padding(vertical = space(3)),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchField(term: String, placeholder: String, onChange: (String) -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Control)
    Box(
        Modifier.fillMaxWidth().border(1.dp, GraspyColor.Accent, shape).padding(horizontal = space(4), vertical = space(3)),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (term.isEmpty()) Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Muted)
        BasicTextField(
            value = term,
            onValueChange = onChange,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = GraspyColor.Ink),
            cursorBrush = SolidColor(GraspyColor.Accent),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = placeholder },
        )
    }
}

@Composable
private fun GroupHeading(text: String) {
    Row(Modifier.padding(top = space(3), bottom = space(1))) {
        Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = GraspyColor.Muted)
    }
}
