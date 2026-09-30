// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize, Clone)]
struct AppReady {
    version: String,
    platform: String,
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let info = AppReady {
                version: app.package_info().version.to_string(),
                platform: std::env::consts::OS.to_string(),
            };
            let _ = app.emit("scf://app-ready", &info);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_version, notify])
        .run(tauri::generate_context!())
        .expect("erro ao executar o SCF Desktop");
}
