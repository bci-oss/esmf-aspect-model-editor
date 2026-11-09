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

export type ExternalEditor = 'vscode' | 'vscode-insiders' | 'cursor' | 'vscodium';

export const EXTERNAL_EDITORS: readonly ExternalEditor[] = ['vscode', 'vscode-insiders', 'cursor', 'vscodium'];

export const DEFAULT_EXTERNAL_EDITOR: ExternalEditor = 'vscode';

export const EXTERNAL_EDITOR_NAMES: Readonly<Record<ExternalEditor, string>> = {
  vscode: 'VS Code',
  'vscode-insiders': 'VS Code Insiders',
  cursor: 'Cursor',
  vscodium: 'VSCodium',
};

/** Command line launchers, used by the desktop app if the editor URL scheme is not registered. */
export const EXTERNAL_EDITOR_CLI: Readonly<Record<ExternalEditor, string>> = {
  vscode: 'code',
  'vscode-insiders': 'code-insiders',
  cursor: 'cursor',
  vscodium: 'codium',
};

/** 1-based position inside a file. */
export interface TextPosition {
  line: number;
  column?: number;
}

const DRIVE_SEGMENT = /^[A-Za-z]:$/;
const DRIVE_PATH = /^\/[A-Za-z]:(\/|$)/;

export function isExternalEditor(value: unknown): value is ExternalEditor {
  return EXTERNAL_EDITORS.includes(value as ExternalEditor);
}

export function resolveExternalEditor(value: unknown): ExternalEditor {
  return isExternalEditor(value) ? value : DEFAULT_EXTERNAL_EDITOR;
}

/**
 * Builds the URL that opens an absolute file or folder path of any OS in the editor,
 * e.g. `vscode://file/C:/ws/a.ttl:12:3`, `vscode://file/Users/me/a.ttl` or `vscode://file//server/share/a.ttl`.
 */
export function buildExternalEditorUrl(editor: ExternalEditor, absolutePath: string, position?: TextPosition): string {
  return `${editor}://file/${toUrlPath(absolutePath)}${toPositionSuffix(position)}`;
}

/** Converts a `file:` URI to an OS path (`/Users/a.ttl`, `C:/ws/a.ttl` or `//server/share/a.ttl`); other values are returned unchanged. */
export function fileUriToPath(uri: string): string {
  if (!/^file:/i.test(uri)) return uri;

  let path = uri.slice('file:'.length);
  let host = '';
  if (path.startsWith('//')) {
    const authorityEnd = path.indexOf('/', 2);
    host = authorityEnd < 0 ? path.slice(2) : path.slice(2, authorityEnd);
    path = authorityEnd < 0 ? '/' : path.slice(authorityEnd);
  }

  const decoded = path.split('/').map(safeDecode).join('/');
  if (host && host.toLowerCase() !== 'localhost') return `//${host}${decoded}`;
  return DRIVE_PATH.test(decoded) ? decoded.slice(1) : decoded;
}

/** Parent directory of a `/` or `\` separated path; roots (`/`, `C:\`) are their own parent. */
export function parentDirectory(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  if (!trimmed || DRIVE_SEGMENT.test(trimmed)) return path;

  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (separatorIndex < 0) return '';

  const parent = trimmed.slice(0, separatorIndex);
  const separator = trimmed[separatorIndex];
  if (!parent) return separator;
  return DRIVE_SEGMENT.test(parent) ? parent + separator : parent;
}

/**
 * Returns a copy of the translations with the `{{editor}}` placeholder of the native menu labels replaced by the editor name.
 * The native menu labels are not rendered by the translation service, so the placeholder is resolved before they are sent.
 */
export function withExternalEditorMenuLabels<T>(translation: T, editorName: string): T {
  const menu = (translation as {menu?: Record<string, unknown>} | null)?.menu;
  if (!menu || typeof menu !== 'object') return translation;
  return {...translation, menu: replaceEditorPlaceholder(menu, editorName)};
}

function replaceEditorPlaceholder<T>(value: T, editorName: string): T {
  if (typeof value === 'string') return value.replace(/\{\{\s*editor\s*\}\}/g, editorName) as T;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceEditorPlaceholder(entry, editorName)])) as T;
}

function toUrlPath(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const segments = normalized
    .split('/')
    .filter(segment => segment.length > 0)
    .map((segment, index) => (index === 0 && DRIVE_SEGMENT.test(segment) ? segment : encodeURIComponent(segment)));
  const uncPrefix = normalized.startsWith('//') ? '/' : '';
  return uncPrefix + segments.join('/');
}

function toPositionSuffix(position?: TextPosition): string {
  if (!isValidPosition(position?.line)) return '';
  return isValidPosition(position.column) ? `:${position.line}:${position.column}` : `:${position.line}`;
}

function isValidPosition(value: number | undefined): value is number {
  return Number.isInteger(value) && value >= 1;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
