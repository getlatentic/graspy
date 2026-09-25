//! Tauri runs a command on the main thread — the thread that paints the
//! window — unless the command is async or marked `#[tauri::command(async)]`.
//! Every command here reaches SQLite, so a synchronous one freezes the app for
//! as long as the query takes. This guard fails the build rather than letting
//! that regress silently.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    fn rust_sources(directory: &Path, found: &mut Vec<PathBuf>) {
        for entry in std::fs::read_dir(directory).expect("readable source directory") {
            let path = entry.expect("readable entry").path();
            if path.is_dir() {
                rust_sources(&path, found);
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                found.push(path);
            }
        }
    }

    #[test]
    fn every_command_that_touches_the_database_runs_off_the_main_thread() {
        let mut sources = Vec::new();
        rust_sources(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("src").as_path(),
            &mut sources,
        );

        let mut offenders = Vec::new();
        for source in sources {
            let text = std::fs::read_to_string(&source).expect("readable source");
            for declaration in text.split("#[tauri::command]\n").skip(1) {
                let signature = declaration.split('{').next().unwrap_or_default();
                let touches_database =
                    signature.contains("Database") || signature.contains("ContentCorpus");
                let is_async =
                    signature.starts_with("pub async fn") || signature.starts_with("async fn");
                if touches_database && !is_async {
                    let name = signature
                        .split('(')
                        .next()
                        .unwrap_or("<unknown>")
                        .trim()
                        .to_owned();
                    offenders.push(format!("{}: {name}", source.display()));
                }
            }
        }

        assert!(
            offenders.is_empty(),
            "these commands would block the window while they wait on the database; \
             mark them #[tauri::command(async)] or make them async fn:\n{}",
            offenders.join("\n")
        );
    }
}
