use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use fs2::available_space;
use futures_util::StreamExt;
use reqwest::{header, Client, StatusCode};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::{
    fs::{self, File, OpenOptions},
    io::{AsyncReadExt, AsyncWriteExt},
    sync::Mutex,
};
use tokio_util::sync::CancellationToken;

use crate::db::Database;

use super::{
    domain::{
        AcquisitionError, AcquisitionPhase, AcquisitionProgress, InstallationState,
        ModelFile, ModelInstallationSnapshot, ModelManifest,
    },
    repository,
};

const PROGRESS_EVENT: &str = "model-acquisition-progress";
const IO_BUFFER_SIZE: usize = 1024 * 1024;
const PROGRESS_INTERVAL_BYTES: u64 = 8 * 1024 * 1024;

pub struct ModelAcquisitionRuntime {
    client: Client,
    operations: Mutex<HashMap<String, CancellationToken>>,
}

impl Default for ModelAcquisitionRuntime {
    fn default() -> Self {
        Self {
            client: Client::new(),
            operations: Mutex::new(HashMap::new()),
        }
    }
}

struct ModelPaths {
    directory: PathBuf,
    installed: PathBuf,
    download_partial: PathBuf,
}

impl ModelPaths {
    fn for_file<R: Runtime>(app: &AppHandle<R>, file: ModelFile) -> Result<Self, AcquisitionError> {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| {
                AcquisitionError::new(
                    "storage_unavailable",
                    format!("Local storage is unavailable: {error}"),
                )
            })?
            .join("models");
        Ok(Self {
            installed: directory.join(file.file_name),
            download_partial: directory.join(format!("{}.download.part", file.file_name)),
            directory,
        })
    }
}

