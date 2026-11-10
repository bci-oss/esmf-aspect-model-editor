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

import {OpenModelsSnapshot} from './startup-options';

export interface TauriContextMenuPayload {
  href: string | null;
}

export type BackendPhase = 'starting' | 'ready' | 'failed';

export interface BackendStatus {
  state: BackendPhase;
  port: string;
  message: string | null;
  /** Secret for the `X-AME-Token` header; absent when the backend was started externally (development). */
  token?: string | null;
  /** Increases with every change; used to drop out-of-order updates. */
  revision: number;
}

export interface ExternalEditorRequest {
  /** Editor URL, e.g. `vscode://file/C:/ws/a.ttl:3:1`. */
  url: string;
  /** Absolute OS path of the file or folder. */
  path: string;
  line?: number;
  column?: number;
  /** Command line launcher of the editor, e.g. `code`. */
  cli?: string;
}

export interface TauriApi {
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, cb: (...args: any[]) => void): void;
  removeListener(listener: string, cb: (...args: any[]) => void): void;
  getBackendPort(): Promise<string>;
  getBackendStatus(): Promise<BackendStatus>;
  retryBackendStart(): Promise<BackendStatus>;
  quitApp(): Promise<void>;
  openPrintWindow(filePath: string): Promise<unknown>;
  writePrintFile(content: string): Promise<string>;
  openExternalLink(link: string): Promise<void> | boolean;
  showContextMenu(payload: TauriContextMenuPayload): void;
  /** Opens a file (at a position) or folder in a VS Code compatible editor; falls back to the editor CLI and then to the OS. */
  openInExternalEditor(request: ExternalEditorRequest): Promise<void>;
  copyToClipboard(text: string): void;
  /** The workspace models open in each window. Optional: older shells do not report them. */
  getOpenModels?(): Promise<OpenModelsSnapshot>;
  /** Opens the native folder picker; resolves to null if cancelled. */
  pickDirectory?(title?: string): Promise<string | null>;
  /** Stores a GitHub token in the OS keychain (session memory if no keychain is available). */
  githubTokenSet?(host: string, token: string): Promise<GithubTokenInfo>;
  githubTokenDelete?(host: string): Promise<void>;
  githubTokenInfo?(host: string): Promise<GithubTokenInfo>;
  /** Checks or synchronizes a GitHub source; the shell adds the stored token, so it never reaches the web view. */
  githubSourceAction?<T = unknown>(id: string, host: string, action: 'check' | 'sync'): Promise<T>;
  /** Stores the API key of an AI provider in the OS keychain (session memory if no keychain is available). */
  aiSecretSet?(provider: string, secret: string): Promise<AiSecretInfo>;
  /** The stored API key of an AI provider, or null. */
  aiSecretGet?(provider: string): Promise<string | null>;
  aiSecretDelete?(provider: string): Promise<void>;
  aiSecretInfo?(provider: string): Promise<AiSecretInfo>;
  /** Asks the user where to save the file and writes it; resolves to its path, or null if cancelled. */
  saveFile?(fileName: string, content: Blob): Promise<string | null>;
  /** Restarts the backend started by the shell, e.g. to load installed plugins. Rejects if it was started externally. */
  reloadBackend?(): Promise<BackendStatus>;
  /** Replaces the plugin entries of the application menu. */
  setPluginMenu?(menu: PluginMenuPayload): Promise<void>;
}

/** Where a plugin entry appears in the application menu. */
export type PluginMenuLocation = 'file/import' | 'generate' | 'plugins';

export interface PluginMenuPayload {
  /** Title of the "Plugins" menu in the current language. */
  title: string;
  entries: PluginMenuPayloadEntry[];
}

export interface PluginMenuPayloadEntry {
  pluginId: string;
  entryId: string;
  /** Label in the current language. */
  label: string;
  location: PluginMenuLocation;
  /** Whether the entry can be clicked; generator entries are disabled while no Aspect Model is open. */
  enabled: boolean;
}

/** Sent by the shell with the `PLUGIN_MENU_ACTION` event when a plugin menu entry is clicked. */
export interface PluginMenuAction {
  pluginId: string;
  entryId: string;
}

export interface GithubTokenInfo {
  stored: boolean;
  /** False if the token is only kept in memory for this session because no keychain is available. */
  persistent: boolean;
}

export interface AiSecretInfo {
  stored: boolean;
  /** False if the key is only kept in memory for this session because no keychain is available. */
  persistent: boolean;
}
