//! Settings : version de l'app (affichée dans la page diagnostic).

#[tauri::command]
pub fn get_app_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}
