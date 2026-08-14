//! Deep module: safe file mirroring into a controlled root.
//!
//! Owns the three things every "copy a save file somewhere" flow needs:
//! containment checks, symlink rejection, and post-copy hash verification.
//! Both `games::sync::sync_game_saves` (the live per-game save-cache path)
//! and `cross_store_save::apply_cross_store_save_copy` place files through
//! this module, so the weak live path inherits the hardened behaviour that
//! the cross-store flow already proved instead of re-implementing it.

use std::{fs, path::Path};

use super::games::sha256_file_hex;

/// Reject any symlink among the components of `path` below `root`.
///
/// `path` must already be inside `root` (lexically); each component is
/// checked with `symlink_metadata` so a link anywhere in the chain is
/// refused. Components that do not exist yet are fine to create.
pub fn reject_symlink_components(root: &Path, path: &Path, label: &str) -> Result<(), String> {
    let relative = path.strip_prefix(root).map_err(|_| {
        format!(
            "Path {label} is not inside the allowed root: {}",
            path.display()
        )
    })?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err(format!(
                        "Path {label} contains a symlink component: {}",
                        current.display()
                    ));
                }
            }
            Err(_) => break, // component does not exist yet; nothing to reject
        }
    }
    Ok(())
}

/// Reject a symlink at the final component of `path`.
pub fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    if fs::symlink_metadata(path)
        .map_err(|error| format!("Could not inspect {label}: {error}"))?
        .file_type()
        .is_symlink()
    {
        return Err(format!("{label} must not be a symlink: {}", path.display()));
    }
    Ok(())
}

/// Copy a single file from `source` to `destination`.
///
/// `destination` must live inside `destination_root`; both sides are
/// checked for symlinks. When expectations are supplied, the copied file
/// is verified against them (SHA-256 and/or size), so a silently truncated
/// or corrupted copy is detected instead of being trusted.
///
/// Returns the size in bytes of the copied file.
pub fn mirror_file(
    source: &Path,
    destination: &Path,
    destination_root: &Path,
    expected_sha256: Option<&str>,
    expected_size: Option<u64>,
) -> Result<u64, String> {
    reject_symlink(source, "source file")?;
    reject_symlink_components(destination_root, destination, "destination path")?;
    if let Ok(metadata) = fs::symlink_metadata(destination) {
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Destination must not be a symlink: {}",
                destination.display()
            ));
        }
    }
    if let Some(parent) = destination.parent() {
        reject_symlink_components(destination_root, parent, "destination parent")?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create destination folder: {error}"))?;
    }
    fs::copy(source, destination).map_err(|error| format!("Could not copy file: {error}"))?;

    let copied_sha256 = sha256_file_hex(destination)?;
    if let Some(expected) = expected_sha256 {
        if !copied_sha256.eq_ignore_ascii_case(expected) {
            return Err(format!(
                "Post-copy SHA-256 mismatch for {}.",
                destination.display()
            ));
        }
    }
    let copied_size = fs::metadata(destination)
        .map_err(|error| format!("Could not inspect copied file: {error}"))?
        .len();
    if let Some(expected_size) = expected_size {
        if copied_size != expected_size {
            return Err(format!(
                "Post-copy size mismatch for {}.",
                destination.display()
            ));
        }
    }
    Ok(copied_size)
}

/// Recursively copy a directory tree into `destination_root`, verifying
/// every file against its source hash after copying.
pub fn mirror_dir_recursive(
    source: &Path,
    destination: &Path,
    destination_root: &Path,
) -> Result<(), String> {
    reject_symlink(source, "source folder")?;
    reject_symlink_components(destination_root, destination, "destination folder")?;
    fs::create_dir_all(destination)
        .map_err(|error| format!("Could not create destination folder: {error}"))?;

    let entries =
        fs::read_dir(source).map_err(|error| format!("Could not read source folder: {error}"))?;
    for entry in entries.flatten() {
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            mirror_dir_recursive(&source_path, &destination_path, destination_root)?;
        } else {
            let source_sha256 = sha256_file_hex(&source_path)?;
            mirror_file(
                &source_path,
                &destination_path,
                destination_root,
                Some(&source_sha256),
                None,
            )?;
        }
    }
    Ok(())
}

