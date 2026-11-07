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

import {RefactoringHistoryEntry, RefactoringPort, RefactoringPreview, RefactoringProgress, RefactoringRequest} from '@ame/domain';
import {APP_CONFIG, AppConfig, BackendStatusService} from '@ame/shared';
import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable, timeout} from 'rxjs';

/** Loading and rewriting all files of large workspaces may take a while. */
const REFACTORING_TIMEOUT = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 60000;

@Injectable({providedIn: 'root'})
export class RefactoringApiService implements RefactoringPort {
  private readonly http = inject(HttpClient);
  private readonly backendStatus = inject(BackendStatusService);
  private readonly config: AppConfig = inject(APP_CONFIG);

  private get refactoringUrl(): string {
    return `${this.backendStatus.serviceUrl()}${this.config.api.refactoring}`;
  }

  preview(request: RefactoringRequest): Observable<RefactoringPreview> {
    return this.http.post<RefactoringPreview>(`${this.refactoringUrl}/preview`, request).pipe(timeout(REFACTORING_TIMEOUT));
  }

  apply(request: RefactoringRequest): Observable<RefactoringHistoryEntry> {
    return this.http.post<RefactoringHistoryEntry>(`${this.refactoringUrl}/apply`, request).pipe(timeout(REFACTORING_TIMEOUT));
  }

  getProgress(): Observable<RefactoringProgress> {
    return this.http.get<RefactoringProgress>(`${this.refactoringUrl}/progress`).pipe(timeout(REQUEST_TIMEOUT));
  }

  getHistory(): Observable<RefactoringHistoryEntry[]> {
    return this.http.get<RefactoringHistoryEntry[]>(`${this.refactoringUrl}/history`).pipe(timeout(REQUEST_TIMEOUT));
  }

  revert(id: string, force: boolean): Observable<RefactoringHistoryEntry> {
    return this.http
      .post<RefactoringHistoryEntry>(`${this.refactoringUrl}/history/${encodeURIComponent(id)}/revert`, null, {
        params: {force: String(force)},
      })
      .pipe(timeout(REFACTORING_TIMEOUT));
  }
}
