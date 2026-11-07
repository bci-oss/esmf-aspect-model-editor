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

/** The structural changes the backend applies to all affected files of the writable workspaces. */
export type RefactoringType = 'RENAME_ELEMENT' | 'MOVE_ELEMENT' | 'RENAME_NAMESPACE' | 'NEW_VERSION' | 'RENAME_FILE';

export type VersionIncrease = 'MAJOR' | 'MINOR' | 'MICRO';

/** Only the fields of the selected type are evaluated; see the backend's `RefactoringRequest`. */
export interface RefactoringRequest {
  type: RefactoringType;
  /** The element to rename or move. */
  urn?: string;
  /** The new local element name or the new file name. */
  newName?: string;
  /** The namespace, version and optionally file a namespace, version or file change starts from. */
  namespace?: string;
  version?: string;
  fileName?: string;
  /** The workspace path the file belongs to; omitted to search all workspaces. */
  source?: string;
  targetNamespace?: string;
  targetVersion?: string;
  targetFileName?: string;
  /** The workspace path a new target file is created in; the source file's workspace if omitted. */
  targetWorkspace?: string;
  increase?: VersionIncrease;
}

export interface ChangedFile {
  namespace: string;
  version: string;
  fileName: string;
  path: string;
  readOnly: boolean;
}

/** The changes a refactoring would make, without writing anything. */
export interface RefactoringPreview {
  description: string;
  /** The detailed change report of the SDK. */
  report: string;
  created: ChangedFile[];
  modified: ChangedFile[];
  removed: ChangedFile[];
  /** Read-only files (e.g. GitHub sources) the refactoring would have to change; it cannot be applied then. */
  blocked: ChangedFile[];
  applicable: boolean;
}

/** An applied refactoring that can be reverted as long as the files were not changed afterwards. */
export interface RefactoringHistoryEntry {
  id: string;
  description: string;
  timestamp: number;
  created: ChangedFile[];
  modified: ChangedFile[];
  removed: ChangedFile[];
}

/** The phases a running refactoring passes, in this order; a preview ends after planning. */
export type RefactoringPhase = 'LOADING' | 'PLANNING' | 'WRITING';

/** The progress of the running preview or refactoring, reported by the backend for large workspaces. */
export interface RefactoringProgress {
  running: boolean;
  /** Null until the first phase starts. */
  phase: RefactoringPhase | null;
  /** The number of the current phase, starting at 1. */
  step: number;
  steps: number;
  /** The number of files processed in the current phase. */
  files: number;
}

/** All files a refactoring touches. */
export function changedFilesOf(change: Pick<RefactoringHistoryEntry, 'created' | 'modified' | 'removed'>): ChangedFile[] {
  return [...change.created, ...change.modified, ...change.removed];
}
