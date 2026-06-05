//! Local SQLite storage for individual play sessions.
//!
//! The poller writes one row per closed session. Rows are flagged `synced_at`
//! after the frontend successfully pushes them to the Supabase
//! `game_sessions` table. Unsynced rows are drained on next sync.
use chrono::DateTime;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::Platform;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionRecord {
    pub id: String,
    pub game_id: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration_minutes: u32,
    pub platform: String,
    pub launcher_device_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced_at: Option<i64>,
}

pub fn open_session_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS play_sessions (
            id TEXT PRIMARY KEY,
            game_id TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ended_at INTEGER NOT NULL,
            duration_minutes INTEGER NOT NULL,
            platform TEXT NOT NULL,
            launcher_device_id TEXT NOT NULL,
            synced_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_play_sessions_unsynced
            ON play_sessions(synced_at, ended_at)
            WHERE synced_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_play_sessions_game
            ON play_sessions(game_id, ended_at);
        "#,
    )
}

pub fn insert_session(conn: &Connection, session: &PlaySessionRecord) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO play_sessions
         (id, game_id, started_at, ended_at, duration_minutes, platform, launcher_device_id, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            session.id,
            session.game_id,
            session.started_at,
            session.ended_at,
            session.duration_minutes,
            session.platform,
            session.launcher_device_id,
            session.synced_at,
        ],
    )?;
    Ok(())
}

pub fn unsynced_sessions(conn: &Connection) -> rusqlite::Result<Vec<PlaySessionRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, game_id, started_at, ended_at, duration_minutes, platform, launcher_device_id, synced_at
         FROM play_sessions
         WHERE synced_at IS NULL
         ORDER BY ended_at ASC",
    )?;
    let rows = statement.query_map([], row_to_session)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn mark_synced(conn: &Connection, ids: &[String]) -> rusqlite::Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let now = now_unix_secs();
    let mut updated = 0;
    for id in ids {
        updated += conn.execute(
            "UPDATE play_sessions SET synced_at = ?1 WHERE id = ?2 AND synced_at IS NULL",
            params![now, id],
        )?;
    }
    Ok(updated)
}

pub fn delete_session(conn: &Connection, id: &str) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM play_sessions WHERE id = ?1", params![id])
}

pub fn get_session(conn: &Connection, id: &str) -> rusqlite::Result<Option<PlaySessionRecord>> {
    conn.query_row(
        "SELECT id, game_id, started_at, ended_at, duration_minutes, platform, launcher_device_id, synced_at
         FROM play_sessions WHERE id = ?1",
        params![id],
        row_to_session,
    )
    .optional()
}

pub fn update_session(
    conn: &Connection,
    id: &str,
    started_at: Option<i64>,
    ended_at: Option<i64>,
    duration_minutes: Option<u32>,
) -> rusqlite::Result<()> {
    // Manual correction: never overwrite `synced_at` — re-mark dirty so the
    // frontend re-pushes the corrected row.
    conn.execute(
        "UPDATE play_sessions
         SET started_at = COALESCE(?1, started_at),
             ended_at = COALESCE(?2, ended_at),
             duration_minutes = COALESCE(?3, duration_minutes),
             synced_at = NULL
         WHERE id = ?4",
        params![started_at, ended_at, duration_minutes, id],
    )?;
    Ok(())
}

pub fn platform_to_str(platform: &Platform) -> &'static str {
    match platform {
        Platform::Windows => "windows",
        Platform::Linux => "linux",
        Platform::Macos => "macos",
    }
}

pub fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn iso_to_unix(iso: &str) -> i64 {
    DateTime::parse_from_rfc3339(iso)
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|_| now_unix_secs())
}

fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<PlaySessionRecord> {
    Ok(PlaySessionRecord {
        id: row.get(0)?,
        game_id: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        duration_minutes: row.get::<_, i64>(4)? as u32,
        platform: row.get(5)?,
        launcher_device_id: row.get(6)?,
        synced_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        open_session_table(&conn).unwrap();
        conn
    }

    fn sample(id: &str) -> PlaySessionRecord {
        PlaySessionRecord {
            id: id.to_string(),
            game_id: "game-1".to_string(),
            started_at: 1_700_000_000,
            ended_at: 1_700_000_600,
            duration_minutes: 10,
            platform: "windows".to_string(),
            launcher_device_id: "device-1".to_string(),
            synced_at: None,
        }
    }

    #[test]
    fn insert_and_fetch_roundtrip() {
        let conn = fresh_db();
        insert_session(&conn, &sample("s1")).unwrap();
        let got = get_session(&conn, "s1").unwrap().unwrap();
        assert_eq!(got.id, "s1");
        assert_eq!(got.duration_minutes, 10);
        assert!(got.synced_at.is_none());
    }

    #[test]
    fn unsynced_then_marked_synced() {
        let conn = fresh_db();
        insert_session(&conn, &sample("a")).unwrap();
        insert_session(&conn, &sample("b")).unwrap();
        assert_eq!(unsynced_sessions(&conn).unwrap().len(), 2);
        let n = mark_synced(&conn, &["a".to_string()]).unwrap();
        assert_eq!(n, 1);
        let remaining = unsynced_sessions(&conn).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "b");
    }

    #[test]
    fn update_re_dirties_synced_at() {
        let conn = fresh_db();
        insert_session(&conn, &sample("x")).unwrap();
        mark_synced(&conn, &["x".to_string()]).unwrap();
        let synced = get_session(&conn, "x").unwrap().unwrap();
        assert!(synced.synced_at.is_some());

        update_session(&conn, "x", None, None, Some(20)).unwrap();
        let after = get_session(&conn, "x").unwrap().unwrap();
        assert_eq!(after.duration_minutes, 20);
        assert!(after.synced_at.is_none(), "manual edit must re-flag dirty");
    }

    #[test]
    fn platform_mapping() {
        assert_eq!(platform_to_str(&Platform::Windows), "windows");
        assert_eq!(platform_to_str(&Platform::Macos), "macos");
        assert_eq!(platform_to_str(&Platform::Linux), "linux");
    }
}
