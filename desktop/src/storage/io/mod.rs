use crate::storage::models::{
    CollectionConfig, CollectionMeta, CollectionRecord, CollectionStateFile, EnvVar, EnvVarsResult,
    RequestRecord, WorkspaceFile, WorkspaceInfo, WorkspaceRecord,
};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const WORKSPACE_FILE_NAME: &str = "workspace.json";
pub const COLLECTION_CONFIG_FILE_NAME: &str = "collection.json";
pub const COLLECTION_STATE_FILE_NAME: &str = ".kivo-collection-state.json";

pub fn parse_env_file_ordered(path: &Path) -> Vec<EnvVar> {
    let Ok(content) = fs::read_to_string(path) else {
        return vec![];
    };
    let mut seen = std::collections::HashSet::new();
    let mut vars = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            if key.is_empty() || seen.contains(&key) {
                continue;
            }
            let raw_val = line[eq_pos + 1..].trim();
            let value = if (raw_val.starts_with('"') && raw_val.ends_with('"'))
                || (raw_val.starts_with('\'') && raw_val.ends_with('\''))
            {
                raw_val[1..raw_val.len() - 1].to_string()
            } else {
                raw_val.to_string()
            };
            seen.insert(key.clone());
            vars.push(EnvVar { key, value });
        }
    }
    vars
}

pub fn parse_env_file(path: &Path) -> HashMap<String, String> {
    parse_env_file_ordered(path)
        .into_iter()
        .map(|v| (v.key, v.value))
        .collect()
}

pub fn write_env_file(path: &Path, vars: &[EnvVar]) -> Result<(), String> {
    let lines: Vec<String> = vars
        .iter()
        .filter(|v| !v.key.trim().is_empty())
        .map(|v| format!("{}={}", v.key.trim(), v.value))
        .collect();
    let content = if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    };
    fs::write(path, content).map_err(|e| format!("Failed to write .env: {e}"))
}

pub fn ensure_env_and_gitignore(dir: &Path) {
    let env_path = dir.join(".env");
    if !env_path.exists() {
        let _ = fs::write(&env_path, "");
    }
    let gitignore_path = dir.join(".gitignore");
    if !gitignore_path.exists() {
        let _ = fs::write(&gitignore_path, ".env\n");
    } else if let Ok(content) = fs::read_to_string(&gitignore_path) {
        if !content.lines().any(|l| l.trim() == ".env") {
            let appended = format!("{}\n.env\n", content.trim_end());
            let _ = fs::write(&gitignore_path, appended);
        }
    }
}

pub fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn get_collection_dir(root: &Path, workspace_name: &str, collection_name: &str) -> PathBuf {
    root.join(workspace_name)
        .join("collections")
        .join(sanitize_name(collection_name))
}

fn is_reserved_collection_json(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map_or(false, |name| {
            name == COLLECTION_CONFIG_FILE_NAME || name == COLLECTION_STATE_FILE_NAME
        })
}

pub fn collection_subdir_path(collection_path: &Path, folder_path: &str) -> PathBuf {
    let mut path = collection_path.to_path_buf();
    for segment in folder_path.split(['/', '\\']) {
        let trimmed = segment.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
            continue;
        }
        let safe_segment = sanitize_name(trimmed);
        if safe_segment.is_empty() {
            continue;
        }
        path.push(safe_segment);
    }
    path
}

pub fn collect_request_json_files(collection_path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut stack = vec![collection_path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|e| format!("Failed to read collection directory: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read request entry: {e}"))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            if path.is_file()
                && path.extension().map_or(false, |ext| ext == "json")
                && !is_reserved_collection_json(&path)
            {
                files.push(path);
            }
        }
    }

    Ok(files)
}

pub fn cleanup_empty_collection_dirs(collection_path: &Path) -> Result<(), String> {
    let mut dirs = Vec::new();
    let mut stack = vec![collection_path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|e| format!("Failed to read collection directory: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
            let path = entry.path();
            if path.is_dir() {
                dirs.push(path.clone());
                stack.push(path);
            }
        }
    }

    dirs.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
    for dir in dirs {
        if fs::read_dir(&dir)
            .map_err(|e| format!("Failed to read directory: {e}"))?
            .next()
            .is_none()
        {
            let _ = fs::remove_dir(&dir);
        }
    }

    Ok(())
}

pub fn infer_folder_path_from_location(collection_path: &Path, request_path: &Path) -> String {
    let parent = match request_path.parent() {
        Some(parent) => parent,
        None => return String::new(),
    };

    let relative = match parent.strip_prefix(collection_path) {
        Ok(relative) => relative,
        Err(_) => return String::new(),
    };

    let mut segments = Vec::new();
    for component in relative.components() {
        if let Component::Normal(segment) = component {
            segments.push(segment.to_string_lossy().to_string());
        }
    }

    segments.join("/")
}

