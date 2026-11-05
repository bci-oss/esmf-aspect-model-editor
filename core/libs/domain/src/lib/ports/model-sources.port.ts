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

import {Observable} from 'rxjs';
import {GithubSourceConfig, GithubSourceStatus, GithubTokenStatus, ModelSource, WorkspaceConfig} from '../model-api';

/** Backend API for the local workspaces and the read-only GitHub sources. Implemented by infrastructure. */
export abstract class ModelSourcesPort {
  abstract getConfig(): Observable<WorkspaceConfig>;
  /** All sources in resolution order: workspaces first, then the synchronized GitHub sources. */
  abstract getSources(): Observable<ModelSource[]>;
  abstract addWorkspace(path: string): Observable<WorkspaceConfig>;
  abstract removeWorkspace(path: string): Observable<WorkspaceConfig>;

  abstract getGithubStatuses(): Observable<GithubSourceStatus[]>;
  abstract addGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus>;
  abstract updateGithubSource(id: string, source: GithubSourceConfig): Observable<GithubSourceStatus>;
  abstract removeGithubSource(id: string): Observable<GithubSourceStatus[]>;
  /** Asks GitHub for the latest commit; never changes the local copy. */
  abstract checkGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus>;
  /** Downloads the latest commit and replaces the local copy. */
  abstract syncGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus>;

  /** Whether tokens can be stored securely (desktop app). The web version uses the backend's GITHUB_TOKEN variable. */
  abstract canStoreTokens(): boolean;
  abstract getTokenStatus(host: string): Observable<GithubTokenStatus | null>;
  abstract setToken(host: string, token: string): Observable<GithubTokenStatus | null>;
  abstract deleteToken(host: string): Observable<void>;

  /** Whether a native folder picker is available (desktop app). */
  abstract canPickDirectory(): boolean;
  abstract pickDirectory(title?: string): Observable<string | null>;
}
