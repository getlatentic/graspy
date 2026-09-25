//! The source library must be opened before the bundled packages are installed.
//!
//! Installing a package can refuse — one already installed under the same
//! identity with different contents — and `initialize_workspace` stops at the
//! first error. With the corpus opened after them, that refusal left the library
//! unopened for the whole session, and a teacher preparing a lesson from their
//! own goals was told the source library was not ready: a failure in one
//! subsystem reported as a fault in an unrelated one.
//!
//! The corpus is read-only and carries nothing from the packages, so it has no
//! reason to depend on them. This guard fails the build rather than letting the
//! order regress silently, because the symptom appears far from the cause.

#[cfg(test)]
mod tests {
    #[test]
    fn the_source_library_is_opened_before_any_package_install_can_refuse() {
        let source = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
            .expect("readable lib.rs");
        let body = source
            .split_once("fn initialize_workspace")
            .expect("initialize_workspace is defined")
            .1;
        let body = body.split_once("\n}").expect("a closed function body").0;
        // Matched with whitespace removed so the guard tracks the order of the
        // calls rather than however rustfmt happens to break the lines.
        let body: String = body.chars().filter(|c| !c.is_whitespace()).collect();

        let corpus = body
            .find("ContentCorpus>().init_from_app")
            .expect("the workspace opens the source library");
        let first_install = body
            .find("install_bundled_packages")
            .expect("the workspace installs bundled packages");

        assert!(
            corpus < first_install,
            "open the source library before installing bundled packages: an install that \
             refuses stops initialize_workspace, and a corpus opened after it never opens"
        );
    }
}
