//! Tray icon : permet de laisser l'app tourner en arrière-plan.

use tauri::{
  CustomMenuItem, Manager, SystemTray, SystemTrayEvent,
  SystemTrayMenu, SystemTrayMenuItem,
};

pub fn build_tray() -> SystemTray {
  let open = CustomMenuItem::new("open".to_string(), "Ouvrir Collab");
  let quit = CustomMenuItem::new("quit".to_string(), "Quitter");

  let menu = SystemTrayMenu::new()
    .add_item(open)
    .add_native_item(SystemTrayMenuItem::Separator)
    .add_item(quit);

  SystemTray::new().with_menu(menu)
}

pub fn handle_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
  match event {
    SystemTrayEvent::LeftClick { .. } | SystemTrayEvent::DoubleClick { .. } => {
      if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }
    SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
      "open" => {
        if let Some(window) = app.get_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
      }
      "quit" => {
        app.exit(0);
      }
      _ => {}
    },
    _ => {}
  }
}
