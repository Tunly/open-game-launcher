#[allow(unused_imports)]
pub mod core;
#[allow(unused_imports)]
pub mod detect;
#[allow(unused_imports)]
pub mod device_id;
#[allow(unused_imports)]
pub mod idle;
#[allow(unused_imports)]
pub mod playtime;
#[allow(unused_imports)]
pub mod sync;
#[allow(unused_imports)]
pub mod types;
#[allow(unused_imports)]
pub mod verify;

// Re-export everything from all submodules
#[allow(unused_imports)]
pub use core::*;
#[allow(unused_imports)]
pub use detect::*;
#[allow(unused_imports)]
pub use device_id::*;
#[allow(unused_imports)]
pub use idle::*;
#[allow(unused_imports)]
pub use playtime::*;
#[allow(unused_imports)]
pub use sync::*;
#[allow(unused_imports)]
pub use types::*;
#[allow(unused_imports)]
pub use verify::*;
