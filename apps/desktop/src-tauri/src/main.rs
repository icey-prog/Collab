#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod settings;
mod tray;

use std::fs;
use std::path::PathBuf;

/// Vérifie cross-plateforme si un PID est toujours en vie.
fn is_pid_alive(pid: u32) -> bool {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("tasklist")
      .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
      .output()
      .ok()
      .and_then(|o| String::from_utf8(o.stdout).ok())
      .map(|s| s.contains(&pid.to_string()))
      .unwrap_or(false)
  }
  #[cfg(target_os = "linux")]
  {
    std::path::Path::new(&format!("/proc/{}", pid)).exists()
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("kill")
      .args(["-0", &pid.to_string()])
      .output()
      .map(|o| o.status.success())
      .unwrap_or(false)
  }
}

/// Empêche une deuxième instance via PID file dans app_data_dir.
fn enforce_single_instance(pid_path: &PathBuf) -> Result<(), String> {
  if let Ok(content) = fs::read_to_string(pid_path) {
    if let Ok(pid) = content.trim().parse::<u32>() {
      if is_pid_alive(pid) {
        return Err(format!(
          "Collab tourne déjà (PID {}). Ouvre la fenêtre depuis l'icône système (tray).",
          pid
        ));
      }
    }
  }
  let our_pid = std::process::id();
  fs::create_dir_all(pid_path.parent().unwrap_or(pid_path)).ok();
  fs::write(pid_path, our_pid.to_string())
    .map_err(|e| format!("PID file écriture échouée: {}", e))?;
  Ok(())
}

fn main() {
  if let Some(local_app_data) = dirs::data_local_dir() {
    let pid_path = local_app_data.join("Collab").join("collab.pid");
    if let Err(e) = enforce_single_instance(&pid_path) {
      eprintln!("[main] {}", e);
      #[cfg(target_os = "windows")]
      {
        use std::ffi::CString;
        let title = CString::new("Collab — Déjà en cours").unwrap();
        let msg = CString::new(e.as_str()).unwrap();
        unsafe {
          extern "system" {
            fn MessageBoxA(hwnd: *mut std::ffi::c_void, text: *const i8, caption: *const i8, utype: u32) -> i32;
          }
          MessageBoxA(std::ptr::null_mut(), msg.as_ptr(), title.as_ptr(), 0x40);
        }
      }
      std::process::exit(1);
    }
  }

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      settings::get_app_version,
    ])
    .system_tray(tray::build_tray())
    .on_system_tray_event(tray::handle_tray_event)
    .on_window_event(|event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
        event.window().hide().ok();
        api.prevent_close();
      }
    })
    .setup(|_app| { Ok(()) })
    .run(tauri::generate_context!())
    .expect("erreur Tauri runtime");
}
