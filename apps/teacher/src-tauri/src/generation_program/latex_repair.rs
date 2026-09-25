//! Give back the LaTeX the JSON parser was right to swallow.
//!
//! A model writing `\frac` inside a JSON string without escaping the backslash
//! hands the parser a valid escape — `\f` is a form feed — so the reply decodes
//! cleanly and the mathematics is gone. Constrained decoding cannot prevent it,
//! because the output is well-formed JSON.
//!
//! Every LaTeX command whose first letter is a JSON escape is exposed to this:
//! `\frac` and `\text`, `\times` and `\therefore`, `\begin` and `\vec`,
//! `\rightarrow`, `\ne`. What separates the recoverable case from the ambiguous
//! one is whether the character could have been meant.

use serde_json::Value;

/// Control characters a lesson can never mean, and the text that was written.
///
/// Measured against the library rather than assumed: across every stored lesson
/// there are 3151 correct `\frac` and three mangled ones, and not one tab or
/// bare carriage return. A control character here is therefore proof an escape
/// was meant literally, and the original is recovered exactly rather than
/// guessed at.
const UNMEANT_CONTROL: [(char, &str); 5] = [
    ('\u{8}', "\\b"),
    ('\u{b}', "\\v"),
    ('\u{c}', "\\f"),
    ('\t', "\\t"),
    ('\r', "\\r"),
];

/// Commands recovered from a newline only inside mathematics.
///
/// A lesson means its paragraph breaks — there are 918 in the library — so a
/// newline cannot be restored on sight the way a tab can. Inside `$…$` it is
/// different: a break there is not prose, and a command name completing it
/// leaves nothing else the text could have been. Longest first, so `\neq` is
/// preferred over the `\ne` that prefixes it.
const MATH_NEWLINE_COMMANDS: [&str; 6] = ["notin", "nabla", "nmid", "neq", "nu", "ne"];

pub fn restore_mangled_escapes(value: &mut Value) {
    match value {
        Value::String(text) => {
            if let Some(restored) = restore_text(text) {
                *text = restored;
            }
        }
        Value::Array(items) => items.iter_mut().for_each(restore_mangled_escapes),
        Value::Object(entries) => entries
            .iter_mut()
            .for_each(|(_, entry)| restore_mangled_escapes(entry)),
        _ => {}
    }
}

fn restore_text(text: &str) -> Option<String> {
    let without_controls = restore_unmeant_controls(text);
    let source = without_controls.as_deref().unwrap_or(text);
    restore_math_newline_commands(source).or(without_controls)
}

fn restore_unmeant_controls(text: &str) -> Option<String> {
    let mut characters = text.chars().peekable();
    let mut restored = String::with_capacity(text.len());
    let mut found = false;
    while let Some(character) = characters.next() {
        // A carriage return before a newline is a line ending, not a swallowed
        // `\rightarrow`, and rewriting it would break the text it terminates.
        let terminates_line = character == '\r' && characters.peek() == Some(&'\n');
        match UNMEANT_CONTROL
            .iter()
            .find(|(unmeant, _)| character == *unmeant)
            .filter(|_| !terminates_line)
        {
            Some((_, written)) => {
                restored.push_str(written);
                found = true;
            }
            None => restored.push(character),
        }
    }
    found.then_some(restored)
}

