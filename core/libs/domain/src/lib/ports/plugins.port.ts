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
import {PluginGenerationRequest, PluginGenerationResult, PluginImportResult, PluginsOverview, PluginStatus} from '../model-api';

/** Backend API for the installed plugins. Implemented by infrastructure. */
export abstract class PluginsPort {
  abstract getOverview(): Observable<PluginsOverview>;
  /** Installs or updates a plugin from its `.zip`; it is started with the next start of the backend. */
  abstract install(file: File): Observable<PluginStatus>;
  abstract uninstall(id: string): Observable<PluginsOverview>;
  abstract setEnabled(id: string, enabled: boolean): Observable<PluginStatus>;
  /** Runs an action of a running plugin with a JSON payload and emits its JSON result. */
  abstract runAction<T = unknown>(id: string, action: string, payload?: unknown): Observable<T>;
  /** Converts a file into Aspect Models with an importer of a running plugin. */
  abstract importModel(id: string, importer: string, file: File, options?: Record<string, string>): Observable<PluginImportResult>;
  /** Creates files from an Aspect Model with a generator of a running plugin; the model is not changed. */
  abstract generate(id: string, generator: string, request: PluginGenerationRequest): Observable<PluginGenerationResult>;
  /** A file of the user interface of a running plugin, relative to its `frontend/` folder. */
  abstract getFrontendFile(id: string, path: string): Observable<Blob>;
}
