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

import {TauriSignalsService} from '@ame/shared';
import {inject, Injectable, signal} from '@angular/core';
import {catchError, defer, EMPTY, exhaustMap, finalize, Observable, tap, timer} from 'rxjs';
import {RefactoringHistoryEntry, RefactoringPreview, RefactoringProgress, RefactoringRequest} from '../../model-api';
import {RefactoringPort} from '../../ports/refactoring.port';
import {WorkspaceNamespacesService} from '../workspace/workspace-namespaces.service';
import {WorkspaceStore} from '../workspace/workspace.store';

/** Quick refactorings of small workspaces finish before the progress is polled at all. */
export const REFACTORING_PROGRESS_DELAY = 400;
export const REFACTORING_PROGRESS_INTERVAL = 500;

/** State of the refactorings across the workspaces: the running request and the revertible history. */
@Injectable({providedIn: 'root'})
export class RefactoringStore {
  private readonly api = inject(RefactoringPort);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly workspaceNamespaces = inject(WorkspaceNamespacesService);
  private readonly tauriSignals = inject(TauriSignalsService, {optional: true});

  /** The applied refactorings, the latest first. */
  readonly history = signal<RefactoringHistoryEntry[]>([]);
  /** Whether a preview, an application or a revert is running. */
  readonly busy = signal(false);
  /** The progress of a long-running preview or application; null while unknown. */
  readonly progress = signal<RefactoringProgress | null>(null);

  preview(request: RefactoringRequest): Observable<RefactoringPreview> {
    return this.whileBusy(this.withProgress(this.api.preview(request)));
  }

  /** Writes the changes and reloads the model list of all windows. */
  apply(request: RefactoringRequest): Observable<RefactoringHistoryEntry> {
    return this.whileBusy(this.withProgress(this.api.apply(request))).pipe(
      tap(entry => {
        this.history.update(history => [entry, ...history.filter(existing => existing.id !== entry.id)]);
        this.reloadWorkspace();
      }),
    );
  }

  /** Restores the files of a refactoring; `force` overwrites changes made afterwards. */
  revert(id: string, force = false): Observable<RefactoringHistoryEntry> {
    return this.whileBusy(this.api.revert(id, force)).pipe(
      tap(() => {
        this.history.update(history => history.filter(entry => entry.id !== id));
        this.reloadWorkspace();
      }),
    );
  }

  loadHistory(): Observable<RefactoringHistoryEntry[]> {
    return this.api.getHistory().pipe(tap(history => this.history.set(history)));
  }

  private reloadWorkspace(): void {
    this.workspaceNamespaces.clear();
    this.workspaceStore.triggerRefresh();
    this.tauriSignals?.call('requestRefreshWorkspaces');
  }

  /** Polls the backend's progress while the request runs. */
  private withProgress<T>(request: Observable<T>): Observable<T> {
    return defer(() => {
      const polling = timer(REFACTORING_PROGRESS_DELAY, REFACTORING_PROGRESS_INTERVAL)
        .pipe(exhaustMap(() => this.api.getProgress().pipe(catchError(() => EMPTY))))
        .subscribe(progress => this.progress.set(progress.running ? progress : null));
      return request.pipe(
        finalize(() => {
          polling.unsubscribe();
          this.progress.set(null);
        }),
      );
    });
  }

  private whileBusy<T>(request: Observable<T>): Observable<T> {
    this.busy.set(true);
    return request.pipe(finalize(() => this.busy.set(false)));
  }
}
