use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// .lite files the app was asked to open (double-clicked, "Open with", or
/// dropped on the icon) that the window hasn't picked up yet.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

/// Keeps the arguments that are existing .lite files, as absolute paths.
fn lite_paths<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
  args
    .into_iter()
    .filter(|a| a.to_lowercase().ends_with(".lite"))
    .filter_map(|a| std::fs::canonicalize(&a).ok())
    .map(|p| p.to_string_lossy().into_owned())
    .collect()
}

/// Lets the window read exactly these files, wherever they are on disk.
fn queue(app: &tauri::AppHandle, files: Vec<String>) {
  if files.is_empty() {
    return;
  }
  let scope = app.fs_scope();
  for f in &files {
    let _ = scope.allow_file(f);
  }
  app.state::<PendingFiles>().0.lock().unwrap().extend(files);
  let _ = app.emit("open-files", ());
}

/// Android: writes bytes to a file picked in the system file dialog. Those are
/// `content://` URIs, which only Android's content resolver can open.
/// The bytes are the raw request body; the URI comes in the `path` header.
#[tauri::command]
fn write_uri(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
  use std::io::Write;
  let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
    return Err("expected raw bytes".into());
  };
  let uri = request
    .headers()
    .get("path")
    .and_then(|v| v.to_str().ok())
    .ok_or("missing path")?;
  let url = tauri::Url::parse(uri).map_err(|e| e.to_string())?;
  let mut opts = tauri_plugin_fs::OpenOptions::new();
  opts.read(false).write(true).truncate(true).create(true);
  let mut file = app
    .fs()
    .open(tauri_plugin_fs::FilePath::Url(url), opts)
    .map_err(|e| e.to_string())?;
  file.write_all(data).map_err(|e| e.to_string())?;
  file.flush().map_err(|e| e.to_string())
}

/// Android: reads a file picked in the system file dialog (a `content://` URI).
#[tauri::command]
fn read_uri(app: tauri::AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
  use std::io::Read;
  let url = tauri::Url::parse(&path).map_err(|e| e.to_string())?;
  let mut file = app
    .fs()
    .open(tauri_plugin_fs::FilePath::Url(url), tauri_plugin_fs::OpenOptions::new())
    .map_err(|e| e.to_string())?;
  let mut buf = Vec::new();
  file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(buf))
}

/// Called by the window to collect files waiting to be opened.
#[tauri::command]
fn take_open_files(state: tauri::State<PendingFiles>) -> Vec<String> {
  std::mem::take(&mut *state.0.lock().unwrap())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init());
  // Self-updating (and restarting afterwards) is a desktop feature.
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());
  builder
    .manage(PendingFiles::default())
    .invoke_handler(tauri::generate_handler![take_open_files, write_uri, read_uri])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Windows and Linux pass double-clicked files on the command line.
      queue(app.handle(), lite_paths(std::env::args().skip(1)));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // macOS sends double-clicked files as an event instead.
      #[cfg(any(target_os = "macos", target_os = "ios"))]
      if let tauri::RunEvent::Opened { urls } = &event {
        let files = urls
          .iter()
          .filter_map(|u| u.to_file_path().ok())
          .map(|p| p.to_string_lossy().into_owned());
        queue(app, lite_paths(files));
      }
      let _ = (app, &event);
    });
}
