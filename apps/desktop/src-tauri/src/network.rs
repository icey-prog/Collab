//! Network helpers : IP LAN + détection hotspot Windows.

use local_ip_address::local_ip;

#[tauri::command]
pub fn get_local_ip() -> Option<String> {
  local_ip().ok().map(|ip| ip.to_string())
}

/// Windows uniquement : retourne true si le mobile hotspot est démarré.
/// Sur Mac/Linux : toujours false (à étendre plus tard).
#[tauri::command]
pub fn check_hotspot_active() -> bool {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let out = Command::new("netsh")
      .args(["wlan", "show", "hostednetwork"])
      .output();
    if let Ok(out) = out {
      let stdout = String::from_utf8_lossy(&out.stdout);
      return stdout.contains("Started") || stdout.contains("Démarré");
    }
  }
  false
}
