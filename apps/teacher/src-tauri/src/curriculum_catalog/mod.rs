pub(crate) mod commands;
pub(crate) mod domain;
mod package;
pub(crate) mod repository;

#[cfg(test)]
pub(crate) use package::{test_version_two_package_contents, test_version_two_package_payload};

pub use commands::{assign_curriculum_course, get_curriculum_catalog, install_curriculum_package};
