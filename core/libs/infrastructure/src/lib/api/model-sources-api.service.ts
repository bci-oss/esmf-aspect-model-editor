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

import {GithubSourceConfig, GithubSourceStatus, GithubTokenStatus, ModelSource, ModelSourcesPort, WorkspaceConfig} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService, IPC_RENDERER} from '@ame/shared';
import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {defer, from, Observable, of, throwError, timeout} from 'rxjs';

/** A synchronization downloads a whole repository archive, so it may take much longer than other requests. */
const SYNC_TIMEOUT = 10 * 60 * 1000;
const REQUEST_TIMEOUT = 60000;

/**
 * Backend API for workspaces and GitHub sources.
 *
 * In the desktop app, checks and synchronizations run through the shell, which adds the GitHub token from the
 * OS keychain; the token never reaches the web view. Without the shell the backend uses its GITHUB_TOKEN variable.
 */
@Injectable({providedIn: 'root'})
export class ModelSourcesApiService implements ModelSourcesPort {
  private readonly http = inject(HttpClient);
  private readonly backendStatus = inject(BackendStatusService);
  private readonly config: AppConfig = inject(APP_CONFIG);
  private readonly ipc = inject(IPC_RENDERER, {optional: true});

  private get workspacesUrl(): string {
    return `${this.backendStatus.serviceUrl()}${this.config.api.workspaces}`;
  }

  private get githubUrl(): string {
    return `${this.backendStatus.serviceUrl()}${this.config.api.githubSources}`;
  }

  getConfig(): Observable<WorkspaceConfig> {
    return this.http.get<WorkspaceConfig>(this.workspacesUrl).pipe(timeout(REQUEST_TIMEOUT));
  }

  getSources(): Observable<ModelSource[]> {
    return this.http.get<ModelSource[]>(`${this.workspacesUrl}/sources`).pipe(timeout(REQUEST_TIMEOUT));
  }

  addWorkspace(path: string): Observable<WorkspaceConfig> {
    return this.http.post<WorkspaceConfig>(this.workspacesUrl, {path}).pipe(timeout(REQUEST_TIMEOUT));
  }

  removeWorkspace(path: string): Observable<WorkspaceConfig> {
    return this.http.delete<WorkspaceConfig>(this.workspacesUrl, {params: {path}}).pipe(timeout(REQUEST_TIMEOUT));
  }

  getGithubStatuses(): Observable<GithubSourceStatus[]> {
    return this.http.get<GithubSourceStatus[]>(this.githubUrl).pipe(timeout(REQUEST_TIMEOUT));
  }

  addGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.http.post<GithubSourceStatus>(this.githubUrl, source).pipe(timeout(REQUEST_TIMEOUT));
  }

  updateGithubSource(id: string, source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.http.put<GithubSourceStatus>(`${this.githubUrl}/${encodeURIComponent(id)}`, source).pipe(timeout(REQUEST_TIMEOUT));
  }

  removeGithubSource(id: string): Observable<GithubSourceStatus[]> {
    return this.http.delete<GithubSourceStatus[]>(`${this.githubUrl}/${encodeURIComponent(id)}`).pipe(timeout(REQUEST_TIMEOUT));
  }

  checkGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.runAction(source, 'check', REQUEST_TIMEOUT);
  }

  syncGithubSource(source: GithubSourceConfig): Observable<GithubSourceStatus> {
    return this.runAction(source, 'sync', SYNC_TIMEOUT);
  }

  canStoreTokens(): boolean {
    return !!this.ipc?.githubTokenSet;
  }

  getTokenStatus(host: string): Observable<GithubTokenStatus | null> {
    const ipc = this.ipc;
    return ipc?.githubTokenInfo ? defer(() => from(ipc.githubTokenInfo?.(host) ?? Promise.resolve(null))) : of(null);
  }

  setToken(host: string, token: string): Observable<GithubTokenStatus | null> {
    const ipc = this.ipc;
    return ipc?.githubTokenSet ? defer(() => from(ipc.githubTokenSet?.(host, token) ?? Promise.resolve(null))) : of(null);
  }

  deleteToken(host: string): Observable<void> {
    const ipc = this.ipc;
    return ipc?.githubTokenDelete ? defer(() => from(ipc.githubTokenDelete?.(host) ?? Promise.resolve())) : of(undefined);
  }

  canPickDirectory(): boolean {
    return !!this.ipc?.pickDirectory;
  }

  pickDirectory(title?: string): Observable<string | null> {
    const ipc = this.ipc;
    return ipc?.pickDirectory ? defer(() => from(ipc.pickDirectory?.(title) ?? Promise.resolve(null))) : of(null);
  }

  private runAction(source: GithubSourceConfig, action: 'check' | 'sync', limit: number): Observable<GithubSourceStatus> {
    if (!source.id) {
      return throwError(() => new Error('The GitHub source has no id'));
    }
    const ipc = this.ipc;
    if (ipc?.githubSourceAction) {
      const id = source.id;
      const host = source.host || 'github.com';
      return defer(() =>
        from(ipc.githubSourceAction?.<GithubSourceStatus>(id, host, action) ?? throwError(() => new Error('Unavailable'))),
      ).pipe(timeout(limit));
    }
    return this.http.post<GithubSourceStatus>(`${this.githubUrl}/${encodeURIComponent(source.id)}/${action}`, null).pipe(timeout(limit));
  }
}
