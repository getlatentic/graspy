use chrono::NaiveDate;

pub(super) fn required_text(value: &str, label: &str, max_chars: usize) -> Result<String, String> {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() || value.chars().count() > max_chars {
        return Err(format!(
            "Keep the {label} between 1 and {max_chars} characters."
        ));
    }
    Ok(value)
}

pub(super) fn optional_text(
    value: Option<&str>,
    max_chars: usize,
) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(value) => {
            let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
            if value.is_empty() {
                return Ok(None);
            }
            if value.chars().count() > max_chars {
                return Err(format!("Keep optional text within {max_chars} characters."));
            }
            Ok(Some(value))
        }
    }
}

pub(super) fn identifier(value: &str, label: &str, max_chars: usize) -> Result<String, String> {
    let value = required_text(value, label, max_chars)?;
    if !value.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ':')
    }) {
        return Err(format!(
            "The {label} may only use letters, numbers, dots, dashes, underscores and colons."
        ));
    }
    Ok(value)
}

pub(super) fn http_url(value: &str, label: &str) -> Result<String, String> {
    let value = required_text(value, label, 1_000)?;
    if !value.starts_with("https://") && !value.starts_with("http://") {
        return Err(format!("The {label} must be an http or https address."));
    }
    Ok(value)
}

pub(super) fn sha256(value: &str, label: &str) -> Result<String, String> {
    if value.len() != 64
        || !value
            .chars()
            .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase())
    {
        return Err(format!("The {label} must be a lowercase SHA-256 value."));
    }
    Ok(value.to_owned())
}

pub(super) fn optional_date(value: Option<&str>, label: &str) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| format!("The {label} must be a valid date."))?;
    Ok(Some(value.to_owned()))
}
