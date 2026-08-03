use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SCHEMA_VERSION: i64 = 2;

fn is_cloud_sync_kind(kind: &str) -> bool {
    matches!(kind, "games" | "downloads")
}

pub fn read_collection<T>(kind: &str) -> Result<Vec<T>, String>
where
    T: DeserializeOwned,
{
    let conn = open_connection()?;
    read_collection_with_connection(&conn, kind)
}

fn read_collection_with_connection<T>(conn: &Connection, kind: &str) -> Result<Vec<T>, String>
where
    T: DeserializeOwned,
{
    let mut statement = conn
        .prepare(
            "SELECT json FROM local_entities
             WHERE kind = ?1 AND deleted_at IS NULL
             ORDER BY updated_at ASC, id ASC",
        )
        .map_err(|error| format!("Could not prepare local DB collection read: {error}"))?;
    let rows = statement
        .query_map(params![kind], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Could not read local DB collection: {error}"))?;

    let mut items = Vec::new();
    for row in rows {
        let json = row.map_err(|error| format!("Could not read local DB row: {error}"))?;
        let item = serde_json::from_str::<T>(&json)
            .map_err(|error| format!("Could not decode local DB {kind} row: {error}"))?;
        items.push(item);
    }

    Ok(items)
}

pub fn read_item<T>(kind: &str, id: &str) -> Result<Option<T>, String>
where
    T: DeserializeOwned,
{
    let id = normalized_item_id(kind, id)?;
    let conn = open_connection()?;
    let json = conn
        .query_row(
            "SELECT json FROM local_entities
             WHERE kind = ?1 AND id = ?2 AND deleted_at IS NULL",
            params![kind, id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Could not read local DB {kind} item '{id}': {error}"))?;

    json.map(|json| {
        serde_json::from_str::<T>(&json)
            .map_err(|error| format!("Could not decode local DB {kind} item '{id}': {error}"))
    })
    .transpose()
}

pub fn upsert_item<T>(kind: &str, id: &str, item: &T) -> Result<(), String>
where
    T: Serialize,
{
    let id = normalized_item_id(kind, id)?;
    let json = serde_json::to_string(item)
        .map_err(|error| format!("Could not encode local DB {kind} item '{id}': {error}"))?;
    let conn = open_connection()?;
    upsert_serialized_item(&conn, kind, id, &json, now_unix_millis())
}

/// Replaces an authoritative collection snapshot and removes rows omitted from it.
/// Read-modify-write callers must use `mutate_collection` so their read occurs after
/// SQLite's writer lock has been acquired.
pub fn replace_collection<T, F>(kind: &str, items: &[T], id_fn: F) -> Result<(), String>
where
    T: Serialize,
    F: Fn(&T) -> &str,
{
    let mut conn = open_connection()?;
    replace_collection_with_connection(&mut conn, kind, items, id_fn)
}

fn replace_collection_with_connection<T, F>(
    conn: &mut Connection,
    kind: &str,
    items: &[T],
    id_fn: F,
) -> Result<(), String>
where
    T: Serialize,
    F: Fn(&T) -> &str,
{
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start local DB {kind} replacement: {error}"))?;
    reconcile_collection_rows(&tx, kind, items, id_fn)?;
    tx.commit()
        .map_err(|error| format!("Could not commit local DB {kind} replacement: {error}"))
}

/// Runs a collection read-modify-write under one `BEGIN IMMEDIATE` transaction.
/// Concurrent callers therefore read the latest committed rows in writer order,
/// and omitted rows are removed only from the snapshot the mutator actually read.
pub fn mutate_collection<T, R, I, F>(kind: &str, id_fn: I, mutate: F) -> Result<R, String>
where
    T: DeserializeOwned + Serialize,
    I: Fn(&T) -> &str,
    F: FnOnce(&mut Vec<T>) -> Result<R, String>,
{
    let mut conn = open_connection()?;
    mutate_collection_with_connection(&mut conn, kind, id_fn, mutate)
}

fn mutate_collection_with_connection<T, R, I, F>(
    conn: &mut Connection,
    kind: &str,
    id_fn: I,
    mutate: F,
) -> Result<R, String>
where
    T: DeserializeOwned + Serialize,
    I: Fn(&T) -> &str,
    F: FnOnce(&mut Vec<T>) -> Result<R, String>,
{
    // The writer lock must be acquired before the read. Otherwise two callers can
    // both build stale snapshots and whichever replaces the collection last wins.
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start local DB {kind} mutation: {error}"))?;
    let mut items = read_collection_with_connection(&tx, kind)?;
    let result = mutate(&mut items)?;
    reconcile_collection_rows(&tx, kind, &items, id_fn)?;
    tx.commit()
        .map_err(|error| format!("Could not commit local DB {kind} mutation: {error}"))?;
    Ok(result)
}

fn reconcile_collection_rows<T, F>(
    conn: &Connection,
    kind: &str,
    items: &[T],
    id_fn: F,
) -> Result<(), String>
where
    T: Serialize,
    F: Fn(&T) -> &str,
{
    let mut desired = BTreeMap::<String, String>::new();
    for item in items {
        let id = id_fn(item).trim();
        if id.is_empty() {
            continue;
        }
        let json = serde_json::to_string(item)
            .map_err(|error| format!("Could not encode local DB {kind} row: {error}"))?;
        // Preserve the previous collection writer's last-duplicate-wins behavior.
        desired.insert(id.to_string(), json);
    }

    let existing = {
        let mut statement = conn
            .prepare(
                "SELECT id, json FROM local_entities
                 WHERE kind = ?1 AND deleted_at IS NULL",
            )
            .map_err(|error| {
                format!("Could not prepare local DB {kind} reconciliation: {error}")
            })?;
        let rows = statement
            .query_map(params![kind], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| {
                format!("Could not read local DB {kind} reconciliation rows: {error}")
            })?;
        let mut existing = HashMap::new();
        for row in rows {
            let (id, json) = row.map_err(|error| {
                format!("Could not read local DB {kind} reconciliation row: {error}")
            })?;
            existing.insert(id, json);
        }
        existing
    };

    let now = now_unix_millis();
    for (id, json) in &desired {
        if existing.get(id) == Some(json) {
            continue;
        }
        upsert_serialized_item(conn, kind, id, json, now)?;
    }

    for id in existing.keys().filter(|id| !desired.contains_key(*id)) {
        tombstone_or_delete_item_with_connection(conn, kind, id, None).map_err(|error| {
            format!("Could not delete stale local DB {kind} item '{id}': {error}")
        })?;
    }

    Ok(())
}

fn upsert_serialized_item(
    conn: &Connection,
    kind: &str,
    id: &str,
    json: &str,
    updated_at: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO local_entities
           (kind, id, json, updated_at, dirty, sync_status, deleted_at)
         VALUES (?1, ?2, ?3, ?4, 1, 'pending', NULL)
         ON CONFLICT(kind, id) DO UPDATE SET
           json = excluded.json,
           updated_at = MAX(excluded.updated_at, local_entities.updated_at + 1),
           dirty = 1,
           sync_status = 'pending',
           last_synced_at = NULL,
           deleted_at = NULL",
        params![kind, id, json, updated_at],
    )
    .map_err(|error| format!("Could not write local DB {kind} item '{id}': {error}"))?;
    Ok(())
}

fn normalized_item_id<'a>(kind: &str, id: &'a str) -> Result<&'a str, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err(format!(
            "Could not access local DB {kind} item with an empty ID."
        ));
    }
    Ok(id)
}

