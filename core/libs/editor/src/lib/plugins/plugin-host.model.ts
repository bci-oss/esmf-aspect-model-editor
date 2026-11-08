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

import {PluginCommandKind, PluginGenerationResult, PluginImportResult, PluginModel} from '@ame/domain';

export type PluginNotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * The API the editor offers to the user interface of a plugin, version 1. It is set as `host` property of the custom
 * element before the element is added to the page. Documented for plugin authors in the README (section "Plugins").
 */
/** What the user started: the command and, for generators, the open model and the selected element. */
export interface PluginHostContext {
  pluginId: string;
  commandId: string;
  kind: PluginCommandKind;
  /** The open Aspect Model; only for `generate` commands. */
  model: PluginModel | null;
  /** URN of the selected model element, if any. */
  selectedElement: string | null;
}

/** A file to save on the computer of the user; the user chooses the location. */
export interface PluginFileToSave {
  fileName: string;
  content: Blob | string;
  /** Used if the content is a string; defaults to `text/plain`. */
  mediaType?: string;
}

export interface PluginHost {
  readonly apiVersion: number;
  readonly pluginId: string;
  /** Id of the command that opened the plugin. */
  readonly commandId: string;
  /** Kind of the command: `import` or `generate`. */
  readonly kind: PluginCommandKind;
  /** Read-only copy of the open Aspect Model with all unsaved changes; `null` for `import` commands. */
  readonly model: Readonly<PluginModel> | null;
  /** URN of the model element selected in the editor, or `null`. */
  readonly selectedElement: string | null;
  /** Language of the user interface, e.g. `en`, `de` or `zh`. */
  readonly language: string;
  readonly theme: 'light' | 'dark';
  readonly backend: {
    /** Runs an action of the plugin's backend with a JSON payload and resolves with its JSON result. */
    action<T = unknown>(actionId: string, payload?: unknown): Promise<T>;
    /** Converts a file into Aspect Models with an importer of the plugin's backend. */
    importModel(importerId: string, file: File, options?: Record<string, string>): Promise<PluginImportResult>;
    /**
     * Creates files from the open Aspect Model with a generator of the plugin's backend. The selected element is sent
     * unless `request.selectedElement` overrides it (`null` sends none). Only for `generate` commands.
     */
    generate(
      generatorId: string,
      options?: Record<string, string>,
      request?: {selectedElement?: string | null},
    ): Promise<PluginGenerationResult>;
  };
  readonly workspace: {
    /** Opens a model in the editor without saving it; the user decides where to save it. */
    openModel(model: PluginModel): Promise<void>;
  };
  /** Lets the user save a file, e.g. one created by a generator. */
  saveFile(file: PluginFileToSave): Promise<void>;
  /** A file of the plugin's user interface, relative to its `frontend/` folder, e.g. `assets/logo.svg`. */
  resource(path: string): Promise<Blob>;
  notify(message: string, type?: PluginNotificationType): void;
  /** Closes the dialog showing the plugin. */
  close(): void;
}

/** The custom element of a plugin; receives the host before it is connected. */
export interface PluginElement extends HTMLElement {
  host?: PluginHost;
}
