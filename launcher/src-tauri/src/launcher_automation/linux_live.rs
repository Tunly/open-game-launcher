//! Live AT-SPI adapter: bridges the pure `linux.rs` backend to the real
//! AT-SPI D-Bus service via the `atspi` crate (zbus-based).
//!
//! The pure backend (`LinuxAtspiBackend`) is trait-based and testable with
//! in-memory nodes. This module provides the production `AtspiSource` and
//! `AtspiNode` implementations that talk to the session bus.
//!
//! The `AtspiNode`/`AtspiSource` traits are synchronous (so the pure backend
//! stays testable), while the `atspi` crate is async. We bridge this with a
//! single shared `tokio::Runtime` stored in `LiveAtspiSource` and cloned into
//! every live node; each trait method runs its async work via `block_on`.
//!
//! Design constraints (inherited from `linux.rs` and `providers.rs`):
//! - exact application identity only: bus name + pid; never guessed
//! - fail-closed: any D-Bus error, missing node, or unparseable snapshot is
//!   surfaced as an error or an empty result, never a guessed match
//! - no coordinate clicks, no keyboard synthesis, no OCR

use std::sync::Arc;

use atspi::proxy::accessible::AccessibleProxy;
use atspi::proxy::action::ActionProxy;
use atspi::AccessibilityConnection;
use atspi::{Interface, State};

use super::linux::{
    map_atspi_role, AtspiAvailability, AtspiNode, AtspiSnapshot, AtspiSource, LinuxApplication,
};
use super::providers::ControlRole;

/// Max depth of the AT-SPI tree walk (mirrors `linux.rs` MAX_NODES spirit).
const MAX_DEPTH: usize = 32;

/// A live D-Bus `AccessibleProxy` node. Carries its ancestor roles (for
/// relationship detection), its depth (to bound the walk), and the shared
/// runtime used to run the async AT-SPI calls.
#[derive(Clone)]
pub struct LiveAtspiNode {
    accessible: AccessibleProxy<'static>,
    ancestors: Vec<ControlRole>,
    depth: usize,
    runtime: Arc<tokio::runtime::Runtime>,
}

impl LiveAtspiNode {
    fn new(
        accessible: AccessibleProxy<'static>,
        ancestors: Vec<ControlRole>,
        depth: usize,
        runtime: Arc<tokio::runtime::Runtime>,
    ) -> Self {
        Self {
            accessible,
            ancestors,
            depth,
            runtime,
        }
    }

    fn role(&self) -> ControlRole {
        self.runtime
            .block_on(self.accessible.get_role())
            .map(|role| map_atspi_role(role.name()))
            .unwrap_or(ControlRole::Custom)
    }
}

impl AtspiNode for LiveAtspiNode {
    type Error = String;

    fn snapshot(&self) -> Result<AtspiSnapshot, Self::Error> {
        let runtime = self.runtime.clone();
        let proxy = &self.accessible;
        let role = runtime
            .block_on(proxy.get_role())
            .map_err(|e| e.to_string())?;
        let name = runtime.block_on(proxy.name()).map_err(|e| e.to_string())?;
        let description = runtime
            .block_on(proxy.description())
            .map_err(|e| e.to_string())?;
        let accessible_id = runtime
            .block_on(proxy.accessible_id())
            .map_err(|e| e.to_string())?;
        let state = runtime
            .block_on(proxy.get_state())
            .map_err(|e| e.to_string())?;

        // Resolve the owning pid via the bus daemon's peer credentials, then
        // derive the process name from /proc/<pid>/comm (matches the Linux
        // backend's `application_matches` expectations).
        let pid = bus_peer_pid(&runtime, proxy).unwrap_or(0);
        let process_name = process_name_of_pid(pid);

        // Read the Action interface if present.
        let action_names = if runtime
            .block_on(proxy.get_interfaces())
            .map_err(|e| e.to_string())?
            .contains(Interface::Action)
        {
            let action_proxy = build_action_proxy(&runtime, proxy).map_err(|e| e.to_string())?;
            let count = runtime
                .block_on(action_proxy.n_actions())
                .map_err(|e| e.to_string())?;
            let mut names = Vec::new();
            for index in 0..count {
                names.push(
                    runtime
                        .block_on(action_proxy.get_name(index))
                        .map_err(|e| e.to_string())?,
                );
            }
            names
        } else {
            Vec::new()
        };

        Ok(AtspiSnapshot {
            accessible_id,
            role: role.name().to_string(),
            name,
            description,
            bus_name: proxy.inner().destination().to_string(),
            process_name,
            pid,
            compatibility_prefix_id: None,
            enabled: state.contains(State::Enabled),
            visible: state.contains(State::Visible),
            sensitive: state.contains(State::Sensitive),
            // AT-SPI has no Password state; editable+sensitive is the
            // fail-closed approximation used by the Linux backend.
            password: state.contains(State::Editable) && state.contains(State::Sensitive),
            modal: state.contains(State::Modal),
            action_names,
            ancestor_roles: self.ancestors.clone(),
            identity_tokens: Vec::new(),
        })
    }

    fn children(&self) -> Result<Vec<Self>, Self::Error> {
        if self.depth >= MAX_DEPTH {
            return Ok(Vec::new());
        }
        let mut children = Vec::new();
        let mut index = 0_i32;
        loop {
            let child_ref = self
                .runtime
                .block_on(self.accessible.get_child_at_index(index))
                .map_err(|e| e.to_string())?;
            if child_ref.is_null() {
                break;
            }
            let child_proxy = build_accessible_proxy(
                &self.runtime,
                self.accessible.inner().connection(),
                &child_ref,
            )
            .map_err(|e| e.to_string())?;
            let mut ancestors = self.ancestors.clone();
            ancestors.push(self.role());
            children.push(Self::new(
                child_proxy,
                ancestors,
                self.depth + 1,
                self.runtime.clone(),
            ));
            index += 1;
        }
        Ok(children)
    }

