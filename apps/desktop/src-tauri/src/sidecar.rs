//! Sidecar : spawn / kill du binaire backend Node compilé via pkg.
//!
//! Le binaire est packagé sous `binaries/collab-backend-<target-triple>` —
//! Tauri détecte automatiquement la plateforme courante.

use tauri::api::process::{Command, CommandChild, CommandEvent};
use std::sync::Mutex;

pub struct SidecarState(pub Mutex<Option<CommandChild>>);

// Port fixe sidecar Tauri. Choix IANA dynamic range, peu de collisions probables.
// Option C (port dynamique) ciblée post-MVP : voir docs/TAURI-PLAN.md §14.
pub const COLLAB_PORT: u16 = 47931;

#[tauri::command]
pub async fn start_backend(
  app: tauri::AppHandle,
  state: tauri::State<'_, SidecarState>,
) -> Result<bool, String> {
  // Déjà tournant ?
  {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() { return Ok(true); }
  }

  let (mut rx, child) = Command::new_sidecar("collab-backend")
    .map_err(|e| format!("sidecar introuvable : {e}"))?
    .args(["--port", &COLLAB_PORT.to_string()])
    .spawn()
    .map_err(|e| format!("échec spawn sidecar : {e}"))?;

  // Drain les logs en arrière-plan pour debug (sinon le pipe se bloque)
  let _app_clone = app.clone();
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => println!("[backend stdout] {line}"),
        CommandEvent::Stderr(line) => eprintln!("[backend stderr] {line}"),
        CommandEvent::Error(err)   => eprintln!("[backend error] {err}"),
        CommandEvent::Terminated(status) => {
          eprintln!("[backend] process terminated, code={:?}", status.code);
          break;
        }
        _ => {}
      }
    }
  });

  let mut guard = state.0.lock().map_err(|e| e.to_string())?;
  *guard = Some(child);
  Ok(true)
}

#[tauri::command]
pub fn stop_backend(state: tauri::State<'_, SidecarState>) -> bool {
  let mut guard = match state.0.lock() {
    Ok(g) => g, Err(_) => return false,
  };
  if let Some(child) = guard.take() {
    return child.kill().is_ok();
  }
  false
}

#[tauri::command]
pub fn is_backend_running(state: tauri::State<'_, SidecarState>) -> bool {
  state.0.lock().map(|g| g.is_some()).unwrap_or(false)
}

/// Port HTTP du sidecar Collab. Le front l'utilise pour construire l'URL absolue
/// (sinon les fetch relatifs /api/* tapent tauri.localhost qui n'existe pas).
#[tauri::command]
pub fn get_backend_port() -> u16 {
  COLLAB_PORT
}
