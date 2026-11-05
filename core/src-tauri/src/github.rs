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

//! Access tokens for GitHub sources.
//!
//! Tokens are stored in the credential store of the operating system (macOS Keychain, Windows Credential Manager,
//! Secret Service on Linux) and never handed to the web view: checks and synchronizations of GitHub sources are sent to
//! the backend by this module, which adds the token as request header. If no credential store is available, a token is
//! kept in memory until the app is closed.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::State;

use crate::backend::BackendState;

const KEYRING_SERVICE: &str = "esmf-aspect-model-editor";
const API_PATH: &str = "/ame/api/sources/github";
const BACKEND_TOKEN_HEADER: &str = "X-AME-Token";
const GITHUB_TOKEN_HEADER: &str = "X-AME-GitHub-Token";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Synchronizing large repositories through a slow proxy can take a while.
const READ_TIMEOUT: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub struct GithubTokenState {
    /// Tokens of this session that could not be stored in the credential store.
    session_tokens: Mutex<HashMap<String, String>>,
}

impl GithubTokenState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubTokenInfo {
    pub stored: bool,
    /// `false` if the token is only kept until the app is closed.
    pub persistent: bool,
}

fn account(host: &str) -> Result<String, String> {
    let host = host.trim().to_ascii_lowercase();
    let valid = !host.is_empty()
        && host.len() <= 253
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':');
    if valid {
        Ok(format!("github-token:{host}"))
    } else {
        Err(format!("Invalid GitHub host: {host}"))
    }
}

fn entry(host: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &account(host)?).map_err(|error| error.to_string())
}

fn read_token(state: &GithubTokenState, host: &str) -> Option<String> {
    let key = account(host).ok()?;
    if let Some(token) = state.session_tokens.lock().unwrap().get(&key) {
        return Some(token.clone());
    }
    match entry(host).ok()?.get_password() {
        Ok(token) => Some(token),
        Err(keyring::Error::NoEntry) => None,
        Err(error) => {
            log::warn!("Could not read the GitHub token for {host}: {error}");
            None
        }
    }
}

/// Stores the token for a GitHub host. Returns whether it is stored persistently.
#[tauri::command]
pub fn github_token_set(
    state: State<'_, GithubTokenState>,
    host: String,
    token: String,
) -> Result<GithubTokenInfo, String> {
    let key = account(&host)?;
    let token = token.trim().to_string();
    if token.is_empty() || token.chars().any(|c| c.is_control()) {
        return Err("The token is empty or contains invalid characters.".to_string());
    }
    match entry(&host).and_then(|entry| {
        entry
            .set_password(&token)
            .map_err(|error| error.to_string())
    }) {
        Ok(()) => {
            state.session_tokens.lock().unwrap().remove(&key);
            Ok(GithubTokenInfo {
                stored: true,
                persistent: true,
            })
        }
        Err(error) => {
            log::warn!("No credential store available, keeping the GitHub token for {host} until the app is closed: {error}");
            state.session_tokens.lock().unwrap().insert(key, token);
            Ok(GithubTokenInfo {
                stored: true,
                persistent: false,
            })
        }
    }
}