impl ModelAcquisitionRuntime {
    pub async fn reconcile<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let manifest = chosen_manifest(database)?;
        self.reconcile_file(app, database, manifest.weights()).await
    }

    /// Where the file that lets the model read a photograph has got to.
    pub async fn reconcile_sight<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let sight = sight_of(chosen_manifest(database)?)?;
        self.reconcile_file(app, database, sight).await
    }

    async fn reconcile_file<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        file: ModelFile,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let manifest = chosen_manifest(database)?;
        let paths = ModelPaths::for_file(app, file)?;
        fs::create_dir_all(&paths.directory)
            .await
            .map_err(storage_error)?;

        if installation_matches_record(database, manifest, file, &paths.installed).await? {
            return Ok(ModelInstallationSnapshot::new(
                InstallationState::Installed,
                file.byte_size,
                manifest,
                file,
            ));
        }

        repository::remove_verified(database, manifest.id, file.file_name).map_err(database_error)?;
        if file_size(&paths.installed).await == Some(file.byte_size) {
            let cancellation = CancellationToken::new();
            verify_file(
                app,
                "startup-check",
                AcquisitionPhase::Verifying,
                &paths.installed,
                file,
                &cancellation,
            )
            .await?;
            persist_verified_file(database, manifest, file, &paths.installed).await?;
            return Ok(ModelInstallationSnapshot::new(
                InstallationState::Installed,
                file.byte_size,
                manifest,
                file,
            ));
        }

        let partial_bytes = file_size(&paths.download_partial)
            .await
            .filter(|size| *size <= file.byte_size)
            .unwrap_or(0);
        let state = if partial_bytes > 0 {
            InstallationState::Partial
        } else {
            InstallationState::Absent
        };
        Ok(ModelInstallationSnapshot::new(
            state,
            partial_bytes,
            manifest,
            file,
        ))
    }

    pub async fn verified_model_path<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
    ) -> Result<PathBuf, String> {
        let manifest = chosen_manifest(database).map_err(|error| error.message)?;
        let weights = manifest.weights();
        let paths = ModelPaths::for_file(app, weights).map_err(|error| error.message)?;
        if installation_matches_record(database, manifest, weights, &paths.installed)
            .await
            .map_err(|error| error.message)?
        {
            Ok(paths.installed)
        } else {
            Err("Offline setup must be completed before classwork can be created.".to_owned())
        }
    }

    /// The projector beside an installed model, when a proved copy is there.
    ///
    /// A model that can read a photograph needs a second file, and the engine
    /// is told about it only when the copy on disk is the one the manifest
    /// pins. Missing or altered, the engine starts without sight and the
    /// photograph route is not offered — a state a teacher can act on, where
    /// starting on an unchecked file is not.
    ///
    /// This is the recorded verification rather than a fresh digest, the same
    /// way the weights are trusted between runs: reading half a gigabyte to
    /// answer it would delay every engine start and every screen that asks.
    pub async fn verified_sight_path<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
    ) -> Option<PathBuf> {
        let manifest = chosen_manifest(database).ok()?;
        let sight = manifest.sight?;
        let paths = ModelPaths::for_file(app, sight).ok()?;
        installation_matches_record(database, manifest, sight, &paths.installed)
            .await
            .ok()?
            .then_some(paths.installed)
    }

    /// Whether a photograph can be read on this machine.
    pub async fn sight_is_installed<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
    ) -> bool {
        self.verified_sight_path(app, database).await.is_some()
    }

    pub async fn download<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let file = chosen_manifest(database)?.weights();
        self.downloading(app, database, request_id, file).await
    }

    /// Fetches the file that lets the model read a photograph, the same way the
    /// weights are fetched: resumed where it left off, proved before it is
    /// installed, and recorded on its own.
    pub async fn download_sight<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let sight = sight_of(chosen_manifest(database)?)?;
        self.downloading(app, database, request_id, sight).await
    }

    async fn downloading<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
        file: ModelFile,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let cancellation = self.register(request_id).await?;
        let result = self
            .download_registered(app, database, request_id, file, &cancellation)
            .await;
        self.finish(request_id).await;
        result
    }

    async fn download_registered<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
        file: ModelFile,
        cancellation: &CancellationToken,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let manifest = chosen_manifest(database)?;
        let paths = ModelPaths::for_file(app, file)?;
        fs::create_dir_all(&paths.directory)
            .await
            .map_err(storage_error)?;

        if installation_matches_record(database, manifest, file, &paths.installed).await? {
            return Ok(ModelInstallationSnapshot::new(
                InstallationState::Installed,
                file.byte_size,
                manifest,
                file,
            ));
        }

        let mut offset = file_size(&paths.download_partial).await.unwrap_or(0);
        if offset > file.byte_size {
            fs::remove_file(&paths.download_partial)
                .await
                .map_err(storage_error)?;
            offset = 0;
        }
        ensure_space(&paths.directory, file.byte_size - offset)?;

        if offset < file.byte_size {
            transfer_download(
                &self.client,
                &manifest.download_url(file),
                &paths.download_partial,
                file,
                offset,
                cancellation,
                |downloaded| {
                    emit_progress(
                        app,
                        request_id,
                        AcquisitionPhase::Downloading,
                        downloaded,
                        file.byte_size,
                    )
                },
            )
            .await?;
        }

        let verification = verify_file(
            app,
            request_id,
            AcquisitionPhase::Verifying,
            &paths.download_partial,
            file,
            cancellation,
        )
        .await;
        if verification.is_err() && !cancellation.is_cancelled() {
            let _ = fs::remove_file(&paths.download_partial).await;
        }
        verification?;
        install_partial(&paths.download_partial, &paths.installed).await?;
        persist_verified_file(database, manifest, file, &paths.installed).await?;
        Ok(ModelInstallationSnapshot::new(
            InstallationState::Installed,
            file.byte_size,
            manifest,
            file,
        ))
    }

    pub async fn import<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
        source: &Path,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let file = chosen_manifest(database)?.weights();
        self.importing(app, database, request_id, source, file).await
    }

    /// Takes the file that lets the model read a photograph off a stick, the
    /// same way the weights come off one where there is no connection to fetch
    /// them over.
    pub async fn import_sight<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
        source: &Path,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let sight = sight_of(chosen_manifest(database)?)?;
        self.importing(app, database, request_id, source, sight)
            .await
    }

    async fn importing<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
        source: &Path,
        file: ModelFile,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let cancellation = self.register(request_id).await?;
        let result = self
            .import_registered(app, database, request_id, source, file, &cancellation)
            .await;
        self.finish(request_id).await;
        result
    }

    async fn import_registered<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        request_id: &str,
        source: &Path,
        file: ModelFile,
        cancellation: &CancellationToken,
    ) -> Result<ModelInstallationSnapshot, AcquisitionError> {
        let manifest = chosen_manifest(database)?;
        let paths = ModelPaths::for_file(app, file)?;
        fs::create_dir_all(&paths.directory)
            .await
            .map_err(storage_error)?;
        if installation_matches_record(database, manifest, file, &paths.installed).await? {
            return Ok(ModelInstallationSnapshot::new(
                InstallationState::Installed,
                file.byte_size,
                manifest,
                file,
            ));
        }

        let source_size = file_size(source).await.ok_or_else(|| {
            AcquisitionError::new("file_unavailable", "That file could not be opened.")
        })?;
        if source_size != file.byte_size {
            return Err(AcquisitionError::new(
                "unexpected_size",
                "That is not the approved offline setup file.",
            ));
        }
        ensure_space(&paths.directory, file.byte_size)?;

        let import_partial = paths
            .directory
            .join(format!("{}.{}.import.part", file.file_name, request_id));
        let result = copy_import(
            app,
            request_id,
            source,
            &import_partial,
            file.byte_size,
            cancellation,
        )
        .await;
        if let Err(error) = result {
            let _ = fs::remove_file(&import_partial).await;
            return Err(error);
        }

        if let Err(error) = verify_file(
            app,
            request_id,
            AcquisitionPhase::Verifying,
            &import_partial,
            file,
            cancellation,
        )
        .await
        {
            let _ = fs::remove_file(&import_partial).await;
            return Err(error);
        }
        install_partial(&import_partial, &paths.installed).await?;
        persist_verified_file(database, manifest, file, &paths.installed).await?;
        Ok(ModelInstallationSnapshot::new(
            InstallationState::Installed,
            file.byte_size,
            manifest,
            file,
        ))
    }

    pub async fn cancel(&self, request_id: &str) {
        if let Some(cancellation) = self.operations.lock().await.get(request_id) {
            cancellation.cancel();
        }
    }

    pub async fn shutdown(&self) {
        let mut operations = self.operations.lock().await;
        operations
            .drain()
            .for_each(|(_, cancellation)| cancellation.cancel());
    }

    async fn register(&self, request_id: &str) -> Result<CancellationToken, AcquisitionError> {
        let mut operations = self.operations.lock().await;
        if !operations.is_empty() {
            return Err(AcquisitionError::new(
                "operation_active",
                "Another setup action is already running.",
            ));
        }
        let cancellation = CancellationToken::new();
        operations.insert(request_id.to_owned(), cancellation.clone());
        Ok(cancellation)
    }

    async fn finish(&self, request_id: &str) {
        self.operations.lock().await.remove(request_id);
    }
}