pub fn update_item<T, F>(kind: &str, id: &str, update: F) -> Result<T, String>
where
    T: DeserializeOwned + Serialize,
    F: FnOnce(&mut T) -> Result<(), String>,
{
    let id = id.trim();
    if id.is_empty() {
        return Err(format!(
            "Could not update local DB {kind} item with an empty ID."
        ));
    }

    let mut conn = open_connection()?;
    update_item_with_connection(&mut conn, kind, id, update)
}

fn update_item_with_connection<T, F>(
    conn: &mut Connection,
    kind: &str,
    id: &str,
    update: F,
) -> Result<T, String>
where
    T: DeserializeOwned + Serialize,
    F: FnOnce(&mut T) -> Result<(), String>,
{
    // Acquire the SQLite writer lock before reading. The mutation therefore always
    // starts from the latest committed row instead of a stale collection snapshot.
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start local DB {kind} item transaction: {error}"))?;
    let json = tx
        .query_row(
            "SELECT json FROM local_entities
             WHERE kind = ?1 AND id = ?2 AND deleted_at IS NULL",
            params![kind, id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Could not read local DB {kind} item '{id}': {error}"))?
        .ok_or_else(|| format!("Local DB {kind} item '{id}' was not found."))?;
    let mut item = serde_json::from_str::<T>(&json)
        .map_err(|error| format!("Could not decode local DB {kind} item '{id}': {error}"))?;

    update(&mut item)?;

    let json = serde_json::to_string(&item)
        .map_err(|error| format!("Could not encode local DB {kind} item '{id}': {error}"))?;
    let changed = tx
        .execute(
            "UPDATE local_entities
             SET json = ?3, updated_at = MAX(?4, updated_at + 1), dirty = 1,
                 sync_status = 'pending', last_synced_at = NULL, deleted_at = NULL
             WHERE kind = ?1 AND id = ?2 AND deleted_at IS NULL",
            params![kind, id, json, now_unix_millis()],
        )
        .map_err(|error| format!("Could not write local DB {kind} item '{id}': {error}"))?;
    if changed != 1 {
        return Err(format!(
            "Could not write local DB {kind} item '{id}': row disappeared during update."
        ));
    }

    tx.commit()
        .map_err(|error| format!("Could not commit local DB {kind} item '{id}': {error}"))?;
    Ok(item)
}

pub fn remove_item(kind: &str, id: &str) -> Result<(), String> {
    let id = normalized_item_id(kind, id)?;
    let conn = open_connection()?;
    tombstone_or_delete_item_with_connection(&conn, kind, id, None)
        .map_err(|error| format!("Could not delete local DB {kind} item: {error}"))?;
    Ok(())
}

pub fn remove_item_if_unchanged<T>(kind: &str, id: &str, expected: &T) -> Result<bool, String>
where
    T: Serialize,
{
    let id = normalized_item_id(kind, id)?;
    let json = serde_json::to_string(expected)
        .map_err(|error| format!("Could not encode local DB {kind} item '{id}': {error}"))?;
    let conn = open_connection()?;
    let removed = tombstone_or_delete_item_with_connection(&conn, kind, id, Some(&json))
        .map_err(|error| format!("Could not conditionally delete local DB {kind} item: {error}"))?;
    Ok(removed == 1)
}

fn tombstone_or_delete_item_with_connection(
    conn: &Connection,
    kind: &str,
    id: &str,
    expected_json: Option<&str>,
) -> Result<usize, rusqlite::Error> {
    if !is_cloud_sync_kind(kind) {
        return match expected_json {
            Some(json) => conn.execute(
                "DELETE FROM local_entities
                 WHERE kind = ?1 AND id = ?2 AND json = ?3 AND deleted_at IS NULL",
                params![kind, id, json],
            ),
            None => conn.execute(
                "DELETE FROM local_entities WHERE kind = ?1 AND id = ?2",
                params![kind, id],
            ),
        };
    }

    let deleted_at = now_unix_millis();
    match expected_json {
        Some(json) => conn.execute(
            "UPDATE local_entities
             SET json = '{}', updated_at = MAX(?4, updated_at + 1), dirty = 1,
                 sync_status = 'pending', last_synced_at = NULL,
                 deleted_at = MAX(?4, updated_at + 1)
             WHERE kind = ?1 AND id = ?2 AND json = ?3 AND deleted_at IS NULL",
            params![kind, id, json, deleted_at],
        ),
        None => conn.execute(
            "INSERT INTO local_entities
               (kind, id, json, updated_at, dirty, sync_status, last_synced_at, deleted_at)
             VALUES (?1, ?2, '{}', ?3, 1, 'pending', NULL, ?3)
             ON CONFLICT(kind, id) DO UPDATE SET
               json = '{}',
               updated_at = MAX(excluded.updated_at, local_entities.updated_at + 1),
               dirty = 1,
               sync_status = 'pending', last_synced_at = NULL,
               deleted_at = MAX(excluded.deleted_at, local_entities.updated_at + 1)",
            params![kind, id, deleted_at],
        ),
    }
}

#[tauri::command]
pub fn get_pending_local_entities() -> Result<Vec<LocalEntityPayload>, String> {
    read_entities_for_sync(true)
}

#[tauri::command]
pub fn get_all_local_entities() -> Result<Vec<LocalEntityPayload>, String> {
    read_entities_for_sync(false)
}

#[tauri::command]
pub fn mark_local_entities_synced(entities: Vec<LocalEntityKey>) -> Result<(), String> {
    let mut conn = open_connection()?;
    mark_local_entities_synced_with_connection(&mut conn, entities)
}

fn mark_local_entities_synced_with_connection(
    conn: &mut Connection,
    entities: Vec<LocalEntityKey>,
) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start local DB sync transaction: {error}"))?;
    let now = now_unix_millis();
    {
        let mut read_statement = tx
            .prepare(
                "SELECT json, updated_at, dirty, deleted_at
                 FROM local_entities
                 WHERE kind = ?1 AND id = ?2",
            )
            .map_err(|error| format!("Could not prepare local DB sync token read: {error}"))?;
        let mut update_statement = tx
            .prepare(
                "UPDATE local_entities
                 SET dirty = 0, sync_status = 'synced', last_synced_at = ?3
                 WHERE kind = ?1 AND id = ?2",
            )
            .map_err(|error| format!("Could not prepare local DB sync mark: {error}"))?;
        for entity in entities {
            if !is_cloud_sync_kind(&entity.kind) {
                continue;
            }
            let current = read_statement
                .query_row(params![&entity.kind, &entity.id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                    ))
                })
                .optional()
                .map_err(|error| format!("Could not read local DB sync token: {error}"))?;
            let Some((json, updated_at, dirty, deleted_at)) = current else {
                continue;
            };
            if dirty == 0
                || local_entity_sync_token(&entity.kind, &entity.id, &json, updated_at, deleted_at)
                    != entity.sync_token
            {
                continue;
            }
            update_statement
                .execute(params![entity.kind, entity.id, now])
                .map_err(|error| format!("Could not mark local DB entity synced: {error}"))?;
        }
    }
    tx.commit()
        .map_err(|error| format!("Could not commit local DB sync mark: {error}"))
}

