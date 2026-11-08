/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
 *
 * See the AUTHORS file(s) distributed with this work for
 * additional information regarding authorship.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

//! Saves files created in the web view, e.g. exports and generated artifacts.
//!
//! The web view cannot download files: on macOS it does not recognize itself as Safari, so
//! libraries like `file-saver` fall back to navigating to a data URL, which the shell blocks.
//! Instead, the content is sent to the shell, which asks the user where to save it.

use std::path::Path;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Request header with the URI-encoded name proposed for the file.
pub const FILE_NAME_HEADER: &str = "x-file-name";

/// Asks the user where to save the file sent as raw request body and writes it there.
/// Resolves to the path of the saved file, or `None` if the user cancelled.
#[tauri::command]
pub async fn save_file<R: Runtime>(
    window: WebviewWindow<R>,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let file_name = request
        .headers()
        .get(FILE_NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(proposed_file_name)
        .ok_or_else(|| "The file to save has no valid name.".to_string())?;
    let InvokeBody::Raw(content) = request.body() else {
        return Err("The content of the file to save must be sent as raw bytes.".to_string());
    };

    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(&file_name);
    if let Some(extension) = Path::new(&file_name).extension().and_then(|e| e.to_str()) {
        dialog = dialog.add_filter(extension.to_uppercase(), &[extension]);
    }
    // Async commands run on a worker thread, where the blocking dialog is allowed.
    let Some(target) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = target.into_path().map_err(|error| error.to_string())?;
    std::fs::write(&path, content)
        .map_err(|error| format!("Could not save the file to {}: {error}", path.display()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Decodes the proposed file name and keeps only its last path segment, so the web view
/// can only propose a name, never a folder.
fn proposed_file_name(encoded: &str) -> Option<String> {
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    let name = decoded.rsplit(['/', '\\']).next()?.trim();
    (!name.is_empty() && name != "." && name != "..").then(|| name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proposed_file_name_is_decoded() {
        assert_eq!(
            proposed_file_name("Movement%20description.json").as_deref(),
            Some("Movement description.json")
        );
        assert_eq!(
            proposed_file_name("%C3%9Cbersicht.html").as_deref(),
            Some("Übersicht.html")
        );
    }

    #[test]
    fn proposed_file_name_drops_folders() {
        assert_eq!(
            proposed_file_name("..%2F..%2Fetc%2Fpasswd").as_deref(),
            Some("passwd")
        );
        assert_eq!(
            proposed_file_name("C%3A%5Ctemp%5Cmodel.ttl").as_deref(),
            Some("model.ttl")
        );
    }

    #[test]
    fn proposed_file_name_rejects_empty_names() {
        assert_eq!(proposed_file_name(""), None);
        assert_eq!(proposed_file_name("%20"), None);
        assert_eq!(proposed_file_name("folder%2F"), None);
        assert_eq!(proposed_file_name(".."), None);
        assert_eq!(proposed_file_name("%FF"), None);
    }
}