pub fn load_env_vars(
    workspace_path: &Path,
    collection_path: Option<&Path>,
) -> HashMap<String, String> {
    let mut vars = parse_env_file(&workspace_path.join(".env"));
    if let Some(col_path) = collection_path {
        for (k, v) in parse_env_file(&col_path.join(".env")) {
            vars.insert(k, v);
        }
    }
    vars
}

pub fn load_collection_config_from_path(collection_path: &Path) -> CollectionConfig {
    let path = collection_path.join(COLLECTION_CONFIG_FILE_NAME);
    let Ok(json) = fs::read_to_string(&path) else {
        return CollectionConfig::default();
    };
    serde_json::from_str(&json).unwrap_or_default()
}

pub fn fs_load_workspaces(root: &Path) -> Result<Vec<WorkspaceRecord>, String> {
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut workspaces = Vec::new();
    let entries = fs::read_dir(root).map_err(|e| format!("Failed to read storage root: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let ws_file_path = path.join(WORKSPACE_FILE_NAME);
        if !ws_file_path.exists() {
            continue;
        }
        let ws_json = fs::read_to_string(&ws_file_path)
            .map_err(|e| format!("Failed to read workspace.json: {e}"))?;
        let ws_file: WorkspaceFile = serde_json::from_str(&ws_json)
            .map_err(|e| format!("Failed to parse workspace.json: {e}"))?;
        let mut collections = Vec::new();
        for col_meta in ws_file.collections {
            let CollectionMeta {
                name: collection_name,
                path: collection_path,
                folders: mut collection_folders,
                folder_settings: mut collection_folder_settings,
            } = col_meta;
            let col_meta_path = PathBuf::from(&collection_path);
            let col_path = if col_meta_path.is_absolute() {
                col_meta_path
            } else {
                path.join(&collection_path)
            };
            if !col_path.exists() || !col_path.is_dir() {
                continue;
            }
            let mut requests = Vec::new();
            for req_path in collect_request_json_files(&col_path)? {
                let req_json = fs::read_to_string(&req_path)
                    .map_err(|e| format!("Failed to read request file: {e}"))?;
                match serde_json::from_str::<RequestRecord>(&req_json) {
                    Ok(mut request) => {
                        if request.folder_path.trim().is_empty() {
                            request.folder_path =
                                infer_folder_path_from_location(&col_path, &req_path);
                        }
                        requests.push(request);
                    }
                    Err(e) => eprintln!("Skipping malformed request file {:?}: {e}", req_path),
                }
            }
            if collection_folders.is_empty() && collection_folder_settings.is_empty() {
                let collection_state = {
                    let state_path = col_path.join(COLLECTION_STATE_FILE_NAME);
                    if state_path.exists() {
                        fs::read_to_string(&state_path)
                            .ok()
                            .and_then(|json| serde_json::from_str::<CollectionStateFile>(&json).ok())
                            .unwrap_or_default()
                    } else {
                        CollectionStateFile::default()
                    }
                };
                collection_folders = collection_state.folders;
                collection_folder_settings = collection_state.folder_settings;
            }

            collections.push(CollectionRecord {
                name: collection_name,
                folders: collection_folders,
                folder_settings: collection_folder_settings,
                requests,
            });
        }
        workspaces.push(WorkspaceRecord {
            name: ws_file.info.name,
            description: ws_file.info.description,
            collections,
        });
    }
    Ok(workspaces)
}

pub fn fs_save_workspaces(root: &Path, workspaces: &[WorkspaceRecord]) -> Result<(), String> {
    if !root.exists() {
        fs::create_dir_all(root).map_err(|e| format!("Failed to create storage root: {e}"))?;
    }
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let dir_name = entry.file_name().to_string_lossy().to_string();
                if path.join(WORKSPACE_FILE_NAME).exists()
                    && !workspaces.iter().any(|w| w.name == dir_name)
                {
                    let _ = fs::remove_dir_all(&path);
                }
            }
        }
    }
    for workspace in workspaces {
        let ws_path = root.join(&workspace.name);
        if !ws_path.exists() {
            fs::create_dir_all(&ws_path)
                .map_err(|e| format!("Failed to create workspace directory: {e}"))?;
        }
        ensure_env_and_gitignore(&ws_path);
        let collections_root = ws_path.join("collections");
        if !collections_root.exists() {
            fs::create_dir_all(&collections_root)
                .map_err(|e| format!("Failed to create collections dir: {e}"))?;
        }
        if let Ok(entries) = fs::read_dir(&collections_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if !workspace
                        .collections
                        .iter()
                        .any(|c| sanitize_name(&c.name) == dir_name)
                    {
                        let _ = fs::remove_dir_all(&path);
                    }
                }
            }
        }
        let mut collections_meta = Vec::new();
        for collection in &workspace.collections {
            let safe_col = sanitize_name(&collection.name);
            let col_dir_name = format!("collections/{}", safe_col);
            let col_path = ws_path.join(&col_dir_name);
            if !col_path.exists() {
                fs::create_dir_all(&col_path)
                    .map_err(|e| format!("Failed to create collection directory: {e}"))?;
            }
            ensure_env_and_gitignore(&col_path);
            for req_path in collect_request_json_files(&col_path)? {
                let _ = fs::remove_file(req_path);
            }
            cleanup_empty_collection_dirs(&col_path)?;

            for folder_path in &collection.folders {
                let dir_path = collection_subdir_path(&col_path, folder_path);
                if !dir_path.exists() {
                    fs::create_dir_all(&dir_path)
                        .map_err(|e| format!("Failed to create folder directory: {e}"))?;
                }
            }

            for request in &collection.requests {
                let safe_req = sanitize_name(&request.name);
                let req_dir = collection_subdir_path(&col_path, &request.folder_path);
                if !req_dir.exists() {
                    fs::create_dir_all(&req_dir)
                        .map_err(|e| format!("Failed to create request directory: {e}"))?;
                }
                let req_path = req_dir.join(format!("{}.json", safe_req));
                let req_json = serde_json::to_string_pretty(request)
                    .map_err(|e| format!("Failed to serialize request: {e}"))?;
                fs::write(req_path, req_json)
                    .map_err(|e| format!("Failed to write request file: {e}"))?;
            }

            let legacy_state_path = col_path.join(COLLECTION_STATE_FILE_NAME);
            if legacy_state_path.exists() {
                let _ = fs::remove_file(legacy_state_path);
            }

            collections_meta.push(CollectionMeta {
                name: collection.name.clone(),
                path: col_dir_name,
                folders: collection.folders.clone(),
                folder_settings: collection.folder_settings.clone(),
            });
        }
        let ws_file = WorkspaceFile {
            info: WorkspaceInfo {
                name: workspace.name.clone(),
                resource_type: "workspace".to_string(),
                description: workspace.description.clone(),
            },
            collections: collections_meta,
        };
        let ws_json = serde_json::to_string_pretty(&ws_file)
            .map_err(|e| format!("Failed to serialize workspace.json: {e}"))?;
        fs::write(ws_path.join(WORKSPACE_FILE_NAME), ws_json)
            .map_err(|e| format!("Failed to write workspace.json: {e}"))?;
    }
    Ok(())
}

