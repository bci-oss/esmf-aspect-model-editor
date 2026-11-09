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

export interface MigrationStatus {
  success: string;
  errors: string[];
}

/** Identifies a model file; `workspace` is the root of the source that contains it (searched in all sources if omitted). */
export interface ModelFileLocation {
  namespace: string;
  version: string;
  fileName: string;
  workspace?: string;
}

export interface StoragePathResponse {
  path: string;
  storagePath: string;
}

/** Where an element is declared: the absolute path of its workspace file and the 1-based position of its declaration. */
export interface ElementLocation {
  path: string;
  line: number;
  column: number;
}

/** A workspace file that uses elements of a namespace or file that is about to be deleted. */
export interface ModelReference {
  namespace: string;
  version: string;
  fileName: string;
  referencedElements: string[];
}

/** A workspace file that could not be read while checking references; it blocks deleting. */
export interface UnreadableModelFile {
  namespace: string;
  version: string;
  fileName: string;
  message: string;
}

/**
 * Whether a namespace or file can be deleted. Only incoming references count:
 * other files using its elements. What it uses itself does not matter.
 */
export interface ReferenceReport {
  deletable: boolean;
  references: ModelReference[];
  unreadableFiles: UnreadableModelFile[];
}

export interface ClearWorkspaceResult {
  deletedFiles: number;
  backupCreated: boolean;
}

/**
 * Feature-facing workspace operations (storage, model files, migration).
 * Implemented by the infrastructure layer (backend API) and bound in provideAmeInfrastructure().
 */
export abstract class WorkspaceFacade {
  /** Root of the active workspace, or the absolute path of `file` in the workspace or GitHub source containing it. */
  abstract getStoragePath(file?: ModelFileLocation): Observable<StoragePathResponse>;
  /**
   * Fails with HTTP 404 if no workspace file declares the element.
   * `fileName` names the file of the element's namespace version to look in first, if several files declare it.
   */
  abstract getElementLocation(aspectModelUrn: string, fileName?: string): Observable<ElementLocation>;
  abstract fetchAspectMetaModel(aspectModelUrn: string): Observable<{content: string; sourceLocation: string | null}>;
  abstract deleteAspectModel(aspectModelUrn: string): Observable<string>;
  /** Checks a namespace version, or a single file of it if `fileName` is given. */
  /** `workspace` selects the workspace if the namespace exists in several ones. */
  abstract getReferences(namespace: string, version: string, fileName?: string, workspace?: string): Observable<ReferenceReport>;
  /** Fails with HTTP 409 and the ReferenceReport as body if the namespace is still used. */
  abstract deleteNamespace(namespace: string, version: string, workspace?: string): Observable<ReferenceReport>;
  /** Clears the given workspace, the active one if omitted. */
  abstract clearWorkspace(backup: boolean, workspace?: string): Observable<ClearWorkspaceResult>;
  abstract hasFilesToMigrate(): Observable<boolean>;
  abstract createBackup(): Observable<string>;
  abstract migrateWorkspace(setNewVersion: boolean): Observable<MigrationStatus>;
  abstract importNamespaces(zip: File): Observable<unknown>;
}
