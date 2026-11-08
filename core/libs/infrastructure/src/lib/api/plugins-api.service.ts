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

import {
  PluginGenerationRequest,
  PluginGenerationResult,
  PluginGenerationResultDto,
  PluginImportResult,
  PluginsOverview,
  PluginsPort,
  PluginStatus,
  toPluginGenerationResult,
} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {map, Observable, timeout} from 'rxjs';

/** Plugin archives may be large and plugin code may run for a while. */
const PLUGIN_TIMEOUT = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 60000;
const JSON_HEADERS = new HttpHeaders({'Content-Type': 'application/json'});

function fileForm(file: File): FormData {
  const body = new FormData();
  body.append('file', file, file.name);
  return body;
}

@Injectable({providedIn: 'root'})
export class PluginsApiService implements PluginsPort {
  private readonly http = inject(HttpClient);
  private readonly backendStatus = inject(BackendStatusService);
  private readonly config: AppConfig = inject(APP_CONFIG);

  private get pluginsUrl(): string {
    return `${this.backendStatus.serviceUrl()}${this.config.api.plugins}`;
  }

  getOverview(): Observable<PluginsOverview> {
    return this.http.get<PluginsOverview>(this.pluginsUrl).pipe(timeout(REQUEST_TIMEOUT));
  }

  install(file: File): Observable<PluginStatus> {
    return this.http.post<PluginStatus>(this.pluginsUrl, fileForm(file)).pipe(timeout(PLUGIN_TIMEOUT));
  }

  uninstall(id: string): Observable<PluginsOverview> {
    return this.http.delete<PluginsOverview>(this.pluginUrl(id)).pipe(timeout(REQUEST_TIMEOUT));
  }

  setEnabled(id: string, enabled: boolean): Observable<PluginStatus> {
    return this.http.put<PluginStatus>(`${this.pluginUrl(id)}/enabled`, {enabled}).pipe(timeout(REQUEST_TIMEOUT));
  }

  runAction<T = unknown>(id: string, action: string, payload?: unknown): Observable<T> {
    // Serialized explicitly so that a missing payload is sent as JSON `null` instead of an empty body.
    return this.http
      .post<T>(`${this.pluginUrl(id)}/actions/${encodeURIComponent(action)}`, JSON.stringify(payload ?? null), {headers: JSON_HEADERS})
      .pipe(timeout(PLUGIN_TIMEOUT));
  }

  importModel(id: string, importer: string, file: File, options?: Record<string, string>): Observable<PluginImportResult> {
    const body = fileForm(file);
    if (options && Object.keys(options).length) body.append('options', JSON.stringify(options));
    return this.http
      .post<PluginImportResult>(`${this.pluginUrl(id)}/importers/${encodeURIComponent(importer)}`, body)
      .pipe(timeout(PLUGIN_TIMEOUT));
  }

  generate(id: string, generator: string, request: PluginGenerationRequest): Observable<PluginGenerationResult> {
    return this.http
      .post<PluginGenerationResultDto>(`${this.pluginUrl(id)}/generators/${encodeURIComponent(generator)}`, request)
      .pipe(timeout(PLUGIN_TIMEOUT), map(toPluginGenerationResult));
  }

  getFrontendFile(id: string, path: string): Observable<Blob> {
    const encodedPath = path
      .split('/')
      .filter(segment => !!segment)
      .map(encodeURIComponent)
      .join('/');
    return this.http.get(`${this.pluginUrl(id)}/frontend/${encodedPath}`, {responseType: 'blob'}).pipe(timeout(REQUEST_TIMEOUT));
  }

  private pluginUrl(id: string): string {
    return `${this.pluginsUrl}/${encodeURIComponent(id)}`;
  }
}
