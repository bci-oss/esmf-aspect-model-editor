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

/** Version of the plugin API the frontend host implements (`host.apiVersion`). */
export const PLUGIN_HOST_API_VERSION = 1;

export type PluginState = 'ACTIVE' | 'FAILED' | 'INACTIVE';
export type PluginMenuLocation = 'file/import' | 'generate' | 'plugins';
/** `import` creates new Aspect Models from files, `generate` creates files from the open Aspect Model (read-only). */
export type PluginCommandKind = 'import' | 'generate';
/** Where a command is offered: the menu bar or the editor toolbar. */
export type PluginCommandPlacement = 'menu' | 'toolbar';

/** The user interface of a plugin: an ES module defining a custom element. */
export interface PluginFrontend {
  /** Path of the module in the archive, below the `frontend/` folder, e.g. `frontend/main.js`. */
  entry: string | null;
  /** Tag name of the custom element the module defines. */
  element: string | null;
}

/** A command a plugin contributes to the editor; the backend has filled in all defaults. */
export interface PluginCommand {
  id: string;
  kind: PluginCommandKind;
  /** Default label; used if there is none for the current language. */
  label: string | null;
  /** Labels per language code, e.g. `{de: 'Aus JSON-Beschreibung importieren...'}`. */
  labels: Record<string, string>;
  /** Name of a Material icon, shown in the toolbar. */
  icon: string;
  placements: PluginCommandPlacement[];
  /** The menu of the menu bar the command is added to if it is placed in the `menu`. */
  menu: PluginMenuLocation;
}

/** An installed plugin as reported by the backend. */
export interface PluginStatus {
  id: string;
  name: string;
  version: string;
  description: string | null;
  state: PluginState;
  enabled: boolean;
  /** The installed version or the enabled flag only take effect after a restart of the backend. */
  restartRequired: boolean;
  error: string | null;
  frontend: PluginFrontend | null;
  commands: PluginCommand[];
  actions: string[];
  importers: string[];
  generators: string[];
}

export interface PluginsOverview {
  pluginApiVersion: number;
  plugins: PluginStatus[];
  /** At least one plugin waits for a restart of the backend. */
  restartRequired: boolean;
}

/** An Aspect Model exchanged with a plugin: created by an importer (not saved yet) or given to a generator. */
export interface PluginModel {
  namespace: string;
  version: string;
  fileName: string;
  /** The model as Turtle. */
  content: string;
}

export interface PluginImportResult {
  models: PluginModel[];
  warnings: string[];
}

/** What a generator gets: the open Aspect Model (read-only), the selected element and the options of the plugin UI. */
export interface PluginGenerationRequest {
  model: PluginModel;
  /** URN of the selected model element, if any. */
  selectedElement: string | null;
  options: Record<string, string>;
}

/** A file created by a generator, as sent by the backend. */
export interface PluginGeneratedFileDto {
  fileName: string;
  mediaType: string;
  /** The content, Base64 encoded. */
  content: string;
}

export interface PluginGenerationResultDto {
  files: PluginGeneratedFileDto[];
  warnings: string[];
}

/** A file created by a generator, ready to be saved. */
export interface PluginGeneratedFile {
  fileName: string;
  mediaType: string;
  content: Blob;
}

export interface PluginGenerationResult {
  files: PluginGeneratedFile[];
  warnings: string[];
}

/** `pending`: the installed version or the enabled flag take effect with the next start of the backend. */
export type PluginDisplayState = 'active' | 'failed' | 'inactive' | 'disabled' | 'pending';

/** A command of a running plugin, ready to be shown in the current language. */
export interface PluginCommandEntry {
  pluginId: string;
  commandId: string;
  kind: PluginCommandKind;
  label: string;
  icon: string;
  placements: PluginCommandPlacement[];
  menu: PluginMenuLocation;
}

/** Folder of the archive containing the user interface; its files are served relative to it. */
export const PLUGIN_FRONTEND_FOLDER = 'frontend/';

/** The path of a frontend file relative to the `frontend/` folder, as expected by the backend. */
export function pluginFrontendPath(path: string): string {
  const normalized = path.replace(/^\.?\/+/, '');
  return normalized.startsWith(PLUGIN_FRONTEND_FOLDER) ? normalized.substring(PLUGIN_FRONTEND_FOLDER.length) : normalized;
}

/** A plugin can be used now if it runs and has a user interface. */
export function isPluginUsable(plugin: PluginStatus): boolean {
  return plugin.state === 'ACTIVE' && !!plugin.frontend?.entry && !!plugin.frontend?.element;
}

/** The label in the language, falling back to the default label, the English label and the id. */
export function pluginCommandLabel(command: PluginCommand, language: string): string {
  return command.labels?.[language] || command.label || command.labels?.['en'] || command.id;
}

/** The commands of all usable plugins in the language, in the order of the plugins and their commands. */
export function pluginCommandEntries(plugins: PluginStatus[], language: string): PluginCommandEntry[] {
  return plugins.filter(isPluginUsable).flatMap(plugin =>
    (plugin.commands ?? []).map(command => ({
      pluginId: plugin.id,
      commandId: command.id,
      kind: command.kind,
      label: pluginCommandLabel(command, language),
      icon: command.icon,
      placements: command.placements,
      menu: command.menu,
    })),
  );
}

/** The commands offered at a placement. */
export function pluginCommandsAt(entries: PluginCommandEntry[], placement: PluginCommandPlacement): PluginCommandEntry[] {
  return entries.filter(entry => entry.placements.includes(placement));
}

/** Like the built-in generators, generator commands need an open Aspect Model. */
export function isPluginCommandEnabled(kind: PluginCommandKind, modelEmpty: boolean): boolean {
  return kind !== 'generate' || !modelEmpty;
}

/** The state of a plugin as shown to the user; a pending restart wins over the current state. */
export function pluginDisplayState(plugin: PluginStatus): PluginDisplayState {
  if (plugin.restartRequired) return 'pending';
  if (plugin.state === 'FAILED') return 'failed';
  if (!plugin.enabled) return 'disabled';
  return plugin.state === 'ACTIVE' ? 'active' : 'inactive';
}

/** The name of a file a plugin wants to save without any folders, `null` if no usable name remains. */
export function pluginSaveFileName(fileName: unknown): string | null {
  const name = String(fileName ?? '')
    .split(/[\\/]/)
    .pop()
    ?.trim();
  return !name || name === '.' || name === '..' ? null : name;
}

/** Converts a generation result of the backend into files that can be saved. */
export function toPluginGenerationResult(dto: PluginGenerationResultDto): PluginGenerationResult {
  return {
    files: dto.files.map(file => ({
      fileName: file.fileName,
      mediaType: file.mediaType,
      content: new Blob([base64ToBytes(file.content)], {type: file.mediaType}),
    })),
    warnings: dto.warnings ?? [],
  };
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
