#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod sidecar;
mod network;
mod settings;
mod tray;

use sidecar::SidecarState;
use std::sync::Mutex;
use std::fs;
use std::path::PathBuf;

/// B6 fix : empêche deuxième instance via PID file dans app_data_dir.
/// Si le fichier existe ET le PID référence un process Collab.exe vivant,
/// la 2e instance refuse de démarrer.
fn enforce_single_instance(pid_path: &PathBuf) -> Result<(), String> {
  if let Ok(content) = fs::read_to_string(pid_path) {
    if let Ok(pid) = content.trim().parse::<u32>() {
      // Check si ce PID tourne ET correspond à Collab.exe
      let alive = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid), "/FI", "IMAGENAME eq Collab.exe", "/FO", "CSV", "/NH"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.contains(&pid.to_string()))
        .unwrap_or(false);
      if alive {
        return Err(format!(
          "Collab tourne déjà (PID {}). Ouvre la fenêtre depuis l'icône système (tray) au lieu de relancer.",
          pid
        ));
      }
    }
  }
  // Sinon : écrit notre PID
  let our_pid = std::process::id();
  fs::create_dir_all(pid_path.parent().unwrap_or(pid_path)).ok();
  fs::write(pid_path, our_pid.to_string())
    .map_err(|e| format!("PID file écriture échouée: {}", e))?;
  Ok(())
}

fn main() {
  // B6 enforcement — vérifie PID file (best-effort, juste warn pas die).
  // Note : si plusieurs instances passent quand même, le zombie cleanup de
  // sidecar.rs gère le port collision.
  if let Some(local_app_data) = dirs::data_local_dir() {
    let pid_path = local_app_data.join("Collab").join("collab.pid");
    if let Err(e) = enforce_single_instance(&pid_path) {
      eprintln!("[main] {}", e);
      // Affiche message via Windows MessageBox au lieu de juste log
      #[cfg(target_os = "windows")]
      {
        use std::ffi::CString;
        let title = CString::new("Collab — Déjà en cours").unwrap();
        let msg = CString::new(e.as_str()).unwrap();
        unsafe {
          extern "system" {
            fn MessageBoxA(hwnd: *mut std::ffi::c_void, text: *const i8, caption: *const i8, utype: u32) -> i32;
          }
          MessageBoxA(std::ptr::null_mut(), msg.as_ptr(), title.as_ptr(), 0x40 /* MB_ICONINFORMATION */);
        }
      }
      std::process::exit(1);
    }
  }

  tauri::Builder::default()
    .manage(SidecarState(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      sidecar::start_backend,
      sidecar::stop_backend,
      sidecar::is_backend_running,
      sidecar::get_backend_port,
      sidecar::open_log_file,
      sidecar::read_log,
      sidecar::diag_snapshot,
      network::get_local_ip,
      network::check_hotspot_active,
      settings::open_hotspot_settings,
      settings::get_app_version,
    ])
    .system_tray(tray::build_tray())
    .on_system_tray_event(tray::handle_tray_event)
    .on_window_event(|event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
        // Hide instead of close → l'app reste en tray
        event.window().hide().ok();
        api.prevent_close();
      }
    })
    .setup(|_app| {
      // Correction B2 : pas d'auto-start ici. HostPanel.svelte orchestre le
      // démarrage via invoke('start_backend') au mount, après que la WebView
      // soit prête à écouter les events (sinon backend_failed perdu).
      // Idempotence assurée côté front (is_backend_running check) et Rust
      // (Mutex lock + zombie cleanup).
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("erreur Tauri runtime");
}
