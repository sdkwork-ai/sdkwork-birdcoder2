//! BirdCoder2 Pad tablet host.
//!
//! The Rust shell owns window, permission, and platform capability plumbing for
//! iPadOS and Android tablets. It must not own business authorization, app
//! services, generated SDK edits, or route constants
//! (APP_PAD_ARCHITECTURE_SPEC.md section 7).

/// Returns the declared tablet host identity for bootstrap diagnostics.
#[tauri::command]
fn tablet_host_info() -> &'static str {
    "sdkwork-birdcoder2-pad-tauri"
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![tablet_host_info])
        .run(tauri::generate_context!())
        .expect("error while running BirdCoder2 Pad");
}