async fn transfer_download(
    client: &Client,
    url: &str,
    partial_path: &Path,
    file: ModelFile,
    offset: u64,
    cancellation: &CancellationToken,
    mut report_progress: impl FnMut(u64) -> Result<(), AcquisitionError>,
) -> Result<(), AcquisitionError> {
    if cancellation.is_cancelled() {
        return Err(AcquisitionError::cancelled());
    }
    let mut request = client.get(url);
    if offset > 0 {
        request = request.header(header::RANGE, format!("bytes={offset}-"));
    }
    let response = request.send().await.map_err(download_error)?;
    validate_download_response(response.status(), response.headers(), offset, file)?;

    let mut partial = if offset == 0 {
        OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(partial_path)
            .await
            .map_err(storage_error)?
    } else {
        OpenOptions::new()
            .append(true)
            .open(partial_path)
            .await
            .map_err(storage_error)?
    };
    let mut stream = response.bytes_stream();
    let mut downloaded = offset;
    let mut last_emitted = downloaded;
    report_progress(downloaded)?;

    loop {
        let next = tokio::select! {
            _ = cancellation.cancelled() => return Err(AcquisitionError::cancelled()),
            next = stream.next() => next,
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(download_error)?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > file.byte_size {
            return Err(AcquisitionError::new(
                "unexpected_size",
                "The downloaded file is larger than the approved file.",
            ));
        }
        partial.write_all(&chunk).await.map_err(storage_error)?;
        if should_emit_progress(last_emitted, downloaded, file.byte_size) {
            report_progress(downloaded)?;
            last_emitted = downloaded;
        }
    }
    partial.flush().await.map_err(storage_error)?;
    partial.sync_all().await.map_err(storage_error)?;
    Ok(())
}

async fn copy_import<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    source: &Path,
    partial: &Path,
    total_bytes: u64,
    cancellation: &CancellationToken,
) -> Result<(), AcquisitionError> {
    let mut source = File::open(source).await.map_err(storage_error)?;
    let mut target = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(partial)
        .await
        .map_err(storage_error)?;
    let mut buffer = vec![0; IO_BUFFER_SIZE];
    let mut copied = 0;
    let mut last_emitted = 0;
    loop {
        if cancellation.is_cancelled() {
            return Err(AcquisitionError::cancelled());
        }
        let read = source.read(&mut buffer).await.map_err(storage_error)?;
        if read == 0 {
            break;
        }
        target
            .write_all(&buffer[..read])
            .await
            .map_err(storage_error)?;
        copied += read as u64;
        if should_emit_progress(last_emitted, copied, total_bytes) {
            emit_progress(
                app,
                request_id,
                AcquisitionPhase::Importing,
                copied,
                total_bytes,
            )?;
            last_emitted = copied;
        }
    }
    target.flush().await.map_err(storage_error)?;
    target.sync_all().await.map_err(storage_error)?;
    Ok(())
}

