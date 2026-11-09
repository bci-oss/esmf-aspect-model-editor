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

//! Opens files and folders in a VS Code compatible editor.

use std::path::Path;
use std::process::Command;

/// URL schemes of the supported editors; each is used as `<scheme>://file/<path>`.
const EDITOR_SCHEMES: [&str; 4] = ["vscode", "vscode-insiders", "cursor", "vscodium"];

/// Command line launchers of the supported editors.
const EDITOR_CLIS: [&str; 4] = ["code", "code-insiders", "cursor", "codium"];

/// How a path is opened if neither the editor URL nor the editor CLI works.
#[derive(Debug, PartialEq, Eq)]
pub enum OsFallback {
    /// Opens the path with its default application (file manager for folders).
    Open,
    /// Lets the user choose an application (Windows "Open with" dialog).
    OpenWith,
}

/// Opens `path` in the editor: first via its URL, then via its CLI and finally with the OS.
/// Runs on the async runtime because launching external programs can block.
#[tauri::command]
pub async fn open_in_external_editor(
    url: String,
    path: String,
    line: Option<u32>,
    column: Option<u32>,
    cli: Option<String>,
) -> Result<(), String> {
    open_external(&url, &path, line, column, cli.as_deref())
}

fn open_external(
    url: &str,
    path: &str,
    line: Option<u32>,
    column: Option<u32>,
    cli: Option<&str>,
) -> Result<(), String> {
    validate_editor_url(url)?;
    validate_path(path)?;
    let program = cli.map(cli_program).transpose()?;

    if open::that(url).is_ok() {
        return Ok(());
    }

    let is_dir = Path::new(path).is_dir();
    if let Some(program) = program {
        if spawn_cli(&program, &cli_args(path, is_dir, line, column)).is_ok() {
            return Ok(());
        }
    }

    match os_fallback(is_dir, cfg!(target_os = "windows")) {
        OsFallback::OpenWith => Command::new("OpenWith.exe")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string()),
        OsFallback::Open => open::that(path).map_err(|e| e.to_string()),
    }
}

/// Accepts only `file` URLs of the supported editors, so the web view cannot launch arbitrary protocols.
pub fn validate_editor_url(url: &str) -> Result<(), String> {
    let has_unsafe_chars = url
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || c == '"');
    let is_editor_file_url = EDITOR_SCHEMES.iter().any(|scheme| {
        url.strip_prefix(scheme)
            .and_then(|rest| rest.strip_prefix("://file/"))
            .is_some_and(|file| !file.is_empty())
    });
    if is_editor_file_url && !has_unsafe_chars {
        Ok(())
    } else {
        Err(format!("Unsupported editor URL: {url}"))
    }
}

/// The path must be absolute; this also prevents it from being read as a CLI option.
pub fn validate_path(path: &str) -> Result<(), String> {
    let is_absolute =
        Path::new(path).is_absolute() || path.starts_with('/') || is_windows_absolute(path);
    if is_absolute && !path.chars().any(|c| c.is_control()) {
        Ok(())
    } else {
        Err(format!("Not an absolute path: {path}"))
    }
}

fn is_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    let is_drive_path = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/');
    is_drive_path || path.starts_with("\\\\")
}

/// The program to start for an allowed editor CLI.
pub fn cli_program(cli: &str) -> Result<String, String> {
    cli_program_for(cli, cfg!(target_os = "windows"))
}

/// VS Code and its forks install a `<cli>.cmd` launcher on Windows; `Command` does not resolve it without extension.
pub fn cli_program_for(cli: &str, windows: bool) -> Result<String, String> {
    if !EDITOR_CLIS.contains(&cli) {
        return Err(format!("Unsupported editor command: {cli}"));
    }
    Ok(if windows {
        format!("{cli}.cmd")
    } else {
        cli.to_string()
    })
}

/// `--goto <file>:<line>[:<column>]` opens a file at a position; folders and files without position are passed as is.
pub fn cli_args(path: &str, is_dir: bool, line: Option<u32>, column: Option<u32>) -> Vec<String> {
    match line.filter(|&l| l > 0) {
        Some(line) if !is_dir => {
            let position = match column.filter(|&c| c > 0) {
                Some(column) => format!("{path}:{line}:{column}"),
                None => format!("{path}:{line}"),
            };
            vec!["--goto".to_string(), position]
        }
        _ => vec![path.to_string()],
    }
}

/// Folders open in the file manager; on Windows files open the "Open with" dialog instead of an unrelated default app.
pub fn os_fallback(is_dir: bool, windows: bool) -> OsFallback {
    if windows && !is_dir {
        OsFallback::OpenWith
    } else {
        OsFallback::Open
    }
}