#[tauri::command]
pub fn apply_remote_local_entities(entities: Vec<LocalEntityPayload>) -> Result<(), String> {
    let mut conn = open_connection()?;
    apply_remote_local_entities_with_connection(&mut conn, entities)
}

fn apply_remote_local_entities_with_connection(
    conn: &mut Connection,
    entities: Vec<LocalEntityPayload>,
) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start local DB remote apply transaction: {error}"))?;
    {
        let mut read_statement = tx
            .prepare(
                "SELECT json, updated_at, deleted_at
                 FROM local_entities WHERE kind = ?1 AND id = ?2",
            )
            .map_err(|error| format!("Could not prepare local DB remote read: {error}"))?;
        let mut write_statement = tx
            .prepare(
                "INSERT INTO local_entities
                   (kind, id, json, updated_at, dirty, sync_status, last_synced_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 'synced', ?5, ?6)
                 ON CONFLICT(kind, id) DO UPDATE SET
                   json = excluded.json,
                   updated_at = excluded.updated_at,
                   dirty = 0,
                   sync_status = 'synced',
                   last_synced_at = excluded.last_synced_at,
                   deleted_at = excluded.deleted_at",
            )
            .map_err(|error| format!("Could not prepare local DB remote apply: {error}"))?;
        let now = now_unix_millis();
        for entity in entities {
            if !is_cloud_sync_kind(&entity.kind) {
                continue;
            }

            let current = read_statement
                .query_row(params![&entity.kind, &entity.id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                })
                .optional()
                .map_err(|error| {
                    format!("Could not read local entity before remote apply: {error}")
                })?;
            if current
                .as_ref()
                .is_some_and(|(_, updated_at, _)| *updated_at >= entity.updated_at)
            {
                continue;
            }

            let deleted_at = entity.deleted_at.map(|_| entity.updated_at);
            let remote_entity = if deleted_at.is_some() {
                serde_json::json!({})
            } else {
                merge_portable_remote_entity(
                    &entity.kind,
                    entity.entity,
                    current
                        .as_ref()
                        .filter(|(_, _, deleted_at)| deleted_at.is_none())
                        .and_then(|(json, _, _)| serde_json::from_str(json).ok()),
                )
            };
            let json = serde_json::to_string(&remote_entity)
                .map_err(|error| format!("Could not encode remote entity: {error}"))?;
            write_statement
                .execute(params![
                    entity.kind,
                    entity.id,
                    json,
                    entity.updated_at,
                    now,
                    deleted_at,
                ])
                .map_err(|error| format!("Could not apply remote entity: {error}"))?;
        }
    }
    tx.commit()
        .map_err(|error| format!("Could not commit local DB remote apply: {error}"))
}

