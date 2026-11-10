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

//! API keys of the AI providers of the assistant.
//!
//! Keys are stored in the credential store of the operating system (macOS Keychain, Windows Credential Manager,
//! Secret Service on Linux) under one account per provider. If no credential store is available, a key is kept in
//! memory until the app is closed. The web view reads the key to send it with the requests to the local backend,
//! which never stores it. Keys are never logged.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

const KEYRING_SERVICE: &str = "esmf-aspect-model-editor";
const MAX_PROVIDER_LENGTH: usize = 64;
const MAX_SECRET_LENGTH: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSecretInfo {
    pub stored: bool,
    /// `false` if the key is only kept until the app is closed.
    pub persistent: bool,
}

/// Access to the credential store; replaced by an in-memory store in tests.
pub trait SecretBackend: Send + Sync {
    fn set(&self, account: &str, secret: &str) -> Result<(), String>;
    /// `Ok(None)` if there is no entry for the account.
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

/// The credential store of the operating system.
pub struct KeyringBackend;

impl KeyringBackend {
    fn entry(account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYRING_SERVICE, account).map_err(|error| error.to_string())
    }
}

impl SecretBackend for KeyringBackend {
    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        Self::entry(account)?
            .set_password(secret)
            .map_err(|error| error.to_string())
    }

    fn get(&self, account: &str) -> Result<Option<String>, String> {
        match Self::entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

pub struct AiSecretState {
    backend: Box<dyn SecretBackend>,
    /// Keys of this session that could not be stored in the credential store.
    session_secrets: Mutex<HashMap<String, String>>,
}

impl Default for AiSecretState {
    fn default() -> Self {
        Self::with_backend(Box::new(KeyringBackend))
    }
}

impl AiSecretState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_backend(backend: Box<dyn SecretBackend>) -> Self {
        Self {
            backend,
            session_secrets: Mutex::new(HashMap::new()),
        }
    }

    pub fn set(&self, provider: &str, secret: &str) -> Result<AiSecretInfo, String> {
        let key = account(provider)?;
        let secret = validate_secret(secret)?;
        match self.backend.set(&key, &secret) {
            Ok(()) => {
                self.session_secrets.lock().unwrap().remove(&key);
                Ok(AiSecretInfo {
                    stored: true,
                    persistent: true,
                })
            }
            Err(error) => {
                log::warn!(
                    "No credential store available, keeping the AI key for {provider} until the app is closed: {error}"
                );
                self.session_secrets.lock().unwrap().insert(key, secret);
                Ok(AiSecretInfo {
                    stored: true,
                    persistent: false,
                })
            }
        }
    }

    pub fn get(&self, provider: &str) -> Result<Option<String>, String> {
        let key = account(provider)?;
        if let Some(secret) = self.session_secrets.lock().unwrap().get(&key) {
            return Ok(Some(secret.clone()));
        }
        match self.backend.get(&key) {
            Ok(secret) => Ok(secret),
            Err(error) => {
                log::warn!("Could not read the AI key for {provider}: {error}");
                Ok(None)
            }
        }
    }

    pub fn delete(&self, provider: &str) -> Result<(), String> {
        let key = account(provider)?;
        self.session_secrets.lock().unwrap().remove(&key);
        self.backend.delete(&key)
    }

    pub fn info(&self, provider: &str) -> Result<AiSecretInfo, String> {
        let key = account(provider)?;
        if self.session_secrets.lock().unwrap().contains_key(&key) {
            return Ok(AiSecretInfo {
                stored: true,
                persistent: false,
            });
        }
        Ok(AiSecretInfo {
            stored: self.get(provider)?.is_some(),
            persistent: true,
        })
    }
}

/// The account of the key of a provider, e.g. `ai-key:openai`. Provider ids consist of `a-z`, `0-9` and `-`.
fn account(provider: &str) -> Result<String, String> {
    let provider = provider.trim();
    let valid = !provider.is_empty()
        && provider.len() <= MAX_PROVIDER_LENGTH
        && provider
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if valid {
        Ok(format!("ai-key:{provider}"))
    } else {
        Err("Invalid AI provider id.".to_string())
    }
}

/// Keys are sent as HTTP header, so they must not contain control characters (header injection).
fn validate_secret(secret: &str) -> Result<String, String> {
    let secret = secret.trim();
    if secret.is_empty()
        || secret.len() > MAX_SECRET_LENGTH
        || secret.chars().any(|c| c.is_control())
    {
        return Err("The key is empty or contains invalid characters.".to_string());
    }
    Ok(secret.to_string())
}

