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
import {RefactoringHistoryEntry, RefactoringRequest} from '../model-api';

/**
 * Opens the refactoring dialogs of the editor from layers that must not depend on it (e.g. the sidebar).
 * Implemented by the editor.
 */
export abstract class RefactoringDialogPort {
  /**
   * Lets the user complete the request (e.g. the new name), preview and apply it.
   * Emits the applied refactoring, or `null` if the dialog was cancelled.
   */
  abstract open(request: RefactoringRequest): Observable<RefactoringHistoryEntry | null>;
  /** Shows where the element is referenced across all workspaces and sources. */
  abstract showUsages(urn: string): void;
}