fn merge_portable_remote_entity(
    kind: &str,
    remote: serde_json::Value,
    local: Option<serde_json::Value>,
) -> serde_json::Value {
    let mut remote = portable_local_entity(kind, remote, false);
    if kind != "games" {
        return remote;
    }

    let Some(remote_object) = remote.as_object_mut() else {
        return remote;
    };
    let local_object = local.as_ref().and_then(serde_json::Value::as_object);
    for key in [
        "status",
        "installPath",
        "executablePath",
        "processNames",
        "launchUri",
    ] {
        if let Some(value) = local_object.and_then(|object| object.get(key)) {
            remote_object.insert(key.to_string(), value.clone());
        }
    }
    remote
}

#[tauri::command]
pub fn get_local_database_path() -> Result<String, String> {
    Ok(database_path()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_local_sync_status() -> Result<LocalSyncStatus, String> {
    let conn = open_connection()?;
    let pending_changes = conn
        .query_row(
            "SELECT COUNT(*) FROM local_entities
             WHERE dirty = 1 AND kind IN ('games', 'downloads')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("Could not count pending local DB changes: {error}"))?;
    let entity_count = conn
        .query_row("SELECT COUNT(*) FROM local_entities", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| format!("Could not count local DB entities: {error}"))?;

    Ok(LocalSyncStatus {
        database_path: database_path()?.to_string_lossy().to_string(),
        schema_version: SCHEMA_VERSION,
        entity_count,
        pending_changes,
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSyncStatus {
    pub database_path: String,
    pub schema_version: i64,
    pub entity_count: i64,
    pub pending_changes: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntityPayload {
    pub kind: String,
    pub id: String,
    pub entity: serde_json::Value,
    pub updated_at: i64,
    #[serde(default)]
    pub deleted_at: Option<i64>,
    #[serde(default)]
    pub sync_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntityKey {
    pub kind: String,
    pub id: String,
    pub sync_token: String,
}

fn read_entities_for_sync(dirty_only: bool) -> Result<Vec<LocalEntityPayload>, String> {
    let conn = open_connection()?;
    read_entities_for_sync_with_connection(&conn, dirty_only)
}

fn read_entities_for_sync_with_connection(
    conn: &Connection,
    dirty_only: bool,
) -> Result<Vec<LocalEntityPayload>, String> {
    let sql = if dirty_only {
        "SELECT kind, id, json, updated_at, deleted_at FROM local_entities
         WHERE dirty = 1 AND kind IN ('games', 'downloads')
         ORDER BY updated_at ASC, kind ASC, id ASC"
    } else {
        "SELECT kind, id, json, updated_at, deleted_at
         FROM local_entities ORDER BY updated_at ASC, kind ASC, id ASC"
    };
    let mut statement = conn
        .prepare(sql)
        .map_err(|error| format!("Could not prepare local DB sync read: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })
        .map_err(|error| format!("Could not read local DB sync rows: {error}"))?;

    let mut entities = Vec::new();
    for row in rows {
        let (kind, id, json, updated_at, deleted_at) =
            row.map_err(|error| format!("Could not read local DB sync row: {error}"))?;
        let stored_entity = serde_json::from_str::<serde_json::Value>(&json)
            .map_err(|error| format!("Could not decode local DB sync entity: {error}"))?;
        let entity = portable_local_entity(&kind, stored_entity, deleted_at.is_some());
        entities.push(LocalEntityPayload {
            sync_token: local_entity_sync_token(&kind, &id, &json, updated_at, deleted_at),
            kind,
            id,
            entity,
            updated_at,
            deleted_at,
        });
    }
    Ok(entities)
}

fn local_entity_sync_token(
    kind: &str,
    id: &str,
    json: &str,
    updated_at: i64,
    deleted_at: Option<i64>,
) -> String {
    let mut hasher = Sha256::new();
    for value in [kind.as_bytes(), id.as_bytes(), json.as_bytes()] {
        hasher.update((value.len() as u64).to_be_bytes());
        hasher.update(value);
    }
    hasher.update(updated_at.to_be_bytes());
    hasher.update(deleted_at.unwrap_or(-1).to_be_bytes());
    let digest = hasher.finalize();
    let mut token = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut token, "{byte:02x}").expect("writing SHA-256 to a String cannot fail");
    }
    token
}

fn portable_local_entity(
    kind: &str,
    mut entity: serde_json::Value,
    deleted: bool,
) -> serde_json::Value {
    if deleted {
        return serde_json::json!({});
    }
    if kind != "games" {
        return entity;
    }

    if let Some(object) = entity.as_object_mut() {
        for key in ["installPath", "executablePath", "processNames", "launchUri"] {
            object.remove(key);
        }
        object.insert(
            "status".to_string(),
            serde_json::Value::String("not_installed".to_string()),
        );
    }
    entity
}

pub(crate) fn open_connection() -> Result<Connection, String> {
    let path = database_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Could not create local DB directory {}: {error}",
                parent.to_string_lossy()
            )
        })?;
    }

    let conn = Connection::open(&path).map_err(|error| {
        format!(
            "Could not open local DB {}: {error}",
            path.to_string_lossy()
        )
    })?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| format!("Could not configure local DB busy timeout: {error}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("Could not enable local DB WAL mode: {error}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("Could not enable local DB foreign keys: {error}"))?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS local_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_entities (
          kind TEXT NOT NULL,
          id TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          dirty INTEGER NOT NULL DEFAULT 1,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          last_synced_at INTEGER,
          deleted_at INTEGER,
          PRIMARY KEY (kind, id)
        );

        CREATE INDEX IF NOT EXISTS idx_local_entities_kind_updated
          ON local_entities(kind, updated_at);
        CREATE INDEX IF NOT EXISTS idx_local_entities_dirty
          ON local_entities(dirty, sync_status);
        ",
    )
    .map_err(|error| format!("Could not migrate local DB schema: {error}"))?;

    let has_deleted_at = {
        let mut statement = conn
            .prepare("PRAGMA table_info(local_entities)")
            .map_err(|error| format!("Could not inspect local DB schema: {error}"))?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|error| format!("Could not read local DB schema: {error}"))?;
        let mut found = false;
        for column in columns {
            if column.map_err(|error| format!("Could not read local DB column: {error}"))?
                == "deleted_at"
            {
                found = true;
                break;
            }
        }
        found
    };
    if !has_deleted_at {
        conn.execute(
            "ALTER TABLE local_entities ADD COLUMN deleted_at INTEGER",
            [],
        )
        .map_err(|error| format!("Could not add local DB tombstones: {error}"))?;
    }

    let existing_version = conn
        .query_row(
            "SELECT value FROM local_metadata WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Could not read local DB schema version: {error}"))?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);

    if existing_version < SCHEMA_VERSION {
        conn.execute(
            "INSERT INTO local_metadata (key, value)
             VALUES ('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SCHEMA_VERSION.to_string()],
        )
        .map_err(|error| format!("Could not write local DB schema version: {error}"))?;
    }

    Ok(())
}