/// Reads a file through and holds it to the size and digest its manifest pins,
/// reporting progress as it goes.
async fn verify_file<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    phase: AcquisitionPhase,
    path: &Path,
    wanted: ModelFile,
    cancellation: &CancellationToken,
) -> Result<(), AcquisitionError> {
    let mut file = File::open(path).await.map_err(storage_error)?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0; IO_BUFFER_SIZE];
    let mut verified = 0;
    let mut last_emitted = 0;
    loop {
        if cancellation.is_cancelled() {
            return Err(AcquisitionError::cancelled());
        }
        let read = file.read(&mut buffer).await.map_err(storage_error)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
        verified += read as u64;
        if verified > wanted.byte_size {
            return Err(AcquisitionError::new(
                "unexpected_size",
                "The selected file is larger than the approved file.",
            ));
        }
        if should_emit_progress(last_emitted, verified, wanted.byte_size) {
            emit_progress(app, request_id, phase.clone(), verified, wanted.byte_size)?;
            last_emitted = verified;
        }
    }
    let actual = digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    validate_file_identity(verified, &actual, wanted)
}

fn validate_file_identity(
    byte_size: u64,
    sha256: &str,
    file: ModelFile,
) -> Result<(), AcquisitionError> {
    if byte_size != file.byte_size {
        return Err(AcquisitionError::new(
            "unexpected_size",
            "The file is incomplete. Choose the approved file or continue the download.",
        ));
    }
    if sha256 != file.sha256 {
        return Err(AcquisitionError::new(
            "checksum_mismatch",
            "That file did not pass the integrity check and was not installed.",
        ));
    }
    Ok(())
}

fn should_emit_progress(previous: u64, current: u64, total: u64) -> bool {
    current == total || current.saturating_sub(previous) >= PROGRESS_INTERVAL_BYTES
}

