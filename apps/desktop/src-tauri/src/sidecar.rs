//! Sidecar : spawn / kill du binaire backend Node compilé via pkg.
//!
//! Le binaire est packagé sous `binaries/collab-backend-<target-triple>` —
//! Tauri détecte automatiquement la plateforme courante.

use tauri::api::process::{Command, CommandChild, CommandEvent};
use std::sync::Mutex;
use tauri::Manager;
use std::fs::OpenOptions;
use std::io::Write;

pub struct SidecarState(pub Mutex<Option<CommandChild>>);

// Port fixe sidecar Tauri. Choix IANA dynamic range, peu de collisions probables.
// Option C (port dynamique) ciblée post-MVP : voir docs/TAURI-PLAN.md §14.
pub const COLLAB_PORT: u16 = 47931;

pub fn get_log_path(app: &tauri::AppHandle) -> String {
  app.path_resolver().app_log_dir()
    .or_else(|| app.path_resolver().app_data_dir())
    .map(|mut p| {
      let _ = std::fs::create_dir_all(&p);
      p.push("collab-backend.log");
      p.to_string_lossy().into_owned()
    })
    .unwrap_or_else(|| "collab-backend.log".to_string())
}

fn log_to_file(app: &tauri::AppHandle, message: &str) {
  let log_path = get_log_path(app);
  if let Ok(mut file) = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&log_path)
  {
    let timestamp = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
      Ok(d) => d.as_secs(),
      Err(_) => 0,
    };
    let _ = writeln!(file, "[{}] {}", timestamp, message);
  }
}

#[tauri::command]
pub fn open_log_file(app: tauri::AppHandle) {
  let log_path = get_log_path(&app);
  let _ = tauri::api::shell::open(&app.shell_scope(), log_path, None);
}

/// Vérifie si le port est libre en tentant un bind TCP.
/// Retourne true si le port est LIBRE, false s'il est occupé.
fn is_port_free(port: u16) -> bool {
  std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok()
}

/// Tue tous les processus occupant le port donné via netstat (Windows).
/// Retourne le nombre de processus tués.
fn kill_processes_on_port(port: u16) -> usize {
  let output = std::process::Command::new("netstat")
    .args(["-ano"])
    .output();

  let Ok(out) = output else { return 0 };
  let stdout = String::from_utf8_lossy(&out.stdout);

  let port_str = format!(":{}", port);
  let mut killed = 0usize;

  for line in stdout.lines() {
    // Filtre les lignes LISTENING sur ce port
    if !line.contains(&port_str) || !line.contains("LISTENING") {
      continue;
    }
    // Dernier token = PID
    let pid_str = line.split_whitespace().last().unwrap_or("0");
    let pid: u32 = pid_str.parse().unwrap_or(0);
    if pid == 0 { continue; }

    // Tente de tuer via taskkill /F /PID
    let _ = std::process::Command::new("taskkill")
      .args(["/F", "/PID", &pid.to_string()])
      .output();
    killed += 1;
    eprintln!("[sidecar] killed zombie PID {} on port {}", pid, port);
  }
  killed
}

#[tauri::command]
pub async fn start_backend(
  app: tauri::AppHandle,
  state: tauri::State<'_, SidecarState>,
) -> Result<bool, String> {
  // Étape 1 : early-return idempotent — check si déjà tournant, release guard
  // avant tout await (std::sync::MutexGuard est !Send).
  {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() { return Ok(true); }
  }

  let log_path = get_log_path(&app);
  log_to_file(&app, &format!("--- Tentative de démarrage du sidecar (Port: {}) ---", COLLAB_PORT));

  // Étape 2 : zombie cleanup async (Correction B3 — pas de guard MutexGuard
  // tenu pendant le sleep, ce qui sinon casserait Send sur la future).
  if !is_port_free(COLLAB_PORT) {
    log_to_file(&app, &format!("[warn] port {} occupé — tentative de libération...", COLLAB_PORT));
    let killed = kill_processes_on_port(COLLAB_PORT);
    log_to_file(&app, &format!("[warn] {} processus tué(s) sur port {}", killed, COLLAB_PORT));

    let mut freed = false;
    for _ in 0..6 {
      // spawn_blocking : dédie un thread du pool blocking aux ops sync (sleep),
      // libère le worker tokio principal pour la UI.
      tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
      }).await.ok();
      if is_port_free(COLLAB_PORT) {
        freed = true;
        break;
      }
    }
    if !freed {
      let err = format!(
        "Port {} toujours occupé après tentative de libération. Fermez l'application depuis la barre des tâches (clic droit → Quitter) puis relancez.",
        COLLAB_PORT
      );
      log_to_file(&app, &format!("[error] {}", err));
      return Err(err);
    }
    log_to_file(&app, &format!("[info] port {} libéré avec succès", COLLAB_PORT));
  }

  // Étape 3 : re-take le lock pour le spawn (pas d'await après ce point).
  let mut guard = state.0.lock().map_err(|e| e.to_string())?;
  // Double-check : un autre invoke parallèle a pu spawn entre temps.
  if guard.is_some() { return Ok(true); }

  let (mut rx, child) = Command::new_sidecar("collab-backend")
    .map_err(|e| {
      let err_msg = format!("sidecar introuvable : {e}");
      log_to_file(&app, &format!("[error] {}", err_msg));
      err_msg
    })?
    .args(["--port", &COLLAB_PORT.to_string()])
    .spawn()
    .map_err(|e| {
      let err_msg = format!("échec spawn sidecar (Bloqué par Antivirus ?) : {e}");
      eprintln!("[backend error] {}", err_msg);
      log_to_file(&app, &format!("[error] {}", err_msg));
      err_msg
    })?;

  // Drain les logs en arrière-plan pour debug et écriture dans le fichier de log
  let app_clone = app.clone();
  let log_path_clone = log_path.clone();
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => {
          println!("[backend stdout] {line}");
          log_to_file(&app_clone, &format!("[stdout] {line}"));
        }
        CommandEvent::Stderr(line) => {
          eprintln!("[backend stderr] {line}");
          log_to_file(&app_clone, &format!("[stderr] {line}"));
        }
        CommandEvent::Error(err) => {
          eprintln!("[backend error] {err}");
          log_to_file(&app_clone, &format!("[error] {err}"));
        }
        CommandEvent::Terminated(status) => {
          let code_str = match status.code {
            Some(c) => c.to_string(),
            None => "inconnu".to_string(),
          };
          let err_msg = format!(
            "Le processus backend s'est arrêté de manière inattendue (code de sortie: {}). Les logs sont disponibles dans : {}",
            code_str,
            log_path_clone
          );
          eprintln!("[backend] {}", err_msg);
          log_to_file(&app_clone, &format!("[terminated] code={}", code_str));
          let _ = app_clone.emit_all("backend_failed", err_msg);
          break;
        }
        _ => {}
      }
    }
  });

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