fn database_path() -> Result<PathBuf, String> {
    data_dir()
        .map(|dir| dir.join("launcher.sqlite3"))
        .ok_or_else(|| "Could not resolve Open Game Launcher data directory.".to_string())
}

fn data_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("open-game-launcher"))
}

fn now_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc, Barrier};

    #[derive(Debug, Deserialize, Serialize)]
    struct TestGame {
        id: String,
        achievements: Vec<String>,
        statuses: Vec<String>,
        playtime: u32,
    }

    fn insert_test_game(conn: &Connection, game: &TestGame) {
        conn.execute(
            "INSERT INTO local_entities (kind, id, json, updated_at, dirty, sync_status)
             VALUES ('games', ?1, ?2, 1, 0, 'synced')",
            params![game.id, serde_json::to_string(game).unwrap()],
        )
        .unwrap();
    }

    fn unique_test_database(name: &str) -> (PathBuf, PathBuf) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "ogl-local-db-{name}-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let database = root.join("launcher.sqlite3");
        (root, database)
    }

    fn open_test_connection(path: &PathBuf) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        conn
    }

    #[test]
    fn authoritative_replacement_removes_only_omitted_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        insert_test_game(
            &conn,
            &TestGame {
                id: "keep".to_string(),
                achievements: Vec::new(),
                statuses: Vec::new(),
                playtime: 1,
            },
        );
        insert_test_game(
            &conn,
            &TestGame {
                id: "stale".to_string(),
                achievements: Vec::new(),
                statuses: Vec::new(),
                playtime: 2,
            },
        );

        let replacement = vec![TestGame {
            id: "keep".to_string(),
            achievements: vec!["latest".to_string()],
            statuses: Vec::new(),
            playtime: 3,
        }];
        replace_collection_with_connection(&mut conn, "games", &replacement, |game| &game.id)
            .unwrap();

        let games = read_collection_with_connection::<TestGame>(&conn, "games").unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "keep");
        assert_eq!(games[0].achievements, ["latest"]);
        assert_eq!(games[0].playtime, 3);
    }

    #[test]
    fn schema_v1_database_is_upgraded_with_tombstones_without_losing_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE local_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO local_metadata (key, value) VALUES ('schema_version', '1');
             CREATE TABLE local_entities (
               kind TEXT NOT NULL,
               id TEXT NOT NULL,
               json TEXT NOT NULL,
               updated_at INTEGER NOT NULL,
               dirty INTEGER NOT NULL DEFAULT 1,
               sync_status TEXT NOT NULL DEFAULT 'pending',
               last_synced_at INTEGER,
               PRIMARY KEY (kind, id)
             );
             INSERT INTO local_entities
               (kind, id, json, updated_at, dirty, sync_status)
             VALUES ('games', 'game-a', '{}', 1, 0, 'synced');",
        )
        .unwrap();

        migrate(&conn).unwrap();

        let (count, deleted_at): (i64, Option<i64>) = conn
            .query_row(
                "SELECT COUNT(*), deleted_at FROM local_entities",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let version: String = conn
            .query_row(
                "SELECT value FROM local_metadata WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(deleted_at, None);
        assert_eq!(version, SCHEMA_VERSION.to_string());
    }

    #[test]
    fn concurrent_collection_mutations_read_after_the_writer_lock() {
        let (root, path) = unique_test_database("collection-concurrency");
        let conn = open_test_connection(&path);
        migrate(&conn).unwrap();
        insert_test_game(
            &conn,
            &TestGame {
                id: "game-a".to_string(),
                achievements: Vec::new(),
                statuses: Vec::new(),
                playtime: 42,
            },
        );
        drop(conn);

        let (first_has_lock_tx, first_has_lock_rx) = mpsc::channel();
        let (release_first_tx, release_first_rx) = mpsc::channel();
        let first_path = path.clone();
        let first = std::thread::spawn(move || {
            let mut conn = open_test_connection(&first_path);
            mutate_collection_with_connection(
                &mut conn,
                "games",
                |game: &TestGame| &game.id,
                |games| {
                    first_has_lock_tx.send(()).unwrap();
                    release_first_rx.recv().unwrap();
                    games
                        .iter_mut()
                        .find(|game| game.id == "game-a")
                        .unwrap()
                        .statuses
                        .push("provider-ready".to_string());
                    Ok(())
                },
            )
            .unwrap();
        });

        first_has_lock_rx.recv().unwrap();
        let (second_started_tx, second_started_rx) = mpsc::channel();
        let second_path = path.clone();
        let second = std::thread::spawn(move || {
            let mut conn = open_test_connection(&second_path);
            second_started_tx.send(()).unwrap();
            mutate_collection_with_connection(
                &mut conn,
                "games",
                |game: &TestGame| &game.id,
                |games| {
                    games
                        .iter_mut()
                        .find(|game| game.id == "game-a")
                        .unwrap()
                        .achievements
                        .push("unlocked".to_string());
                    games.push(TestGame {
                        id: "game-b".to_string(),
                        achievements: Vec::new(),
                        statuses: vec!["new-row".to_string()],
                        playtime: 7,
                    });
                    Ok(())
                },
            )
            .unwrap();
        });

        // The first closure already holds BEGIN IMMEDIATE. Starting the second
        // mutation before releasing it deterministically exercises lock ordering.
        second_started_rx.recv().unwrap();
        release_first_tx.send(()).unwrap();
        first.join().unwrap();
        second.join().unwrap();

        let conn = open_test_connection(&path);
        let games = read_collection_with_connection::<TestGame>(&conn, "games").unwrap();
        let game_a = games.iter().find(|game| game.id == "game-a").unwrap();
        assert_eq!(game_a.achievements, ["unlocked"]);
        assert_eq!(game_a.statuses, ["provider-ready"]);
        assert_eq!(game_a.playtime, 42);
        assert!(games.iter().any(|game| game.id == "game-b"));
        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn item_updates_compose_from_the_latest_row_and_preserve_other_games() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        insert_test_game(
            &conn,
            &TestGame {
                id: "game-a".to_string(),
                achievements: Vec::new(),
                statuses: Vec::new(),
                playtime: 42,
            },
        );
        insert_test_game(
            &conn,
            &TestGame {
                id: "game-b".to_string(),
                achievements: vec!["untouched".to_string()],
                statuses: Vec::new(),
                playtime: 7,
            },
        );

        update_item_with_connection::<TestGame, _>(&mut conn, "games", "game-a", |game| {
            game.achievements.push("first".to_string());
            Ok(())
        })
        .unwrap();
        let updated =
            update_item_with_connection::<TestGame, _>(&mut conn, "games", "game-a", |game| {
                game.statuses.push("steam-ready".to_string());
                Ok(())
            })
            .unwrap();

        assert_eq!(updated.achievements, ["first"]);
        assert_eq!(updated.statuses, ["steam-ready"]);
        assert_eq!(updated.playtime, 42);

        let other: String = conn
            .query_row(
                "SELECT json FROM local_entities WHERE kind = 'games' AND id = 'game-b'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let other: TestGame = serde_json::from_str(&other).unwrap();
        assert_eq!(other.achievements, ["untouched"]);
        assert_eq!(other.playtime, 7);
    }

    #[test]
    fn concurrent_item_updates_do_not_lose_each_others_fields() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "ogl-local-db-concurrency-{}-{unique}.sqlite3",
            std::process::id()
        ));
        let conn = Connection::open(&path).unwrap();
        migrate(&conn).unwrap();
        insert_test_game(
            &conn,
            &TestGame {
                id: "game-a".to_string(),
                achievements: Vec::new(),
                statuses: Vec::new(),
                playtime: 42,
            },
        );
        drop(conn);

        let barrier = Arc::new(Barrier::new(2));
        let achievement_path = path.clone();
        let achievement_barrier = Arc::clone(&barrier);
        let achievement_update = std::thread::spawn(move || {
            let mut conn = Connection::open(achievement_path).unwrap();
            conn.busy_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            achievement_barrier.wait();
            update_item_with_connection::<TestGame, _>(&mut conn, "games", "game-a", |game| {
                game.achievements.push("unlocked".to_string());
                Ok(())
            })
            .unwrap();
        });
        let status_path = path.clone();
        let status_update = std::thread::spawn(move || {
            let mut conn = Connection::open(status_path).unwrap();
            conn.busy_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            barrier.wait();
            update_item_with_connection::<TestGame, _>(&mut conn, "games", "game-a", |game| {
                game.statuses.push("provider-ready".to_string());
                Ok(())
            })
            .unwrap();
        });

        achievement_update.join().unwrap();
        status_update.join().unwrap();

        let conn = Connection::open(&path).unwrap();
        let json: String = conn
            .query_row(
                "SELECT json FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let game: TestGame = serde_json::from_str(&json).unwrap();
        assert_eq!(game.achievements, ["unlocked"]);
        assert_eq!(game.statuses, ["provider-ready"]);
        assert_eq!(game.playtime, 42);
        drop(conn);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn item_update_failure_rolls_back_the_mutation() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        insert_test_game(
            &conn,
            &TestGame {
                id: "game-a".to_string(),
                achievements: vec!["original".to_string()],
                statuses: Vec::new(),
                playtime: 1,
            },
        );

        let result =
            update_item_with_connection::<TestGame, _>(&mut conn, "games", "game-a", |game| {
                game.achievements.clear();
                Err("injected failure".to_string())
            });

        assert_eq!(result.unwrap_err(), "injected failure");
        let json: String = conn
            .query_row(
                "SELECT json FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let game: TestGame = serde_json::from_str(&json).unwrap();
        assert_eq!(game.achievements, ["original"]);
    }

    #[test]
    fn item_database_write_failure_is_returned_and_rolled_back() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        insert_test_game(
            &conn,
            &TestGame {
                id: "game-a".to_string(),
                achievements: vec!["original".to_string()],
                statuses: Vec::new(),
                playtime: 1,
            },
        );
        conn.execute_batch(
            "CREATE TRIGGER fail_game_json_update
             BEFORE UPDATE OF json ON local_entities
             WHEN OLD.kind = 'games'
             BEGIN
               SELECT RAISE(FAIL, 'injected write failure');
             END;",
        )
        .unwrap();

        let result =
            update_item_with_connection::<TestGame, _>(&mut conn, "games", "game-a", |game| {
                game.achievements.push("must-not-persist".to_string());
                Ok(())
            });

        let error = result.unwrap_err();
        assert!(error.contains("Could not write local DB games item 'game-a'"));
        assert!(error.contains("injected write failure"));
        let json: String = conn
            .query_row(
                "SELECT json FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let game: TestGame = serde_json::from_str(&json).unwrap();
        assert_eq!(game.achievements, ["original"]);
    }

    #[test]
    fn stale_sync_acknowledgement_does_not_clear_a_newer_same_second_mutation() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let original = serde_json::to_string(&TestGame {
            id: "game-a".to_string(),
            achievements: vec!["original".to_string()],
            statuses: Vec::new(),
            playtime: 1,
        })
        .unwrap();
        upsert_serialized_item(&conn, "games", "game-a", &original, 42).unwrap();
        let stale_token = local_entity_sync_token("games", "game-a", &original, 42, None);

        let newer = serde_json::to_string(&TestGame {
            id: "game-a".to_string(),
            achievements: vec!["newer".to_string()],
            statuses: Vec::new(),
            playtime: 1,
        })
        .unwrap();
        upsert_serialized_item(&conn, "games", "game-a", &newer, 42).unwrap();

        mark_local_entities_synced_with_connection(
            &mut conn,
            vec![LocalEntityKey {
                kind: "games".to_string(),
                id: "game-a".to_string(),
                sync_token: stale_token,
            }],
        )
        .unwrap();

        let (json, dirty): (String, i64) = conn
            .query_row(
                "SELECT json, dirty FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(json, newer);
        assert_eq!(dirty, 1);
    }

    #[test]
    fn matching_sync_acknowledgement_marks_the_exact_payload_clean() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let json = serde_json::to_string(&TestGame {
            id: "game-a".to_string(),
            achievements: vec!["uploaded".to_string()],
            statuses: Vec::new(),
            playtime: 1,
        })
        .unwrap();
        upsert_serialized_item(&conn, "games", "game-a", &json, 42).unwrap();

        mark_local_entities_synced_with_connection(
            &mut conn,
            vec![LocalEntityKey {
                kind: "games".to_string(),
                id: "game-a".to_string(),
                sync_token: local_entity_sync_token("games", "game-a", &json, 42, None),
            }],
        )
        .unwrap();

        let dirty: i64 = conn
            .query_row(
                "SELECT dirty FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dirty, 0);
    }

    #[test]
    fn equal_timestamp_remote_payload_does_not_replace_a_dirty_local_mutation() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let local = serde_json::to_string(&TestGame {
            id: "game-a".to_string(),
            achievements: vec!["local-newer".to_string()],
            statuses: Vec::new(),
            playtime: 1,
        })
        .unwrap();
        upsert_serialized_item(&conn, "games", "game-a", &local, 42).unwrap();

        apply_remote_local_entities_with_connection(
            &mut conn,
            vec![LocalEntityPayload {
                kind: "games".to_string(),
                id: "game-a".to_string(),
                entity: serde_json::json!({
                    "id": "game-a",
                    "achievements": ["stale-upload"],
                    "statuses": [],
                    "playtime": 1
                }),
                updated_at: 42,
                deleted_at: None,
                sync_token: String::new(),
            }],
        )
        .unwrap();

        let (json, dirty): (String, i64) = conn
            .query_row(
                "SELECT json, dirty FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(json, local);
        assert_eq!(dirty, 1);
    }

    #[test]
    fn older_remote_payload_does_not_roll_back_a_clean_local_entity() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let local = serde_json::to_string(&TestGame {
            id: "game-a".to_string(),
            achievements: vec!["newest".to_string()],
            statuses: Vec::new(),
            playtime: 1,
        })
        .unwrap();
        conn.execute(
            "INSERT INTO local_entities (kind, id, json, updated_at, dirty, sync_status)
             VALUES ('games', 'game-a', ?1, 100, 0, 'synced')",
            params![local],
        )
        .unwrap();

        apply_remote_local_entities_with_connection(
            &mut conn,
            vec![LocalEntityPayload {
                kind: "games".to_string(),
                id: "game-a".to_string(),
                entity: serde_json::json!({
                    "id": "game-a",
                    "achievements": ["older"],
                    "statuses": [],
                    "playtime": 1
                }),
                updated_at: 50,
                deleted_at: None,
                sync_token: String::new(),
            }],
        )
        .unwrap();

        let (json, updated_at): (String, i64) = conn
            .query_row(
                "SELECT json, updated_at FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(json, local);
        assert_eq!(updated_at, 100);
    }

    #[test]
    fn pending_cloud_sync_excludes_machine_local_entities() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_serialized_item(&conn, "games", "game-a", "{}", 1).unwrap();
        upsert_serialized_item(&conn, "downloads", "game-b", "{}", 2).unwrap();
        upsert_serialized_item(&conn, "machine_local", "local-a", "{}", 3).unwrap();

        let pending = read_entities_for_sync_with_connection(&conn, true).unwrap();

        assert_eq!(
            pending
                .iter()
                .map(|entity| entity.kind.as_str())
                .collect::<Vec<_>>(),
            ["games", "downloads"]
        );
    }

    #[test]
    fn cloud_entity_deletion_is_a_syncable_tombstone_hidden_from_local_reads() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_serialized_item(
            &conn,
            "games",
            "game-a",
            r#"{"id":"game-a","status":"installed"}"#,
            42,
        )
        .unwrap();

        tombstone_or_delete_item_with_connection(&conn, "games", "game-a", None).unwrap();

        assert!(
            read_item_with_connection_for_test::<serde_json::Value>(&conn, "games", "game-a")
                .is_none()
        );
        let pending = read_entities_for_sync_with_connection(&conn, true).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].entity, serde_json::json!({}));
        assert!(pending[0].deleted_at.is_some());

        let key = LocalEntityKey {
            kind: pending[0].kind.clone(),
            id: pending[0].id.clone(),
            sync_token: pending[0].sync_token.clone(),
        };
        mark_local_entities_synced_with_connection(&mut conn, vec![key]).unwrap();
        let dirty: i64 = conn
            .query_row(
                "SELECT dirty FROM local_entities WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dirty, 0);
    }

    #[test]
    fn recreating_a_tombstoned_entity_advances_its_timestamp() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_serialized_item(&conn, "games", "game-a", "{}", 42).unwrap();
        tombstone_or_delete_item_with_connection(&conn, "games", "game-a", None).unwrap();
        let deleted_at: i64 = conn
            .query_row(
                "SELECT deleted_at FROM local_entities
                 WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // Simulate a recreate in the same clock tick. The live row must sort
        // after its tombstone when both are mirrored to per-device cloud rows.
        upsert_serialized_item(
            &conn,
            "games",
            "game-a",
            r#"{"id":"game-a","status":"not_installed"}"#,
            deleted_at,
        )
        .unwrap();

        let (updated_at, current_deleted_at): (i64, Option<i64>) = conn
            .query_row(
                "SELECT updated_at, deleted_at FROM local_entities
                 WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(updated_at > deleted_at);
        assert_eq!(current_deleted_at, None);
    }

    #[test]
    fn newer_remote_tombstone_blocks_older_remote_live_row() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_serialized_item(
            &conn,
            "games",
            "game-a",
            r#"{"id":"game-a","status":"installed"}"#,
            100,
        )
        .unwrap();

        apply_remote_local_entities_with_connection(
            &mut conn,
            vec![LocalEntityPayload {
                kind: "games".to_string(),
                id: "game-a".to_string(),
                entity: serde_json::json!({}),
                updated_at: 200,
                deleted_at: Some(200),
                sync_token: String::new(),
            }],
        )
        .unwrap();
        apply_remote_local_entities_with_connection(
            &mut conn,
            vec![LocalEntityPayload {
                kind: "games".to_string(),
                id: "game-a".to_string(),
                entity: serde_json::json!({"id": "game-a", "status": "installed"}),
                updated_at: 150,
                deleted_at: None,
                sync_token: String::new(),
            }],
        )
        .unwrap();

        let (updated_at, deleted_at): (i64, Option<i64>) = conn
            .query_row(
                "SELECT updated_at, deleted_at FROM local_entities
                 WHERE kind = 'games' AND id = 'game-a'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(updated_at, 200);
        assert_eq!(deleted_at, Some(200));
        assert!(
            read_collection_with_connection::<serde_json::Value>(&conn, "games")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn pending_game_payload_omits_device_installation_state() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        upsert_serialized_item(
            &conn,
            "games",
            "game-a",
            r#"{"id":"game-a","title":"Arcade","status":"installed","installPath":"C:\\Games\\Arcade","executablePath":"C:\\Games\\Arcade\\game.exe","processNames":["game.exe"],"launchUri":"steam://run/1"}"#,
            42,
        )
        .unwrap();

        let pending = read_entities_for_sync_with_connection(&conn, true).unwrap();
        let game = pending[0].entity.as_object().unwrap();
        assert_eq!(
            game.get("status"),
            Some(&serde_json::json!("not_installed"))
        );
        for key in ["installPath", "executablePath", "processNames", "launchUri"] {
            assert!(!game.contains_key(key));
        }
    }

    #[test]
    fn remote_game_metadata_preserves_this_devices_installation_state() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let local = serde_json::json!({
            "id": "game-a",
            "title": "Old title",
            "status": "installed",
            "installPath": "C:\\Games\\Arcade",
            "executablePath": "C:\\Games\\Arcade\\game.exe",
            "processNames": ["game.exe"],
            "launchUri": "steam://run/1"
        });
        conn.execute(
            "INSERT INTO local_entities (kind, id, json, updated_at, dirty, sync_status)
             VALUES ('games', 'game-a', ?1, 100, 0, 'synced')",
            params![serde_json::to_string(&local).unwrap()],
        )
        .unwrap();

        apply_remote_local_entities_with_connection(
            &mut conn,
            vec![
                LocalEntityPayload {
                    kind: "games".to_string(),
                    id: "game-a".to_string(),
                    entity: serde_json::json!({
                        "id": "game-a",
                        "title": "Cloud title",
                        "status": "installed",
                        "installPath": "D:\\OtherDevice",
                        "executablePath": "D:\\OtherDevice\\bad.exe",
                        "processNames": ["bad.exe"],
                        "launchUri": "other://device"
                    }),
                    updated_at: 200,
                    deleted_at: None,
                    sync_token: String::new(),
                },
                LocalEntityPayload {
                    kind: "games".to_string(),
                    id: "game-b".to_string(),
                    entity: serde_json::json!({
                        "id": "game-b",
                        "title": "Cloud-only game",
                        "status": "installed",
                        "installPath": "D:\\OtherDevice"
                    }),
                    updated_at: 200,
                    deleted_at: None,
                    sync_token: String::new(),
                },
            ],
        )
        .unwrap();

        let game_a =
            read_item_with_connection_for_test::<serde_json::Value>(&conn, "games", "game-a")
                .unwrap();
        assert_eq!(game_a["title"], "Cloud title");
        assert_eq!(game_a["status"], "installed");
        assert_eq!(game_a["installPath"], "C:\\Games\\Arcade");
        assert_eq!(game_a["executablePath"], "C:\\Games\\Arcade\\game.exe");
        assert_eq!(game_a["processNames"], serde_json::json!(["game.exe"]));
        assert_eq!(game_a["launchUri"], "steam://run/1");

        let game_b =
            read_item_with_connection_for_test::<serde_json::Value>(&conn, "games", "game-b")
                .unwrap();
        assert_eq!(game_b["status"], "not_installed");
        assert!(game_b.get("installPath").is_none());
    }

    fn read_item_with_connection_for_test<T: DeserializeOwned>(
        conn: &Connection,
        kind: &str,
        id: &str,
    ) -> Option<T> {
        let json = conn
            .query_row(
                "SELECT json FROM local_entities
                 WHERE kind = ?1 AND id = ?2 AND deleted_at IS NULL",
                params![kind, id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .unwrap()?;
        Some(serde_json::from_str(&json).unwrap())
    }
}