fn validate_download_response(
    status: StatusCode,
    headers: &header::HeaderMap,
    offset: u64,
    file: ModelFile,
) -> Result<(), AcquisitionError> {
    if offset == 0 && (status == StatusCode::OK || status == StatusCode::PARTIAL_CONTENT) {
        return Ok(());
    }
    if offset > 0 && status == StatusCode::PARTIAL_CONTENT {
        let expected_start = format!("bytes {offset}-");
        let expected_end = format!("/{}", file.byte_size);
        let valid_range = headers
            .get(header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| {
                value.starts_with(&expected_start) && value.ends_with(&expected_end)
            });
        if valid_range {
            return Ok(());
        }
    }
    Err(AcquisitionError::new(
        "resume_unavailable",
        "The download could not safely continue. Check the connection and try again.",
    ))
}

fn ensure_space(directory: &Path, required_bytes: u64) -> Result<(), AcquisitionError> {
    let available = available_space(directory).map_err(storage_error)?;
    ensure_available_space(available, required_bytes)
}

fn ensure_available_space(
    available_bytes: u64,
    required_bytes: u64,
) -> Result<(), AcquisitionError> {
    if available_bytes < required_bytes {
        return Err(AcquisitionError::new(
            "insufficient_space",
            format!(
                "This computer needs {} more free space before setup can continue.",
                format_bytes(required_bytes - available_bytes)
            ),
        ));
    }
    Ok(())
}

async fn installation_matches_record(
    database: &Database,
    manifest: ModelManifest,
    file: ModelFile,
    path: &Path,
) -> Result<bool, AcquisitionError> {
    let Some(record) =
        repository::find_verified(database, manifest, file).map_err(database_error)?
    else {
        return Ok(false);
    };
    let Some((size, modified_ns)) = file_identity(path).await? else {
        return Ok(false);
    };
    Ok(size == file.byte_size
        && record.installed_file_size == size
        && record.installed_file_modified_ns == modified_ns)
}

async fn persist_verified_file(
    database: &Database,
    manifest: ModelManifest,
    file: ModelFile,
    path: &Path,
) -> Result<(), AcquisitionError> {
    let (size, modified_ns) = file_identity(path).await?.ok_or_else(|| {
        AcquisitionError::new("storage_unavailable", "The installed file is missing.")
    })?;
    repository::save_verified(database, manifest, file, size, modified_ns).map_err(database_error)
}

async fn file_identity(path: &Path) -> Result<Option<(u64, i64)>, AcquisitionError> {
    let metadata = match fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(storage_error(error)),
    };
    if !metadata.is_file() {
        return Ok(None);
    }
    let modified_ns = metadata
        .modified()
        .map_err(storage_error)?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AcquisitionError::new("storage_unavailable", error.to_string()))?
        .as_nanos() as i64;
    Ok(Some((metadata.len(), modified_ns)))
}

async fn file_size(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .await
        .ok()
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
}

async fn install_partial(partial: &Path, installed: &Path) -> Result<(), AcquisitionError> {
    let backup = installed.with_extension("previous");
    if fs::try_exists(&backup).await.map_err(storage_error)? {
        fs::remove_file(&backup).await.map_err(storage_error)?;
    }
    let had_installed = fs::try_exists(installed).await.map_err(storage_error)?;
    if had_installed {
        fs::rename(installed, &backup)
            .await
            .map_err(storage_error)?;
    }
    if let Err(error) = fs::rename(partial, installed).await {
        if had_installed {
            let _ = fs::rename(&backup, installed).await;
        }
        return Err(storage_error(error));
    }
    if had_installed {
        fs::remove_file(&backup).await.map_err(storage_error)?;
    }
    Ok(())
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    phase: AcquisitionPhase,
    processed_bytes: u64,
    total_bytes: u64,
) -> Result<(), AcquisitionError> {
    app.emit(
        PROGRESS_EVENT,
        AcquisitionProgress {
            request_id: request_id.to_owned(),
            phase,
            processed_bytes,
            total_bytes,
        },
    )
    .map_err(|error| AcquisitionError::new("progress_unavailable", error.to_string()))
}