#[tauri::command]
pub fn ai_secret_set(
    state: State<'_, AiSecretState>,
    provider: String,
    secret: String,
) -> Result<AiSecretInfo, String> {
    state.set(&provider, &secret)
}

#[tauri::command]
pub fn ai_secret_get(
    state: State<'_, AiSecretState>,
    provider: String,
) -> Result<Option<String>, String> {
    state.get(&provider)
}

#[tauri::command]
pub fn ai_secret_delete(state: State<'_, AiSecretState>, provider: String) -> Result<(), String> {
    state.delete(&provider)
}

#[tauri::command]
pub fn ai_secret_info(
    state: State<'_, AiSecretState>,
    provider: String,
) -> Result<AiSecretInfo, String> {
    state.info(&provider)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[derive(Default)]
    struct MemoryBackend {
        entries: Mutex<HashMap<String, String>>,
        unavailable: bool,
    }

    impl SecretBackend for Arc<MemoryBackend> {
        fn set(&self, account: &str, secret: &str) -> Result<(), String> {
            if self.unavailable {
                return Err("no keychain".to_string());
            }
            self.entries
                .lock()
                .unwrap()
                .insert(account.to_string(), secret.to_string());
            Ok(())
        }

        fn get(&self, account: &str) -> Result<Option<String>, String> {
            if self.unavailable {
                return Err("no keychain".to_string());
            }
            Ok(self.entries.lock().unwrap().get(account).cloned())
        }

        fn delete(&self, account: &str) -> Result<(), String> {
            self.entries.lock().unwrap().remove(account);
            Ok(())
        }
    }

    fn state(unavailable: bool) -> (AiSecretState, Arc<MemoryBackend>) {
        let backend = Arc::new(MemoryBackend {
            unavailable,
            ..Default::default()
        });
        (
            AiSecretState::with_backend(Box::new(backend.clone())),
            backend,
        )
    }

    #[test]
    fn ai_accounts_are_validated() {
        assert_eq!("ai-key:openai", account("openai").unwrap());
        assert_eq!("ai-key:azure-openai", account(" azure-openai ").unwrap());
        assert!(account("").is_err());
        assert!(account("OpenAI").is_err());
        assert!(account("open ai").is_err());
        assert!(account("x:y").is_err());
        assert!(account(&"a".repeat(MAX_PROVIDER_LENGTH + 1)).is_err());
    }

    #[test]
    fn ai_secrets_are_validated() {
        assert_eq!("sk-123", validate_secret("  sk-123\n").unwrap());
        assert!(validate_secret("   ").is_err());
        assert!(validate_secret("abc\r\nX-Evil: 1").is_err());
        assert!(validate_secret(&"a".repeat(MAX_SECRET_LENGTH + 1)).is_err());
    }

    #[test]
    fn ai_secrets_are_stored_in_the_credential_store() {
        let (state, backend) = state(false);
        assert_eq!(
            AiSecretInfo {
                stored: true,
                persistent: true
            },
            state.set("openai", "sk-1").unwrap()
        );
        assert_eq!(
            Some("sk-1".to_string()),
            backend
                .entries
                .lock()
                .unwrap()
                .get("ai-key:openai")
                .cloned()
        );
        assert_eq!(Some("sk-1".to_string()), state.get("openai").unwrap());
        assert!(state.info("openai").unwrap().stored);
        assert_eq!(None, state.get("anthropic").unwrap());
        assert!(!state.info("anthropic").unwrap().stored);

        state.delete("openai").unwrap();
        assert_eq!(None, state.get("openai").unwrap());
        assert!(!state.info("openai").unwrap().stored);
    }

    #[test]
    fn ai_secrets_fall_back_to_the_session_without_credential_store() {
        let (state, _backend) = state(true);
        assert_eq!(
            AiSecretInfo {
                stored: true,
                persistent: false
            },
            state.set("anthropic", "key").unwrap()
        );
        assert_eq!(Some("key".to_string()), state.get("anthropic").unwrap());
        assert_eq!(
            AiSecretInfo {
                stored: true,
                persistent: false
            },
            state.info("anthropic").unwrap()
        );
        state.delete("anthropic").unwrap();
        assert_eq!(None, state.get("anthropic").unwrap());
    }

    #[test]
    fn ai_invalid_input_is_rejected() {
        let (state, _backend) = state(false);
        assert!(state.set("Bad Id", "key").is_err());
        assert!(state.set("openai", "").is_err());
        assert!(state.get("../x").is_err());
        assert!(state.delete("").is_err());
    }
}