    fn invoke_action(&self, exact_action_name: &str) -> Result<bool, Self::Error> {
        let runtime = self.runtime.clone();
        let action_proxy =
            build_action_proxy(&runtime, &self.accessible).map_err(|e| e.to_string())?;
        let count = runtime
            .block_on(action_proxy.n_actions())
            .map_err(|e| e.to_string())?;
        for index in 0..count {
            let name = runtime
                .block_on(action_proxy.get_name(index))
                .map_err(|e| e.to_string())?;
            if name == exact_action_name {
                return runtime
                    .block_on(action_proxy.do_action(index))
                    .map_err(|e| e.to_string());
            }
        }
        Ok(false)
    }
}

/// Read the process name from `/proc/<pid>/comm`. Returns an empty string when
/// the pid is invalid, the process is gone, or the file is unreadable.
fn process_name_of_pid(pid: u32) -> String {
    if pid == 0 {
        return String::new();
    }
    std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .map(|name| name.trim().to_string())
        .unwrap_or_default()
}

/// Build an owned `AccessibleProxy<'static>` for an `ObjectRefOwned`.
///
/// This deliberately avoids `as_accessible_proxy`, whose returned proxy is
/// borrowed from the `ObjectRef` — we need a `'static` handle to store in
/// `LiveAtspiNode`. We copy the bus name and object path into owned values and
/// build the proxy with the shared runtime.
fn build_accessible_proxy(
    runtime: &tokio::runtime::Runtime,
    conn: &zbus::Connection,
    object_ref: &atspi::ObjectRefOwned,
) -> Result<AccessibleProxy<'static>, zbus::Error> {
    let Some(name) = object_ref.name() else {
        return Err(zbus::Error::Failure("ObjectRef has no bus name".into()));
    };
    let path = object_ref.path().to_owned();
    runtime.block_on(async {
        AccessibleProxy::builder(conn)
            .destination(name.clone())?
            .path(path)?
            .build()
            .await
    })
}

/// Build an `ActionProxy` for the same bus destination + object path as the
/// accessible proxy.
fn build_action_proxy<'a>(
    runtime: &tokio::runtime::Runtime,
    accessible: &'a AccessibleProxy<'_>,
) -> Result<ActionProxy<'a>, zbus::Error> {
    runtime.block_on(async {
        ActionProxy::builder(accessible.inner().connection())
            .destination(accessible.inner().destination().clone())?
            .path(accessible.inner().path().clone())?
            .build()
            .await
    })
}

/// Resolve the pid owning a bus destination via `org.freedesktop.DBus`
/// `GetConnectionCredentials`. Returns `None` when the bus does not expose the
/// peer's pid (e.g. some sandboxes); callers degrade gracefully.
fn bus_peer_pid(
    runtime: &tokio::runtime::Runtime,
    accessible: &AccessibleProxy<'_>,
) -> Option<u32> {
    runtime.block_on(async {
        let dbus = zbus::fdo::DBusProxy::new(accessible.inner().connection())
            .await
            .ok()?;
        let creds = dbus
            .get_connection_credentials(accessible.inner().destination().clone())
            .await
            .ok()?;
        creds.process_id()
    })
}

/// Production source: connects to the session AT-SPI bus and lists the
/// accessible applications as live nodes.
pub struct LiveAtspiSource {
    conn: AccessibilityConnection,
    runtime: Arc<tokio::runtime::Runtime>,
}

impl LiveAtspiSource {
    pub fn connect() -> Result<Self, String> {
        let runtime = Arc::new(
            tokio::runtime::Runtime::new()
                .map_err(|e| format!("Could not create the AT-SPI runtime: {e}"))?,
        );
        let conn = runtime
            .block_on(AccessibilityConnection::new())
            .map_err(|e| format!("Could not connect to the AT-SPI bus: {e}"))?;
        Ok(Self { conn, runtime })
    }
}

impl AtspiSource for LiveAtspiSource {
    type Node = LiveAtspiNode;
    type Error = String;

    fn availability(&self) -> AtspiAvailability {
        // `AccessibilityConnection::new()` already connected; if it is
        // reachable the bus is available.
        AtspiAvailability::Available
    }

    fn applications(&self) -> Result<Vec<LinuxApplication<Self::Node>>, Self::Error> {
        let registry_root = self
            .runtime
            .block_on(self.conn.root_accessible_on_registry())
            .map_err(|e| e.to_string())?;
        // The registry root's children are the top-level application roots.
        let app_refs = self
            .runtime
            .block_on(registry_root.get_children())
            .map_err(|e| e.to_string())?;

        let mut applications = Vec::new();
        for object_ref in app_refs {
            if object_ref.is_null() {
                continue;
            }
            let Some(bus_name) = object_ref.name() else {
                continue;
            };
            let accessible =
                build_accessible_proxy(&self.runtime, self.conn.connection(), &object_ref)
                    .map_err(|e| e.to_string())?;
            let pid = bus_peer_pid(&self.runtime, &accessible).unwrap_or(0);
            let root = LiveAtspiNode::new(accessible, Vec::new(), 0, self.runtime.clone());
            applications.push(LinuxApplication {
                bus_name: bus_name.to_string(),
                process_name: String::new(),
                pid,
                compatibility_prefix_id: None,
                root,
            });
        }
        Ok(applications)
    }
}