/// Remove `path` (file or directory) only if it lives inside `root`.
pub fn clear_path(path: &Path, root: &Path) -> Result<(), String> {
    reject_symlink_components(root, path, "path to clear")?;
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| format!("Could not clear folder: {error}"))
    } else if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Could not clear file: {error}"))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_test_dir(label: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("ogl-save-mirror-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn mirror_file_copies_and_verifies_hash_and_size() {
        let root = temp_test_dir("copy");
        let source = root.join("source.sav");
        let target = root.join("cache").join("source.sav");
        fs::write(&source, b"save-data-123").unwrap();

        let size = mirror_file(&source, &target, &root, None, None).unwrap();
        assert_eq!(size, 13);
        assert_eq!(fs::read(&target).unwrap(), b"save-data-123");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn mirror_file_detects_size_mismatch() {
        let root = temp_test_dir("size");
        let source = root.join("source.sav");
        let target = root.join("target.sav");
        fs::write(&source, b"save-data-123").unwrap();

        let error = mirror_file(&source, &target, &root, None, Some(99)).unwrap_err();
        assert!(error.contains("Post-copy size mismatch"), "{error}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn mirror_file_detects_hash_mismatch() {
        let root = temp_test_dir("hash");
        let source = root.join("source.sav");
        let target = root.join("target.sav");
        fs::write(&source, b"save-data-123").unwrap();

        let error = mirror_file(
            &source,
            &target,
            &root,
            Some("0000000000000000000000000000000000000000000000000000000000000000"),
            None,
        )
        .unwrap_err();
        assert!(error.contains("Post-copy SHA-256 mismatch"), "{error}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn mirror_file_rejects_symlink_destination() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let root = temp_test_dir("destlink");
            let source = root.join("source.sav");
            let real = root.join("real.sav");
            let target = root.join("link.sav");
            fs::write(&source, b"save-data").unwrap();
            fs::write(&real, b"real-data").unwrap();
            symlink(&real, &target).unwrap();

            let error = mirror_file(&source, &target, &root, None, None).unwrap_err();
            assert!(
                error.contains("must not be a symlink") || error.contains("symlink"),
                "{error}"
            );
            let _ = fs::remove_dir_all(&root);
        }
    }

    #[test]
    fn mirror_file_rejects_destination_outside_root() {
        let root = temp_test_dir("outside");
        let outside = root
            .parent()
            .unwrap()
            .join(format!("outside-{}", std::process::id()));
        let source = root.join("source.sav");
        let target = outside.join("target.sav");
        fs::write(&source, b"save-data").unwrap();

        let error = mirror_file(&source, &target, &root, None, None).unwrap_err();
        assert!(error.contains("not inside the allowed root"), "{error}");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn mirror_dir_recursive_copies_tree_and_verifies() {
        let root = temp_test_dir("tree");
        let source = root.join("saves");
        let target = root.join("cache").join("saves");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("a.sav"), b"aaa").unwrap();
        fs::write(source.join("nested").join("b.sav"), b"bbbb").unwrap();

        mirror_dir_recursive(&source, &target, &root).unwrap();
        assert_eq!(fs::read(target.join("a.sav")).unwrap(), b"aaa");
        assert_eq!(
            fs::read(target.join("nested").join("b.sav")).unwrap(),
            b"bbbb"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn clear_path_removes_file_and_refuses_outside_root() {
        let root = temp_test_dir("clear");
        let file = root.join("a.sav");
        fs::write(&file, b"data").unwrap();
        clear_path(&file, &root).unwrap();
        assert!(!file.exists());

        let outside = root
            .parent()
            .unwrap()
            .join(format!("clear-outside-{}", std::process::id()));
        let error = clear_path(&outside, &root).unwrap_err();
        assert!(error.contains("not inside the allowed root"), "{error}");
        let _ = fs::remove_dir_all(&root);
    }
}
