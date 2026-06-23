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
// tauri::Manager retiré : plus utilisé depuis suppression auto-start dans setup() (B2)

fn main() {
  tauri::Builder::default()
    .manage(SidecarState(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      sidecar::start_backend,
      sidecar::stop_backend,
      sidecar::is_backend_running,
      sidecar::get_backend_port,
      sidecar::open_log_file,
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