fn restore_math_newline_commands(text: &str) -> Option<String> {
    if !text.contains('\n') || !text.contains('$') {
        return None;
    }
    let mut restored = String::with_capacity(text.len());
    let mut remainder = text;
    let mut inside_mathematics = false;
    let mut found = false;
    while let Some(position) = remainder.find(['$', '\n']) {
        restored.push_str(&remainder[..position]);
        let tail = &remainder[position..];
        if tail.starts_with('$') {
            // `$$` opens display mathematics as one delimiter, not two inline ones.
            let delimiter = tail.len() - tail.trim_start_matches('$').len();
            restored.push_str(&tail[..delimiter]);
            inside_mathematics = !inside_mathematics;
            remainder = &tail[delimiter..];
            continue;
        }
        match command_completing(&tail[1..]).filter(|_| inside_mathematics) {
            Some(command) => {
                restored.push('\\');
                restored.push_str(command);
                // The newline stands in for the command's first letter, so the
                // name's own length is what the text spent on it.
                remainder = &tail[command.len()..];
                found = true;
            }
            None => {
                restored.push('\n');
                remainder = &tail[1..];
            }
        }
    }
    restored.push_str(remainder);
    found.then_some(restored)
}

fn command_completing(text: &str) -> Option<&'static str> {
    MATH_NEWLINE_COMMANDS.into_iter().find(|command| {
        let suffix = &command[1..];
        text.strip_prefix(suffix)
            .is_some_and(|rest| !rest.starts_with(|next: char| next.is_ascii_alphabetic()))
    })
}

#[cfg(test)]
mod restored_escapes {
    use super::*;
    use serde_json::json;

    fn restored(text: &str) -> String {
        let mut value = json!({ "body": text });
        restore_mangled_escapes(&mut value);
        value["body"].as_str().expect("string").to_owned()
    }

    /// What the JSON parser hands back when the model writes `command` unescaped:
    /// the escape it read, then the rest of the name.
    fn as_decoded(escape: char, command: &str) -> String {
        format!("${escape}{} y$", &command[1..])
    }

    #[test]
    fn recovers_the_commands_a_json_escape_swallows() {
        for (escape, command) in [
            ('\u{c}', "frac"),
            ('\u{9}', "times"),
            ('\u{9}', "text"),
            ('\u{9}', "therefore"),
            ('\u{d}', "rightarrow"),
            ('\u{8}', "begin"),
            ('\u{b}', "vec"),
        ] {
            assert_eq!(
                restored(&as_decoded(escape, command)),
                format!("$\\{command} y$"),
                "\\{command}"
            );
        }
    }

    #[test]
    fn recovers_a_newline_command_only_inside_mathematics() {
        for command in ["ne", "neq", "nabla"] {
            assert_eq!(
                restored(&as_decoded('\u{a}', command)),
                format!("$\\{command} y$"),
                "\\{command}"
            );
        }
    }

    #[test]
    fn leaves_the_paragraph_breaks_a_lesson_means() {
        let prose = "Compare the fractions.\nEach learner writes an answer.";
        assert_eq!(restored(prose), prose);
        let outside_mathematics = "First:\nequal parts matter. Then $\\frac{1}{2}$ follows.";
        assert_eq!(restored(outside_mathematics), outside_mathematics);
        // Without the mathematics guard this line reads as a swallowed `\ne`.
        let abbreviation = "Compare unlike denominators.\ne.g. $\\frac{1}{2}$ and $\\frac{1}{3}$.";
        assert_eq!(restored(abbreviation), abbreviation);
        let display = "$$\n\\frac{1}{2}\n$$";
        assert_eq!(restored(display), display);
    }

    #[test]
    fn leaves_a_line_ending_intact() {
        assert_eq!(
            restored("first line\r\nsecond line"),
            "first line\r\nsecond line"
        );
    }

    #[test]
    fn recovers_through_nested_structure() {
        let mut value = json!({
            "steps": [{ "activity": "Show $\u{c}rac{3}{4}$ and $2 \times 3$." }]
        });
        restore_mangled_escapes(&mut value);
        assert_eq!(
            value["steps"][0]["activity"].as_str().expect("string"),
            "Show $\\frac{3}{4}$ and $2 \\times 3$."
        );
    }

    #[test]
    fn leaves_correct_mathematics_untouched() {
        let correct = "$\\frac{1}{2} \\times \\frac{2}{3} \\neq \\frac{1}{6}$";
        assert_eq!(restored(correct), correct);
    }
}
