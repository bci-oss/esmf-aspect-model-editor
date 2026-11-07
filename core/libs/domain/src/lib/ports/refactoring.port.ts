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
import {RefactoringHistoryEntry, RefactoringPreview, RefactoringProgress, RefactoringRequest} from '../model-api';

/** Backend API for refactorings across all files of the writable workspaces. Implemented by infrastructure. */
export abstract class RefactoringPort {
  /** Computes the changes without writing anything. */
  abstract preview(request: RefactoringRequest): Observable<RefactoringPreview>;
  /** Writes the changes; fails with 409 if read-only files are affected and with 423 while another refactoring runs. */
  abstract apply(request: RefactoringRequest): Observable<RefactoringHistoryEntry>;
  /** The progress of the running preview or refactoring. */
  abstract getProgress(): Observable<RefactoringProgress>;
  /** The applied refactorings, the latest first. */
  abstract getHistory(): Observable<RefactoringHistoryEntry[]>;
  /** Restores the files; fails with 409 if they were changed afterwards, unless `force` is set. */
  abstract revert(id: string, force: boolean): Observable<RefactoringHistoryEntry>;
}
