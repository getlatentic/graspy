#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorpusAttribution {
    pub package_id: String,
    pub title: String,
    pub publisher: String,
    pub source_url: String,
    pub licence_name: String,
    pub licence_url: String,
    pub attribution: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextbookExcerpt {
    pub record_id: String,
    pub title: String,
    pub text: String,
    pub attribution: CorpusAttribution,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextbookFigure {
    pub record_id: String,
    pub asset_file_name: String,
    pub source_url: String,
    pub caption: String,
    pub alt_text: String,
    pub sha256: String,
    pub media_type: String,
    pub width_px: i64,
    pub height_px: i64,
    pub sequence: i64,
}
