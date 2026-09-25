use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ContentRightsKind {
    Licence,
    OfficialText,
    PublicDomain,
    Permission,
}

impl ContentRightsKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Licence => "licence",
            Self::OfficialText => "official_text",
            Self::PublicDomain => "public_domain",
            Self::Permission => "permission",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ContentRightsBasis {
    pub(crate) kind: ContentRightsKind,
    pub(crate) name: String,
    pub(crate) statement: String,
    pub(crate) url: String,
}

impl ContentRightsBasis {
    pub(crate) fn validate(mut self) -> Result<Self, String> {
        self.name = required_text(&self.name, "rights basis name", 200)?;
        self.statement = required_text(&self.statement, "rights basis statement", 2_000)?;
        self.url = http_url(&self.url, "rights basis address")?;
        Ok(self)
    }
}

fn required_text(value: &str, label: &str, maximum_length: usize) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > maximum_length {
        return Err(format!(
            "The {label} must contain between 1 and {maximum_length} characters."
        ));
    }
    Ok(value.to_owned())
}

fn http_url(value: &str, label: &str) -> Result<String, String> {
    let value = required_text(value, label, 1_000)?;
    if !value.starts_with("https://") && !value.starts_with("http://") {
        return Err(format!("The {label} must be an http or https address."));
    }
    Ok(value)
}
