use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
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
            "SELECT json FROM local_entities WHERE kind = ?1 AND id = ?2",
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
             SET json = ?3, updated_at = ?4, dirty = 1, sync_status = 'pending'
             WHERE kind = ?1 AND id = ?2",
            params![kind, id, json, now_unix_secs()],
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

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
}
