use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SCHEMA_VERSION: i64 = 1;

pub fn read_collection<T>(kind: &str) -> Result<Vec<T>, String>
where
    T: DeserializeOwned,
{
    let conn = open_connection()?;
    let mut statement = conn
        .prepare("SELECT json FROM local_entities WHERE kind = ?1 ORDER BY updated_at ASC, id ASC")
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

pub fn write_collection<T, F>(kind: &str, items: &[T], id_fn: F) -> Result<(), String>
where
    T: Serialize,
    F: Fn(&T) -> &str,
{
    let mut conn = open_connection()?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("Could not start local DB transaction: {error}"))?;
    tx.execute("DELETE FROM local_entities WHERE kind = ?1", params![kind])
        .map_err(|error| format!("Could not clear local DB {kind} collection: {error}"))?;

    let now = now_unix_secs();
    {
        let mut statement = tx
            .prepare(
                "INSERT INTO local_entities (kind, id, json, updated_at, dirty, sync_status)
                 VALUES (?1, ?2, ?3, ?4, 1, 'pending')
                 ON CONFLICT(kind, id) DO UPDATE SET
                   json = excluded.json,
                   updated_at = excluded.updated_at,
                   dirty = 1,
                   sync_status = 'pending'",
            )
            .map_err(|error| format!("Could not prepare local DB {kind} write: {error}"))?;

        for item in items {
            let id = id_fn(item).trim();
            if id.is_empty() {
                continue;
            }
            let json = serde_json::to_string(item)
                .map_err(|error| format!("Could not encode local DB {kind} row: {error}"))?;
            statement
                .execute(params![kind, id, json, now])
                .map_err(|error| format!("Could not write local DB {kind} row: {error}"))?;
        }
    }

    tx.commit()
        .map_err(|error| format!("Could not commit local DB {kind} write: {error}"))
}

pub fn remove_item(kind: &str, id: &str) -> Result<(), String> {
    let conn = open_connection()?;
    conn.execute(
        "DELETE FROM local_entities WHERE kind = ?1 AND id = ?2",
        params![kind, id],
    )
    .map_err(|error| format!("Could not delete local DB {kind} item: {error}"))?;
    Ok(())
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
    let tx = conn
        .transaction()
        .map_err(|error| format!("Could not start local DB sync transaction: {error}"))?;
    let now = now_unix_secs();
    {
        let mut statement = tx
            .prepare(
                "UPDATE local_entities
                 SET dirty = 0, sync_status = 'synced', last_synced_at = ?3
                 WHERE kind = ?1 AND id = ?2",
            )
            .map_err(|error| format!("Could not prepare local DB sync mark: {error}"))?;
        for entity in entities {
            statement
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
    let tx = conn
        .transaction()
        .map_err(|error| format!("Could not start local DB remote apply transaction: {error}"))?;
    {
        let mut statement = tx
            .prepare(
                "INSERT INTO local_entities (kind, id, json, updated_at, dirty, sync_status, last_synced_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 'synced', ?5)
                 ON CONFLICT(kind, id) DO UPDATE SET
                   json = CASE
                     WHEN local_entities.dirty = 0 OR excluded.updated_at >= local_entities.updated_at
                     THEN excluded.json ELSE local_entities.json END,
                   updated_at = CASE
                     WHEN local_entities.dirty = 0 OR excluded.updated_at >= local_entities.updated_at
                     THEN excluded.updated_at ELSE local_entities.updated_at END,
                   dirty = CASE
                     WHEN local_entities.dirty = 0 OR excluded.updated_at >= local_entities.updated_at
                     THEN 0 ELSE local_entities.dirty END,
                   sync_status = CASE
                     WHEN local_entities.dirty = 0 OR excluded.updated_at >= local_entities.updated_at
                     THEN 'synced' ELSE local_entities.sync_status END,
                   last_synced_at = excluded.last_synced_at",
            )
            .map_err(|error| format!("Could not prepare local DB remote apply: {error}"))?;
        let now = now_unix_secs();
        for entity in entities {
            let json = serde_json::to_string(&entity.entity)
                .map_err(|error| format!("Could not encode remote entity: {error}"))?;
            statement
                .execute(params![
                    entity.kind,
                    entity.id,
                    json,
                    entity.updated_at,
                    now
                ])
                .map_err(|error| format!("Could not apply remote entity: {error}"))?;
        }
    }
    tx.commit()
        .map_err(|error| format!("Could not commit local DB remote apply: {error}"))
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
            "SELECT COUNT(*) FROM local_entities WHERE dirty = 1",
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntityKey {
    pub kind: String,
    pub id: String,
}

fn read_entities_for_sync(dirty_only: bool) -> Result<Vec<LocalEntityPayload>, String> {
    let conn = open_connection()?;
    let sql = if dirty_only {
        "SELECT kind, id, json, updated_at FROM local_entities WHERE dirty = 1 ORDER BY updated_at ASC, kind ASC, id ASC"
    } else {
        "SELECT kind, id, json, updated_at FROM local_entities ORDER BY updated_at ASC, kind ASC, id ASC"
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
            ))
        })
        .map_err(|error| format!("Could not read local DB sync rows: {error}"))?;

    let mut entities = Vec::new();
    for row in rows {
        let (kind, id, json, updated_at) =
            row.map_err(|error| format!("Could not read local DB sync row: {error}"))?;
        let entity = serde_json::from_str::<serde_json::Value>(&json)
            .map_err(|error| format!("Could not decode local DB sync entity: {error}"))?;
        entities.push(LocalEntityPayload {
            kind,
            id,
            entity,
            updated_at,
        });
    }
    Ok(entities)
}

fn open_connection() -> Result<Connection, String> {
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
          PRIMARY KEY (kind, id)
        );

        CREATE INDEX IF NOT EXISTS idx_local_entities_kind_updated
          ON local_entities(kind, updated_at);
        CREATE INDEX IF NOT EXISTS idx_local_entities_dirty
          ON local_entities(dirty, sync_status);
        ",
    )
    .map_err(|error| format!("Could not migrate local DB schema: {error}"))?;

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

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