#[tauri::command]
pub fn github_token_delete(state: State<'_, GithubTokenState>, host: String) -> Result<(), String> {
    let key = account(&host)?;
    state.session_tokens.lock().unwrap().remove(&key);
    match entry(&host)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn github_token_info(
    state: State<'_, GithubTokenState>,
    host: String,
) -> Result<GithubTokenInfo, String> {
    let key = account(&host)?;
    if state.session_tokens.lock().unwrap().contains_key(&key) {
        return Ok(GithubTokenInfo {
            stored: true,
            persistent: false,
        });
    }
    Ok(GithubTokenInfo {
        stored: read_token(&state, &host).is_some(),
        persistent: true,
    })
}

/// Checks or synchronizes a GitHub source through the backend, adding the stored token of the host.
/// Returns the JSON answer of the backend.
#[tauri::command]
pub async fn github_source_action(
    backend_state: State<'_, BackendState>,
    token_state: State<'_, GithubTokenState>,
    id: String,
    host: String,
    action: String,
) -> Result<serde_json::Value, String> {
    if action != "check" && action != "sync" {
        return Err(format!("Unknown action: {action}"));
    }
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
    {
        return Err(format!("Invalid source id: {id}"));
    }
    let status = backend_state.status();
    let port: u16 = status
        .port
        .parse()
        .map_err(|_| "The backend is not available.".to_string())?;
    let mut headers = Vec::new();
    if let Some(token) = status.token {
        headers.push((BACKEND_TOKEN_HEADER, token));
    }
    if let Some(token) = read_token(&token_state, &host) {
        headers.push((GITHUB_TOKEN_HEADER, token));
    }
    let path = format!("{API_PATH}/{id}/{action}");

    let response = tauri::async_runtime::spawn_blocking(move || post(port, &path, &headers))
        .await
        .map_err(|error| error.to_string())??;
    let body: serde_json::Value =
        serde_json::from_slice(&response.body).unwrap_or(serde_json::Value::Null);
    if (200..300).contains(&response.status) {
        Ok(body)
    } else {
        let message = body
            .get("error")
            .and_then(|error| error.get("message"))
            .or_else(|| body.get("message"))
            .and_then(|message| message.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("The backend answered with HTTP {}.", response.status));
        Err(message)
    }
}

#[derive(Debug, PartialEq, Eq)]
struct Response {
    status: u16,
    body: Vec<u8>,
}

/// Minimal HTTP/1.1 client for the local backend; avoids pulling a full HTTP stack into the app.
fn post(port: u16, path: &str, headers: &[(&str, String)]) -> Result<Response, String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, CONNECT_TIMEOUT)
        .map_err(|error| format!("The backend is not reachable: {error}"))?;
    stream
        .set_read_timeout(Some(READ_TIMEOUT))
        .map_err(|error| error.to_string())?;
    let mut request = format!("POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\nContent-Length: 0\r\nConnection: close\r\n");
    for (name, value) in headers {
        if value.contains('\r') || value.contains('\n') {
            return Err(format!("Invalid value for header {name}."));
        }
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    read_response(BufReader::new(stream))
}

fn read_response<R: Read>(mut reader: BufReader<R>) -> Result<Response, String> {
    let invalid = || "Invalid answer from the backend.".to_string();
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    let status = line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(invalid)?;

    let mut content_length = None;
    let mut chunked = false;
    loop {
        line.clear();
        reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;
        let header = line.trim_end();
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            let value = value.trim();
            if name.eq_ignore_ascii_case("content-length") {
                content_length = Some(value.parse::<usize>().map_err(|_| invalid())?);
            } else if name.eq_ignore_ascii_case("transfer-encoding")
                && value.eq_ignore_ascii_case("chunked")
            {
                chunked = true;
            }
        }
    }

    let mut body = Vec::new();
    if chunked {
        loop {
            line.clear();
            reader
                .read_line(&mut line)
                .map_err(|error| error.to_string())?;
            let size_text = line.trim().split(';').next().unwrap_or("");
            let size = usize::from_str_radix(size_text, 16).map_err(|_| invalid())?;
            if size == 0 {
                break;
            }
            let start = body.len();
            body.resize(start + size, 0);
            reader
                .read_exact(&mut body[start..])
                .map_err(|error| error.to_string())?;
            line.clear();
            reader
                .read_line(&mut line)
                .map_err(|error| error.to_string())?;
        }
    } else if let Some(length) = content_length {
        body.resize(length, 0);
        reader
            .read_exact(&mut body)
            .map_err(|error| error.to_string())?;
    } else {
        reader
            .read_to_end(&mut body)
            .map_err(|error| error.to_string())?;
    }
    Ok(Response { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Result<Response, String> {
        read_response(BufReader::new(raw.as_bytes()))
    }

    #[test]
    fn reads_responses_with_content_length() {
        let response = parse(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
        )
        .unwrap();
        assert_eq!(
            Response {
                status: 200,
                body: b"{}".to_vec()
            },
            response
        );
    }

    #[test]
    fn reads_chunked_responses() {
        let response = parse("HTTP/1.1 502 Bad Gateway\r\nTransfer-Encoding: chunked\r\n\r\n3\r\n{\"a\r\n4;x=y\r\n\":1}\r\n0\r\n\r\n").unwrap();
        assert_eq!(502, response.status);
        assert_eq!(b"{\"a\":1}".to_vec(), response.body);
    }

    #[test]
    fn rejects_invalid_status_lines() {
        assert!(parse("garbage\r\n\r\n").is_err());
    }

    #[test]
    fn validates_hosts() {
        assert_eq!("github-token:github.com", account(" GitHub.com ").unwrap());
        assert_eq!(
            "github-token:git.corp.example:8443",
            account("git.corp.example:8443").unwrap()
        );
        assert!(account("").is_err());
        assert!(account("evil host\n").is_err());
    }

    #[test]
    fn rejects_header_injection() {
        let headers = [(GITHUB_TOKEN_HEADER, "abc\r\nX-Evil: 1".to_string())];
        // The header check happens after connecting, so a listener is needed.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(post(port, "/x", &headers)
            .unwrap_err()
            .contains("Invalid value"));
    }
}
