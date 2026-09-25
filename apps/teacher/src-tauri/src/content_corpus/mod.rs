mod domain;
mod repository;
mod search;

#[cfg(test)]
pub(crate) use domain::CorpusAttribution;
pub(crate) use domain::{TextbookExcerpt, TextbookFigure};
pub(crate) use repository::ContentCorpus;