pub fn fs_get_env_vars(
    root: &Path,
    workspace_name: &str,
    collection_name: Option<&str>,
) -> EnvVarsResult {
    let ws_path = root.join(workspace_name);
    let workspace_vars = parse_env_file_ordered(&ws_path.join(".env"));
    let collection_vars = match collection_name {
        Some(col) => {
            let col_path = get_collection_dir(root, workspace_name, col);
            parse_env_file_ordered(&col_path.join(".env"))
        }
        None => vec![],
    };
    let mut merged = HashMap::new();
    for v in &workspace_vars {
        merged.insert(v.key.clone(), v.value.clone());
    }
    for v in &collection_vars {
        merged.insert(v.key.clone(), v.value.clone());
    }
    EnvVarsResult {
        workspace: workspace_vars,
        collection: collection_vars,
        merged,
    }
}

pub fn fs_save_env_vars(
    root: &Path,
    workspace_name: &str,
    collection_name: Option<&str>,
    vars: &[EnvVar],
) -> Result<(), String> {
    let env_path = match collection_name {
        Some(col) => {
            let col_path = get_collection_dir(root, workspace_name, col);
            if !col_path.exists() {
                fs::create_dir_all(&col_path)
                    .map_err(|e| format!("Failed to create collection dir: {e}"))?;
            }
            col_path.join(".env")
        }
        None => {
            let ws_path = root.join(workspace_name);
            if !ws_path.exists() {
                return Err(format!("Workspace '{}' does not exist", workspace_name));
            }
            ws_path.join(".env")
        }
    };
    write_env_file(&env_path, vars)
}

pub fn fs_save_collection_config(
    root: &Path,
    workspace_name: &str,
    collection_name: &str,
    config: &CollectionConfig,
) -> Result<(), String> {
    let col_path = get_collection_dir(root, workspace_name, collection_name);
    if !col_path.exists() {
        fs::create_dir_all(&col_path)
            .map_err(|e| format!("Failed to create collection dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize collection config: {e}"))?;
    fs::write(col_path.join(COLLECTION_CONFIG_FILE_NAME), json)
        .map_err(|e| format!("Failed to write collection.json: {e}"))
}
