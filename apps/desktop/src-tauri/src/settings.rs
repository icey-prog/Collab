//! Settings : ouvrir panneaux Settings OS + version app.

#[tauri::command]
pub fn open_hotspot_settings() -> Result<(), String> {
  use std::process::Command;

  #[cfg(target_os = "windows")]
  let res = Command::new("cmd")
    .args(["/c", "start", "ms-settings:network-mobilehotspot"])
    .spawn();

  #[cfg(target_os = "macos")]
  let res = Command::new("open")
    .args(["x-apple.systempreferences:com.apple.preferences.sharing"])
    .spawn();

  #[cfg(target_os = "linux")]
  let res = Command::new("gnome-control-center")
    .args(["wifi"])
    .spawn();

  res.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}