fn storage_error(error: impl std::fmt::Display) -> AcquisitionError {
    AcquisitionError::new(
        "storage_unavailable",
        format!("Local storage could not be updated: {error}"),
    )
}

/// Whether one particular model is already on this machine and verified.
///
/// The picker asks per model, not for the current choice, so a teacher can see
/// which options are ready to use and which would need a download first.
pub async fn is_installed<R: Runtime>(
    app: &AppHandle<R>,
    database: &Database,
    manifest: ModelManifest,
) -> bool {
    let Ok(paths) = ModelPaths::for_file(app, manifest.weights()) else {
        return false;
    };
    installation_matches_record(database, manifest, manifest.weights(), &paths.installed)
        .await
        .unwrap_or(false)
}

/// The model this machine is set to run.
///
/// Acquisition always works on the teacher's current choice: installing means
/// installing the model that is about to write lessons, and reconciling means
/// checking that one is intact. A model they are not using is not graspy's
/// business to fetch.
/// The file that lets a model read a photograph, refused for a model that
/// cannot read one at all.
fn sight_of(manifest: ModelManifest) -> Result<ModelFile, AcquisitionError> {
    manifest.sight.ok_or_else(|| {
        AcquisitionError::new(
            "model_cannot_read_photographs",
            "The lesson engine on this Mac does not read photographs.",
        )
    })
}

fn chosen_manifest(database: &Database) -> Result<ModelManifest, AcquisitionError> {
    crate::model_catalogue::selected_model(database)
        .map(|model| model.manifest)
        .map_err(database_error)
}

fn database_error(error: impl std::fmt::Display) -> AcquisitionError {
    AcquisitionError::new(
        "storage_unavailable",
        format!("The setup record could not be updated: {error}"),
    )
}

fn download_error(error: impl std::fmt::Display) -> AcquisitionError {
    AcquisitionError::new(
        "download_failed",
        format!("The download was interrupted. Your progress was kept. {error}"),
    )
}

