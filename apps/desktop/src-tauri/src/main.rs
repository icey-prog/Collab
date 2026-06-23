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
use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .manage(SidecarState(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      sidecar::start_backend,
      sidecar::stop_backend,
      sidecar::is_backend_running,
      sidecar::get_backend_port,
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
    .setup(|app| {
      // Auto-start backend au lancement (best-effort)
      let handle = app.handle();
      tauri::async_runtime::spawn(async move {
        let state: tauri::State<SidecarState> = handle.state();
        let _ = sidecar::start_backend(handle.clone(), state).await;
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("erreur Tauri runtime");
}
