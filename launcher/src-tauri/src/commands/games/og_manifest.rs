//! OG-managed install manifests: schema, signing/verification, and ZIP
//! package extraction. Split out of `core.rs`; re-exported through
//! `games/mod.rs` so call sites keep using `commands::games::*`.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
};

use super::core::{
    current_unix_timestamp, ensure_path_inside_root, open_game_launcher_data_dir,
    unix_timestamp_to_iso,
};

#[cfg(test)]
use super::launch::find_launch_executable;

pub const OG_MANAGED_LATEST_VERSION: &str = "1.1.0";
pub const OG_MANAGED_MANIFEST_FILE: &str = "og-manifest.json";
pub const OG_MANAGED_MANIFEST_SIGNATURE_PREFIX: &str = "OGLM1";
const OG_MANIFEST_SIGNING_KEY_ENV: &str = "OGL_INSTALL_MANIFEST_SIGNING_KEY";
const OG_MANIFEST_VERIFYING_KEY_ENV: &str = "OGL_INSTALL_MANIFEST_VERIFYING_KEY";
const OG_MANIFEST_KEY_ID_ENV: &str = "OGL_INSTALL_MANIFEST_KEY_ID";

#[cfg(test)]
pub(crate) fn manifest_env_test_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

const OG_MANAGED_MANIFEST_FORMAT_VERSION: u32 = 1;
const MAX_EXTRACTED_GAME_BYTES: u64 = 128 * 1024 * 1024 * 1024;
const MAX_GAME_ARCHIVE_ENTRIES: usize = 250_000;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OgManagedManifest {
    #[serde(default = "default_og_manifest_format_version")]
    pub format_version: u32,
    #[serde(default)]
    pub game_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub managed_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_file: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<OgManagedManifestFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_key_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_signature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl Default for OgManagedManifest {
    fn default() -> Self {
        Self {
            format_version: OG_MANAGED_MANIFEST_FORMAT_VERSION,
            game_id: String::new(),
            title: String::new(),
            version: String::new(),
            managed_by: String::new(),
            download_url: None,
            download_sha256: None,
            package_file: None,
            files: Vec::new(),
            executable_path: None,
            manifest_key_id: None,
            manifest_signature: None,
            updated_at: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OgManagedManifestFile {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OgManifestTrustStatus {
    Missing,
    Unsigned,
    Signed,
    Invalid,
}

fn default_og_manifest_format_version() -> u32 {
    OG_MANAGED_MANIFEST_FORMAT_VERSION
}

pub fn is_og_managed_install_path(path: &Path) -> bool {
    let Some(games_root) = open_game_launcher_data_dir().map(|dir| dir.join("games")) else {
        return false;
    };

    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let normalized_root = games_root.canonicalize().unwrap_or(games_root);

    normalized_path != normalized_root && normalized_path.starts_with(normalized_root)
}

pub fn remove_managed_install_path(path: &Path) -> Result<(), String> {
    if !is_og_managed_install_path(path) {
        return Err("Refusing to remove a path outside the OG managed install folder.".to_string());
    }

    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Could not remove install folder: {error}"))
    } else {
        fs::remove_file(path).map_err(|error| format!("Could not remove install file: {error}"))
    }
}

pub fn read_og_managed_version(install_path: &Path) -> Option<String> {
    read_og_managed_manifest(install_path).and_then(|manifest| {
        let version = manifest.version.trim().to_string();
        (!version.is_empty()).then_some(version)
    })
}

pub fn read_og_managed_manifest(install_path: &Path) -> Option<OgManagedManifest> {
    let manifest_path = install_path.join(OG_MANAGED_MANIFEST_FILE);
    let contents = fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str::<OgManagedManifest>(&contents).ok()
}

pub fn og_managed_manifest_trust_status(
    install_path: Option<&Path>,
    manifest: Option<&OgManagedManifest>,
) -> OgManifestTrustStatus {
    let Some(manifest) = manifest else {
        return OgManifestTrustStatus::Missing;
    };
    if !manifest_has_signature(manifest) {
        return OgManifestTrustStatus::Unsigned;
    }
    match install_path {
        Some(install_path) => verify_og_managed_manifest_signature(install_path, manifest)
            .map(|_| OgManifestTrustStatus::Signed)
            .unwrap_or(OgManifestTrustStatus::Invalid),
        None => OgManifestTrustStatus::Invalid,
    }
}

pub fn manifest_has_signature(manifest: &OgManagedManifest) -> bool {
    manifest
        .manifest_signature
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
}

pub fn verify_og_managed_manifest_signature(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    let Some(signature_text) = manifest
        .manifest_signature
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let verifying_key = og_manifest_verifying_key().ok_or_else(|| {
        "Signed OG manifest requires OGL_INSTALL_MANIFEST_VERIFYING_KEY.".to_string()
    })?;
    verify_og_managed_manifest_signature_with_key(
        install_path,
        manifest,
        signature_text,
        &verifying_key,
    )
}

fn verify_og_managed_manifest_signature_with_key(
    install_path: &Path,
    manifest: &OgManagedManifest,
    signature_text: &str,
    verifying_key: &VerifyingKey,
) -> Result<(), String> {
    let signature = parse_signature(signature_text)
        .ok_or_else(|| "OG manifest signature is not valid base64url or hex.".to_string())?;
    let signing_input = og_managed_manifest_signing_input(install_path, manifest)?;
    verifying_key
        .verify(signing_input.as_bytes(), &signature)
        .map_err(|_| "OG manifest signature check failed.".to_string())
}

fn og_managed_manifest_signing_input(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<String, String> {
    let payload = OgManagedManifestSigningPayload {
        format_version: manifest.format_version,
        game_id: manifest.game_id.as_str(),
        title: manifest.title.as_str(),
        version: manifest.version.as_str(),
        managed_by: manifest.managed_by.as_str(),
        manifest_key_id: manifest.manifest_key_id.as_deref(),
        download_url: manifest.download_url.as_deref(),
        download_sha256: manifest.download_sha256.as_deref(),
        package_file: manifest.package_file.as_deref(),
        files: &manifest.files,
        executable_path: manifest.executable_path.as_deref(),
        package_sha256: manifest
            .package_file
            .as_deref()
            .and_then(|path| og_manifest_path_for_entry(install_path, path))
            .and_then(|path| sha256_file_hex(&path).ok()),
    };
    let payload_bytes = serde_json::to_vec(&payload)
        .map_err(|error| format!("Could not encode OG manifest signing payload: {error}"))?;
    Ok(format!(
        "{}.{}",
        OG_MANAGED_MANIFEST_SIGNATURE_PREFIX,
        URL_SAFE_NO_PAD.encode(payload_bytes)
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OgManagedManifestSigningPayload<'a> {
    format_version: u32,
    game_id: &'a str,
    title: &'a str,
    version: &'a str,
    managed_by: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    manifest_key_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    download_url: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    download_sha256: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_file: Option<&'a str>,
    files: &'a [OgManagedManifestFile],
    #[serde(skip_serializing_if = "Option::is_none")]
    executable_path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_sha256: Option<String>,
}

fn og_manifest_verifying_key() -> Option<VerifyingKey> {
    std::env::var(OG_MANIFEST_VERIFYING_KEY_ENV)
        .ok()
        .and_then(|value| clean_manifest_key_text(&value))
        .or_else(|| option_env!("OGL_INSTALL_MANIFEST_VERIFYING_KEY").map(ToString::to_string))
        .and_then(|value| parse_verifying_key(&value))
}

fn sign_og_managed_manifest_if_configured(
    install_path: &Path,
    manifest: &mut OgManagedManifest,
) -> Result<(), String> {
    if manifest_has_signature(manifest) {
        return Ok(());
    }

    let Some(signing_key) = og_manifest_signing_key()? else {
        return Ok(());
    };
    let key_id = og_manifest_key_id();
    sign_og_managed_manifest_with_key(install_path, manifest, &signing_key, key_id.as_deref())
}

fn sign_og_managed_manifest_with_key(
    install_path: &Path,
    manifest: &mut OgManagedManifest,
    signing_key: &SigningKey,
    key_id: Option<&str>,
) -> Result<(), String> {
    if let Some(key_id) = key_id.map(str::trim).filter(|value| !value.is_empty()) {
        manifest.manifest_key_id = Some(key_id.chars().take(120).collect());
    }

    let signing_input = og_managed_manifest_signing_input(install_path, manifest)?;
    let signature = signing_key.sign(signing_input.as_bytes());
    manifest.manifest_signature = Some(URL_SAFE_NO_PAD.encode(signature.to_bytes()));
    Ok(())
}

fn og_manifest_signing_key() -> Result<Option<SigningKey>, String> {
    let Some(value) = std::env::var(OG_MANIFEST_SIGNING_KEY_ENV)
        .ok()
        .and_then(|value| clean_manifest_key_text(&value))
        .or_else(|| option_env!("OGL_INSTALL_MANIFEST_SIGNING_KEY").map(ToString::to_string))
    else {
        return Ok(None);
    };

    let bytes = parse_base64url_or_hex(&value, 32).ok_or_else(|| {
        format!(
            "{OG_MANIFEST_SIGNING_KEY_ENV} must be a base64url or hex encoded 32-byte Ed25519 signing key seed."
        )
    })?;
    let key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| format!("{OG_MANIFEST_SIGNING_KEY_ENV} must decode to exactly 32 bytes."))?;
    Ok(Some(SigningKey::from_bytes(&key_bytes)))
}

fn og_manifest_key_id() -> Option<String> {
    std::env::var(OG_MANIFEST_KEY_ID_ENV)
        .ok()
        .and_then(|value| clean_manifest_key_text(&value))
        .or_else(|| option_env!("OGL_INSTALL_MANIFEST_KEY_ID").map(ToString::to_string))
        .map(|value| value.chars().take(120).collect())
}

fn clean_manifest_key_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty() && trimmed.len() <= 4096).then(|| trimmed.to_string())
}

fn parse_verifying_key(value: &str) -> Option<VerifyingKey> {
    let bytes = parse_base64url_or_hex(value, 32)?;
    let key_bytes: [u8; 32] = bytes.try_into().ok()?;
    VerifyingKey::from_bytes(&key_bytes).ok()
}

fn parse_signature(value: &str) -> Option<Signature> {
    let bytes = parse_base64url_or_hex(value, 64)?;
    Signature::from_slice(&bytes).ok()
}

fn parse_base64url_or_hex(value: &str, expected_len: usize) -> Option<Vec<u8>> {
    let trimmed = value.trim();
    URL_SAFE_NO_PAD
        .decode(trimmed.as_bytes())
        .ok()
        .filter(|bytes| bytes.len() == expected_len)
        .or_else(|| hex_decode(trimmed).filter(|bytes| bytes.len() == expected_len))
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    let value = value.trim();
    if !value.len().is_multiple_of(2) {
        return None;
    }

    value
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let high = hex_value(chunk[0])?;
            let low = hex_value(chunk[1])?;
            Some((high << 4) | low)
        })
        .collect()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
pub fn write_og_managed_manifest(
    install_path: &Path,
    game_id: &str,
    title: &str,
    version: &str,
) -> Result<(), String> {
    let files = collect_og_manifest_files(install_path)?;
    let executable_path = find_launch_executable(install_path, title)
        .as_deref()
        .and_then(|path| og_manifest_relative_path(install_path, path));
    let manifest = OgManagedManifest {
        game_id: game_id.to_string(),
        title: title.to_string(),
        version: version.to_string(),
        managed_by: "OG-Launcher".to_string(),
        files,
        executable_path,
        updated_at: Some(unix_timestamp_to_iso(current_unix_timestamp())),
        ..Default::default()
    };
    write_og_managed_manifest_details(install_path, &manifest)
}

pub fn write_og_managed_manifest_details(
    install_path: &Path,
    manifest: &OgManagedManifest,
) -> Result<(), String> {
    let manifest_path = install_path.join(OG_MANAGED_MANIFEST_FILE);
    let mut manifest = manifest.clone();
    if !manifest_has_signature(&manifest) && manifest.managed_by.trim().is_empty() {
        manifest.managed_by = "OG-Launcher".to_string();
    }
    if manifest.updated_at.is_none() {
        manifest.updated_at = Some(unix_timestamp_to_iso(current_unix_timestamp()));
    }
    sign_og_managed_manifest_if_configured(install_path, &mut manifest)?;

    let contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize update manifest: {error}"))?;
    fs::write(manifest_path, contents)
        .map_err(|error| format!("Could not write update manifest: {error}"))
}

pub fn is_zip_package(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
}

pub fn og_manifest_path_for_entry(install_path: &Path, relative_path: &str) -> Option<PathBuf> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return None;
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return None;
    }

    Some(install_path.join(relative))
}

pub fn og_manifest_relative_path(install_path: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(install_path).ok()?;
    if relative.as_os_str().is_empty() {
        return None;
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return None;
    }

    Some(
        relative
            .components()
            .filter_map(|component| match component {
                Component::Normal(value) => Some(value.to_string_lossy().to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/"),
    )
    .filter(|path| !path.trim().is_empty())
}

pub fn og_manifest_file_for_path(
    install_path: &Path,
    path: &Path,
) -> Option<OgManagedManifestFile> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    Some(OgManagedManifestFile {
        path: og_manifest_relative_path(install_path, path)?,
        size_bytes: Some(metadata.len()),
        sha256: sha256_file_hex(path).ok(),
    })
}

pub fn sha256_file_hex(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open file for SHA-256: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read file for SHA-256: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
fn collect_og_manifest_files(install_path: &Path) -> Result<Vec<OgManagedManifestFile>, String> {
    fn visit(
        install_path: &Path,
        current_path: &Path,
        files: &mut Vec<OgManagedManifestFile>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(current_path)
            .map_err(|error| format!("Could not read install folder for manifest: {error}"))?;

        for entry in entries {
            let entry =
                entry.map_err(|error| format!("Could not read install folder entry: {error}"))?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Could not inspect install folder entry: {error}"))?;

            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                visit(install_path, &path, files)?;
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let Some(file) = og_manifest_file_for_path(install_path, &path) else {
                continue;
            };
            if file.path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
                continue;
            }
            files.push(file);
        }

        Ok(())
    }

    let mut files = Vec::new();
    if install_path.exists() {
        visit(install_path, install_path, &mut files)?;
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

pub fn extract_og_zip_package<F>(
    package_path: &Path,
    install_path: &Path,
    on_file: F,
) -> Result<Vec<OgManagedManifestFile>, String>
where
    F: FnMut(usize, usize),
{
    extract_og_zip_package_with_limits(
        package_path,
        install_path,
        on_file,
        MAX_GAME_ARCHIVE_ENTRIES,
        MAX_EXTRACTED_GAME_BYTES,
    )
}

fn extract_og_zip_package_with_limits<F>(
    package_path: &Path,
    install_path: &Path,
    mut on_file: F,
    max_entries: usize,
    max_uncompressed_bytes: u64,
) -> Result<Vec<OgManagedManifestFile>, String>
where
    F: FnMut(usize, usize),
{
    let file = fs::File::open(package_path)
        .map_err(|error| format!("Could not open downloaded ZIP package: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Could not read ZIP package: {error}"))?;
    if archive.len() > max_entries {
        return Err(format!(
            "ZIP package entry limit exceeded: archive has {} entries, maximum is {max_entries}.",
            archive.len()
        ));
    }
    let total = archive.len().max(1);
    let mut files = Vec::new();
    let mut extracted_bytes = 0_u64;
    let mut created_files = Vec::<PathBuf>::new();

    let extraction_result = (|| -> Result<(), String> {
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| format!("Could not read ZIP entry: {error}"))?;

            if entry.is_symlink() {
                return Err("ZIP packages with symbolic links are not supported.".to_string());
            }

            let Some(relative_path) = entry.enclosed_name() else {
                return Err("ZIP package contains an unsafe path.".to_string());
            };
            if relative_path
                .to_string_lossy()
                .replace('\\', "/")
                .eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE)
            {
                // The launcher writes the verified/generated manifest only after
                // package validation. Never let an archive pre-place that trust file.
                on_file(index + 1, total);
                continue;
            }
            let outpath = install_path.join(relative_path);
            ensure_path_inside_root(&outpath, install_path)
                .map_err(|_| "ZIP package contains an unsafe path.".to_string())?;

            if entry.is_dir() {
                fs::create_dir_all(&outpath)
                    .map_err(|error| format!("Could not create ZIP directory: {error}"))?;
                on_file(index + 1, total);
                continue;
            }

            let remaining = max_uncompressed_bytes.saturating_sub(extracted_bytes);
            if entry.size() > remaining {
                return Err(format!(
                    "ZIP package uncompressed size limit exceeded: maximum is {max_uncompressed_bytes} bytes."
                ));
            }

            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create ZIP output folder: {error}"))?;
            }

            let mut outfile = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&outpath)
                .map_err(|error| {
                    if error.kind() == io::ErrorKind::AlreadyExists {
                        format!(
                            "Refusing to extract ZIP file because '{}' already exists.",
                            outpath.display()
                        )
                    } else {
                        format!("Could not write extracted ZIP file: {error}")
                    }
                })?;
            created_files.push(outpath.clone());
            let copied = {
                let mut limited_entry = (&mut entry).take(remaining.saturating_add(1));
                io::copy(&mut limited_entry, &mut outfile)
            };
            let copied = match copied {
                Ok(copied) => copied,
                Err(error) => {
                    drop(outfile);
                    let _ = fs::remove_file(&outpath);
                    return Err(format!("Could not extract ZIP file: {error}"));
                }
            };
            if copied > remaining {
                drop(outfile);
                let _ = fs::remove_file(&outpath);
                return Err(format!(
                    "ZIP package uncompressed size limit exceeded: maximum is {max_uncompressed_bytes} bytes."
                ));
            }
            extracted_bytes += copied;

            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode & 0o777));
            }

            if let Some(file) = og_manifest_file_for_path(install_path, &outpath) {
                if file.path.eq_ignore_ascii_case(OG_MANAGED_MANIFEST_FILE) {
                    on_file(index + 1, total);
                    continue;
                }
                files.push(file);
            }
            on_file(index + 1, total);
        }
        Ok(())
    })();

    if let Err(error) = extraction_result {
        for path in created_files.iter().rev() {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }

    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ogl-{name}-{}-{}",
            std::process::id(),
            current_unix_timestamp()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_test_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        for (name, contents) in entries {
            archive
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(contents).unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn game_zip_extraction_rejects_entry_and_uncompressed_size_bombs() {
        let root = unique_temp_dir("game-zip-limits");
        let archive = root.join("game.zip");
        let target = root.join("install");
        fs::create_dir_all(&target).unwrap();
        write_test_zip(&archive, &[("one.bin", b"12345"), ("two.bin", b"67890")]);

        let entry_error =
            extract_og_zip_package_with_limits(&archive, &target, |_, _| {}, 1, 100).unwrap_err();
        assert!(entry_error.contains("entry limit"));

        let byte_error =
            extract_og_zip_package_with_limits(&archive, &target, |_, _| {}, 10, 6).unwrap_err();
        assert!(byte_error.contains("uncompressed size limit"));
        assert!(!target.join("one.bin").exists());
        assert!(!target.join("two.bin").exists());

        fs::write(target.join("one.bin"), b"user-owned").unwrap();
        let overwrite_error =
            extract_og_zip_package_with_limits(&archive, &target, |_, _| {}, 10, 100).unwrap_err();
        assert!(overwrite_error.contains("already exists"));
        assert_eq!(fs::read(target.join("one.bin")).unwrap(), b"user-owned");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn game_zip_never_preplaces_the_launcher_trust_manifest() {
        let root = unique_temp_dir("game-zip-manifest");
        let archive = root.join("game.zip");
        let target = root.join("install");
        fs::create_dir_all(&target).unwrap();
        write_test_zip(
            &archive,
            &[
                (OG_MANAGED_MANIFEST_FILE, b"untrusted"),
                ("game.exe", b"binary"),
            ],
        );

        let files =
            extract_og_zip_package_with_limits(&archive, &target, |_, _| {}, 10, 100).unwrap();

        assert!(!target.join(OG_MANAGED_MANIFEST_FILE).exists());
        assert!(target.join("game.exe").exists());
        assert_eq!(files.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn managed_games_root_is_not_a_single_install_path() {
        let games_root = open_game_launcher_data_dir().unwrap().join("games");

        assert!(!is_og_managed_install_path(&games_root));
    }

    #[test]
    fn og_manifest_file_for_path_records_sha256() {
        let root = unique_temp_dir("manifest-hash");
        let file_path = root.join("game.bin");
        fs::write(&file_path, b"abc").unwrap();

        let manifest_file = og_manifest_file_for_path(&root, &file_path).unwrap();

        assert_eq!(manifest_file.path, "game.bin");
        assert_eq!(manifest_file.size_bytes, Some(3));
        assert_eq!(
            manifest_file.sha256.as_deref(),
            Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_og_managed_manifest_records_install_files_with_hashes() {
        let root = unique_temp_dir("managed-manifest");
        fs::create_dir_all(root.join("bin")).unwrap();
        let executable_name = if cfg!(target_os = "windows") {
            "game.exe"
        } else {
            "game"
        };
        let executable_path = root.join("bin").join(executable_name);
        fs::write(&executable_path, b"abc").unwrap();
        #[cfg(unix)]
        fs::set_permissions(&executable_path, fs::Permissions::from_mode(0o755)).unwrap();

        write_og_managed_manifest(&root, "game-1", "Game", "1.0.0").unwrap();
        let manifest = read_og_managed_manifest(&root).unwrap();
        let expected_relative = format!("bin/{executable_name}");

        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].path, expected_relative);
        assert_eq!(
            manifest.files[0].sha256.as_deref(),
            Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        );
        assert_eq!(
            manifest.executable_path.as_deref(),
            Some(expected_relative.as_str())
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn og_managed_manifest_signature_accepts_valid_signature() {
        let root = unique_temp_dir("managed-manifest-signed");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[7; 32]);
        let mut manifest = OgManagedManifest {
            game_id: "game-1".to_string(),
            title: "Game".to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            files: vec![og_manifest_file_for_path(&root, &root.join("game.bin")).unwrap()],
            ..Default::default()
        };
        let signing_input = og_managed_manifest_signing_input(&root, &manifest).unwrap();
        let signature = signing_key.sign(signing_input.as_bytes());
        manifest.manifest_signature = Some(URL_SAFE_NO_PAD.encode(signature.to_bytes()));

        let result = verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        );

        assert!(result.is_ok());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn og_managed_manifest_signature_rejects_tampered_manifest() {
        let root = unique_temp_dir("managed-manifest-tampered");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[9; 32]);
        let mut manifest = OgManagedManifest {
            game_id: "game-1".to_string(),
            title: "Game".to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            files: vec![og_manifest_file_for_path(&root, &root.join("game.bin")).unwrap()],
            ..Default::default()
        };
        let signing_input = og_managed_manifest_signing_input(&root, &manifest).unwrap();
        let signature = signing_key.sign(signing_input.as_bytes());
        manifest.manifest_signature = Some(URL_SAFE_NO_PAD.encode(signature.to_bytes()));
        manifest.version = "2.0.0".to_string();

        let error = verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        )
        .unwrap_err();

        assert!(error.contains("signature check failed"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn signs_manifest_with_key_id_bound_to_signature() {
        let root = unique_temp_dir("managed-manifest-key-id");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[13; 32]);
        let mut manifest = OgManagedManifest {
            game_id: "game-1".to_string(),
            title: "Game".to_string(),
            version: "1.0.0".to_string(),
            managed_by: "OG-Launcher".to_string(),
            files: vec![og_manifest_file_for_path(&root, &root.join("game.bin")).unwrap()],
            ..Default::default()
        };

        sign_og_managed_manifest_with_key(
            &root,
            &mut manifest,
            &signing_key,
            Some("provider-release-2026q2"),
        )
        .unwrap();

        assert_eq!(
            manifest.manifest_key_id.as_deref(),
            Some("provider-release-2026q2")
        );
        assert!(manifest_has_signature(&manifest));
        assert!(verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        )
        .is_ok());

        manifest.manifest_key_id = Some("other-key".to_string());
        let error = verify_og_managed_manifest_signature_with_key(
            &root,
            &manifest,
            manifest.manifest_signature.as_deref().unwrap(),
            &signing_key.verifying_key(),
        )
        .unwrap_err();
        assert!(error.contains("signature check failed"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn write_manifest_uses_configured_signing_key() {
        let _guard = manifest_env_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let root = unique_temp_dir("managed-manifest-env-signed");
        fs::write(root.join("game.bin"), b"abc").unwrap();
        let signing_key = SigningKey::from_bytes(&[17; 32]);
        let signing_key_text = URL_SAFE_NO_PAD.encode(signing_key.to_bytes());
        let verifying_key_text = URL_SAFE_NO_PAD.encode(signing_key.verifying_key().to_bytes());
        std::env::set_var(OG_MANIFEST_SIGNING_KEY_ENV, signing_key_text);
        std::env::set_var(OG_MANIFEST_VERIFYING_KEY_ENV, verifying_key_text);
        std::env::set_var(OG_MANIFEST_KEY_ID_ENV, "provider-release-env");

        write_og_managed_manifest(&root, "game-1", "Game", "1.0.0").unwrap();
        let manifest = read_og_managed_manifest(&root).unwrap();

        assert_eq!(
            manifest.manifest_key_id.as_deref(),
            Some("provider-release-env")
        );
        assert!(manifest_has_signature(&manifest));
        assert_eq!(
            og_managed_manifest_trust_status(Some(&root), Some(&manifest)),
            OgManifestTrustStatus::Signed
        );

        std::env::remove_var(OG_MANIFEST_SIGNING_KEY_ENV);
        std::env::remove_var(OG_MANIFEST_VERIFYING_KEY_ENV);
        std::env::remove_var(OG_MANIFEST_KEY_ID_ENV);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn parses_manifest_verifying_keys_from_base64url_and_hex() {
        let signing_key = SigningKey::from_bytes(&[11; 32]);
        let verifying_key = signing_key.verifying_key();
        let key_bytes = verifying_key.to_bytes();
        let base64_key = URL_SAFE_NO_PAD.encode(key_bytes);
        let hex_key = key_bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();

        assert_eq!(
            parse_verifying_key(&base64_key).unwrap().to_bytes(),
            key_bytes
        );
        assert_eq!(parse_verifying_key(&hex_key).unwrap().to_bytes(), key_bytes);
    }
}