fn format_bytes(bytes: u64) -> String {
    const GIB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MIB: f64 = 1024.0 * 1024.0;
    if bytes as f64 >= GIB {
        format!("{:.1} GB", bytes as f64 / GIB)
    } else {
        format!("{:.0} MB", bytes as f64 / MIB)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };

    const TEST_PAYLOAD: &[u8] = b"graspy acquisition";
    const TEST_MANIFEST: ModelManifest = ModelManifest {
        id: "test-model-v1",
        repository: "test/model",
        revision: "test-revision",
        file_name: "test.gguf",
        byte_size: 18,
        sha256: "5749f74de7e9316d01f6419491bce3aeb95c7fad2d4cef36a1024d0657bd0c64",
        artifact_license: "test",
        artifact_license_url: "https://example.com/license",
        upstream_terms_url: "https://example.com/terms",
        sight: Some(ModelFile {
            file_name: "test-mmproj.gguf",
            byte_size: 18,
            sha256: "5749f74de7e9316d01f6419491bce3aeb95c7fad2d4cef36a1024d0657bd0c64",
        }),
    };

    fn serve_once(response: Vec<u8>) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("local test server");
        let address = listener.local_addr().expect("server address");
        let (request_sender, request_receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test request");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 1024];
            loop {
                let read = stream.read(&mut buffer).expect("read request");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = request_sender.send(String::from_utf8_lossy(&request).into_owned());
            stream.write_all(&response).expect("write response");
        });
        (format!("http://{address}/model.gguf"), request_receiver)
    }

    #[test]
    fn refuses_a_resume_response_that_does_not_begin_at_the_partial_length() {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::CONTENT_RANGE,
            "bytes 0-99/2841481184".parse().expect("content range"),
        );

        let error = validate_download_response(
            StatusCode::PARTIAL_CONTENT,
            &headers,
            100,
            crate::model_catalogue::default_model().manifest.weights(),
        )
        .expect_err("mismatched ranges must fail");

        assert_eq!(error.code, "resume_unavailable");
    }

    #[test]
    fn accepts_a_matching_resume_response() {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::CONTENT_RANGE,
            "bytes 100-2841481183/2841481184"
                .parse()
                .expect("content range"),
        );

        assert!(validate_download_response(
            StatusCode::PARTIAL_CONTENT,
            &headers,
            100,
            crate::model_catalogue::default_model().manifest.weights(),
        )
        .is_ok());
    }

    #[tokio::test]
    async fn resumes_a_partial_download_from_the_exact_range() {
        let offset = 7_u64;
        let remaining = &TEST_PAYLOAD[offset as usize..];
        let mut response = format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {offset}-17/18\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            remaining.len()
        )
        .into_bytes();
        response.extend_from_slice(remaining);
        let (url, request) = serve_once(response);
        let directory = tempfile::tempdir().expect("temporary directory");
        let partial = directory.path().join("test.download.part");
        fs::write(&partial, &TEST_PAYLOAD[..offset as usize])
            .await
            .expect("partial file");

        transfer_download(
            &Client::new(),
            &url,
            &partial,
            TEST_MANIFEST.weights(),
            offset,
            &CancellationToken::new(),
            |_| Ok(()),
        )
        .await
        .expect("resumed download");

        assert!(request
            .recv()
            .expect("captured request")
            .to_ascii_lowercase()
            .contains("range: bytes=7-"));
        assert_eq!(
            fs::read(partial).await.expect("completed partial"),
            TEST_PAYLOAD
        );
    }

    #[tokio::test]
    async fn preserves_the_existing_partial_when_the_connection_is_truncated() {
        let offset = 7_u64;
        let body = &TEST_PAYLOAD[offset as usize..offset as usize + 3];
        let mut response = format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {offset}-17/18\r\nContent-Length: 11\r\nConnection: close\r\n\r\n"
        )
        .into_bytes();
        response.extend_from_slice(body);
        let (url, _) = serve_once(response);
        let directory = tempfile::tempdir().expect("temporary directory");
        let partial = directory.path().join("test.download.part");
        fs::write(&partial, &TEST_PAYLOAD[..offset as usize])
            .await
            .expect("partial file");

        let error = transfer_download(
            &Client::new(),
            &url,
            &partial,
            TEST_MANIFEST.weights(),
            offset,
            &CancellationToken::new(),
            |_| Ok(()),
        )
        .await
        .expect_err("truncated connection must fail");

        assert_eq!(error.code, "download_failed");
        let preserved = fs::read(partial).await.expect("preserved partial");
        assert!(preserved.starts_with(&TEST_PAYLOAD[..offset as usize]));
        assert!(preserved.len() >= offset as usize);
        assert!(preserved.len() <= offset as usize + body.len());
    }

    #[test]
    fn refuses_an_operation_before_writing_when_space_is_insufficient() {
        let error = ensure_available_space(99, 100).expect_err("insufficient space must fail");

        assert_eq!(error.code, "insufficient_space");
    }

    #[test]
    fn rejects_a_truncated_file_before_checksum_acceptance() {
        let manifest = crate::model_catalogue::default_model().manifest;

        let error = validate_file_identity(manifest.byte_size - 1, manifest.sha256, manifest.weights())
            .expect_err("truncated files must fail");

        assert_eq!(error.code, "unexpected_size");
    }

    #[test]
    fn rejects_a_same_size_corrupt_file() {
        let manifest = crate::model_catalogue::default_model().manifest;

        let error = validate_file_identity(manifest.byte_size, &"0".repeat(64), manifest.weights())
            .expect_err("corrupt files must fail");

        assert_eq!(error.code, "checksum_mismatch");
    }

    #[test]
    fn accepts_only_the_manifest_size_and_checksum_pair() {
        let manifest = crate::model_catalogue::default_model().manifest;

        assert!(validate_file_identity(manifest.byte_size, manifest.sha256, manifest.weights()).is_ok());
    }

    #[test]
    fn throttles_progress_events_but_always_reports_completion() {
        assert!(!should_emit_progress(
            0,
            PROGRESS_INTERVAL_BYTES - 1,
            100_000_000
        ));
        assert!(should_emit_progress(
            0,
            PROGRESS_INTERVAL_BYTES,
            100_000_000
        ));
        assert!(should_emit_progress(99_999_999, 100_000_000, 100_000_000));
    }

    #[tokio::test]
    async fn atomic_install_restores_the_previous_file_when_the_new_file_is_missing() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let installed = directory.path().join("installed.gguf");
        let missing_partial = directory.path().join("missing.part");
        fs::write(&installed, b"previous")
            .await
            .expect("previous installation");

        assert!(install_partial(&missing_partial, &installed).await.is_err());
        assert_eq!(
            fs::read(&installed).await.expect("restored installation"),
            b"previous"
        );
    }

    #[tokio::test]
    async fn atomic_install_replaces_an_invalid_previous_file_only_after_partial_exists() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let installed = directory.path().join("installed.gguf");
        let partial = directory.path().join("verified.part");
        fs::write(&installed, b"invalid")
            .await
            .expect("previous installation");
        fs::write(&partial, b"verified")
            .await
            .expect("verified partial");

        install_partial(&partial, &installed)
            .await
            .expect("atomic install");

        assert_eq!(
            fs::read(&installed).await.expect("installed file"),
            b"verified"
        );
        assert!(!partial.exists());
    }

    /// The engine is shown a photograph through this file, so a copy that is
    /// not the pinned one must not reach it. It goes through the proof the
    /// weights go through, because size alone would pass a file of the right
    /// length holding something else.
    #[test]
    fn a_projector_of_the_right_length_holding_something_else_is_refused() {
        let sight = TEST_MANIFEST.sight.expect("a projector");

        assert!(validate_file_identity(sight.byte_size, sight.sha256, sight).is_ok());
        assert_eq!(
            validate_file_identity(sight.byte_size, &"0".repeat(64), sight)
                .expect_err("altered bytes must fail")
                .code,
            "checksum_mismatch",
        );
    }

    /// The two files a model needs are fetched from the same pinned revision,
    /// and each from its own name there.
    #[test]
    fn each_file_a_model_needs_is_fetched_from_its_own_name() {
        let sight = TEST_MANIFEST.sight.expect("a projector");

        assert!(TEST_MANIFEST
            .download_url(TEST_MANIFEST.weights())
            .ends_with("/test-revision/test.gguf?download=true"));
        assert!(TEST_MANIFEST
            .download_url(sight)
            .ends_with("/test-revision/test-mmproj.gguf?download=true"));
    }

    /// A model that cannot read a photograph has no projector to ask for, and
    /// says so rather than failing somewhere further in.
    #[test]
    fn a_model_that_cannot_read_photographs_has_no_projector_to_fetch() {
        let text_only = ModelManifest {
            sight: None,
            ..TEST_MANIFEST
        };

        assert_eq!(
            sight_of(text_only).expect_err("nothing to fetch").code,
            "model_cannot_read_photographs",
        );
    }

    /// A model offered as able to read a photograph has to name the file that
    /// lets it, and name it as precisely as it names its own weights.
    #[test]
    fn a_model_that_can_see_pins_the_file_that_lets_it() {
        for model in crate::model_catalogue::CATALOGUE {
            let Some(sight) = model.manifest.sight else {
                continue;
            };
            assert!(sight.file_name.ends_with(".gguf"), "{}", model.manifest.id);
            assert!(sight.byte_size > 0, "{}", model.manifest.id);
            assert_eq!(sight.sha256.len(), 64, "{}", model.manifest.id);
            assert!(
                sight.sha256.chars().all(|c| c.is_ascii_hexdigit()),
                "{}",
                model.manifest.id
            );
        }
    }
}
