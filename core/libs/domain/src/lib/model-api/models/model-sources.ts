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

/** A directory models are read from: a local workspace or the local copy of a GitHub source. */
export interface ModelSource {
  type: 'workspace' | 'github';
  /** The absolute path for workspaces, the configured id for GitHub sources. */
  id: string;
  /** Folder name for workspaces, `owner/repo@ref[/dir]` for GitHub sources. */
  name: string;
  path: string;
  readOnly: boolean;
  defaultWorkspace: boolean;
}

export type GithubRefType = 'branch' | 'tag';

export interface GithubSourceConfig {
  id?: string;
  host?: string;
  owner: string;
  repository: string;
  refType?: GithubRefType;
  ref: string;
  directory?: string;
  enabled?: boolean;
}

export interface WorkspaceConfig {
  version: number;
  /** Absolute paths of the writable workspaces, the default workspace first. */
  workspaces: string[];
  githubSources: GithubSourceConfig[];
}

export interface GithubSourceStatus {
  source: GithubSourceConfig;
  path: string;
  synced: boolean;
  syncedSha?: string | null;
  syncedAt?: string | null;
  remoteSha?: string | null;
  checkedAt?: string | null;
  updateAvailable: boolean;
  lastError?: string | null;
}

export interface GithubTokenStatus {
  stored: boolean;
  persistent: boolean;
}

/**
 * Parses a GitHub repository URL like `https://github.com/owner/repo`, `.../tree/main/models` or `owner/repo`.
 * Returns null if it is not a repository reference.
 */
export function parseGithubRepositoryUrl(
  input: string,
): {host: string; owner: string; repository: string; ref?: string; directory?: string} | null {
  const value = input
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  if (!value) return null;

  const shorthand = /^([\w.-]+)\/([\w.-]+)$/.exec(value);
  if (shorthand) {
    return {host: 'github.com', owner: shorthand[1], repository: shorthand[2]};
  }

  const ssh = /^git@([\w.-]+):([\w.-]+)\/([\w.-]+)$/.exec(value);
  if (ssh) {
    return {host: ssh[1], owner: ssh[2], repository: ssh[3]};
  }

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2) return null;

  const [owner, repository, kind, ref, ...rest] = segments;
  const result: {host: string; owner: string; repository: string; ref?: string; directory?: string} = {
    host: url.hostname.toLowerCase(),
    owner,
    repository,
  };
  if ((kind === 'tree' || kind === 'blob') && ref) {
    result.ref = ref;
    if (rest.length) result.directory = rest.join('/');
  }
  return result;
}

/** Converts a `file:` URI (as returned for `sourceLocation`) to a comparable path with forward slashes. */
export function normalizeSourcePath(pathOrUri: string | null | undefined): string {
  if (!pathOrUri) return '';
  let path = pathOrUri;
  if (/^file:/i.test(path)) {
    path = path.replace(/^file:(\/\/)?/i, '');
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the raw path
    }
  }
  path = path.replace(/\\/g, '/').replace(/\/+$/, '');
  // `/C:/models` (from file:///C:/models) -> `C:/models`; Windows paths are compared case-insensitively.
  if (/^\/[a-zA-Z]:\//.test(path)) path = path.substring(1);
  return /^[a-zA-Z]:\//.test(path) ? path.toLowerCase() : path;
}

/** Whether the file (path or `file:` URI) is inside the source directory. */
export function isInSource(source: Pick<ModelSource, 'path'>, pathOrUri: string | null | undefined): boolean {
  const file = normalizeSourcePath(pathOrUri);
  const root = normalizeSourcePath(source.path);
  return !!file && !!root && (file === root || file.startsWith(root + '/'));
}

/** The message of a failed source request: an HTTP error with the backend error body, or the error text of the desktop shell. */
export function describeSourceError(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const value = error as {error?: {error?: {message?: string}; message?: string} | string; message?: string};
  if (typeof value.error === 'string') return value.error;
  return value.error?.error?.message || value.error?.message || value.message || '';
}
