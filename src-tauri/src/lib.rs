#[tauri::command]
fn desktop_platform() -> &'static str {
    if cfg!(target_os = "windows") { "windows" } else { "other" }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![desktop_platform])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