fn spawn_cli(program: &str, args: &[String]) -> std::io::Result<()> {
    let mut command = Command::new(program);
    command.args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_file_urls_of_all_supported_editors() {
        for url in [
            "vscode://file/Users/me/a.ttl",
            "vscode://file/C:/ws/a.ttl:12:3",
            "vscode://file//server/share/a.ttl",
            "vscode-insiders://file/home/me/a%20b.ttl",
            "cursor://file/home/me/a.ttl",
            "vscodium://file/home/me/a.ttl:1",
        ] {
            assert!(validate_editor_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn rejects_other_schemes_and_targets() {
        for url in [
            "",
            "vscode://",
            "vscode://file/",
            "vscode://settings/foo",
            "vscode://vscode.git/clone?url=x",
            "vscode:file/a.ttl",
            "https://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "notepad://file/a.ttl",
            "xvscode://file/a.ttl",
            "VSCODE://file/a.ttl",
        ] {
            assert!(validate_editor_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn rejects_urls_with_unencoded_whitespace_quotes_or_control_characters() {
        assert!(validate_editor_url("vscode://file/a b.ttl").is_err());
        assert!(validate_editor_url("vscode://file/a.ttl\" --x").is_err());
        assert!(validate_editor_url("vscode://file/a.ttl\n").is_err());
    }

    #[test]
    fn accepts_absolute_paths_of_all_platforms() {
        for path in [
            "/Users/me/a b.ttl",
            "/home/me/ws",
            "C:\\ws\\a.ttl",
            "c:/ws/a.ttl",
            "\\\\server\\share\\a.ttl",
            "//server/share/a.ttl",
        ] {
            assert!(validate_path(path).is_ok(), "{path}");
        }
    }

    #[test]
    fn rejects_relative_paths_and_options() {
        for path in [
            "",
            "a.ttl",
            "ws/a.ttl",
            "--install-extension=x",
            "C:",
            "C:a.ttl",
            "/ws/a\0.ttl",
        ] {
            assert!(validate_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn allows_only_known_editor_commands() {
        for cli in EDITOR_CLIS {
            assert_eq!(cli_program_for(cli, false), Ok(cli.to_string()));
        }
        for cli in ["", "bash", "code;rm", "/usr/bin/code", "code.cmd", "CODE"] {
            assert!(cli_program_for(cli, false).is_err(), "{cli}");
            assert!(cli_program_for(cli, true).is_err(), "{cli}");
        }
    }

    #[test]
    fn uses_the_cmd_launcher_on_windows() {
        assert_eq!(cli_program_for("code", true), Ok("code.cmd".to_string()));
        assert_eq!(
            cli_program_for("code-insiders", true),
            Ok("code-insiders.cmd".to_string())
        );
        assert_eq!(
            cli_program_for("codium", true),
            Ok("codium.cmd".to_string())
        );
    }

    #[test]
    fn cli_program_matches_the_current_platform() {
        let expected = if cfg!(target_os = "windows") {
            "cursor.cmd"
        } else {
            "cursor"
        };
        assert_eq!(cli_program("cursor"), Ok(expected.to_string()));
    }

    #[test]
    fn opens_files_at_the_position() {
        assert_eq!(
            cli_args("/ws/a.ttl", false, Some(12), Some(3)),
            vec!["--goto", "/ws/a.ttl:12:3"]
        );
        assert_eq!(
            cli_args("C:\\ws\\a.ttl", false, Some(1), None),
            vec!["--goto", "C:\\ws\\a.ttl:1"]
        );
        assert_eq!(
            cli_args("/ws/a.ttl", false, Some(4), Some(0)),
            vec!["--goto", "/ws/a.ttl:4"]
        );
    }

    #[test]
    fn opens_files_without_position_and_folders_as_is() {
        assert_eq!(
            cli_args("/ws/a.ttl", false, None, Some(3)),
            vec!["/ws/a.ttl"]
        );
        assert_eq!(
            cli_args("/ws/a.ttl", false, Some(0), None),
            vec!["/ws/a.ttl"]
        );
        assert_eq!(cli_args("/ws", true, Some(3), Some(1)), vec!["/ws"]);
    }

    #[test]
    fn falls_back_to_open_with_for_files_on_windows_only() {
        assert_eq!(os_fallback(false, true), OsFallback::OpenWith);
        assert_eq!(os_fallback(true, true), OsFallback::Open);
        assert_eq!(os_fallback(false, false), OsFallback::Open);
        assert_eq!(os_fallback(true, false), OsFallback::Open);
    }

    #[test]
    fn rejects_invalid_requests_before_opening_anything() {
        assert!(open_external("https://example.com", "/ws/a.ttl", None, None, None).is_err());
        assert!(open_external("vscode://file/ws/a.ttl", "a.ttl", None, None, None).is_err());
        assert!(open_external(
            "vscode://file/ws/a.ttl",
            "/ws/a.ttl",
            None,
            None,
            Some("sh")
        )
        .is_err());
    }
}
