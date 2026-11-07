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

import {ConfirmDialogEnum, ConfirmDialogPort, RefactoringHistoryEntry, RefactoringRequest, RefactoringStore} from '@ame/domain';
import {LanguageTranslationService, NotificationsService} from '@ame/shared';
import {HttpErrorResponse} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {EMPTY, Observable} from 'rxjs';
import {catchError, filter, switchMap, tap} from 'rxjs/operators';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';
import {inverseChange, inverseRequest} from './refactoring-urns';
import {RefactoringWindowSyncService} from './refactoring-window-sync.service';

/** Undoes applied refactorings, from the "applied" notification or from the history. */
@Injectable({providedIn: 'root'})
export class RefactoringRevertService {
  private readonly refactorings = inject(RefactoringStore);
  private readonly tabSync = inject(RefactoringTabSyncService);
  private readonly windowSync = inject(RefactoringWindowSyncService);
  private readonly confirmDialog = inject(ConfirmDialogPort);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);

  /**
   * Restores the files of the refactoring; asks before overwriting changes made afterwards.
   *
   * @param request the applied refactoring; refactorings recorded by older versions do not know it
   */
  revert(request: RefactoringRequest | undefined, entry: RefactoringHistoryEntry): Observable<RefactoringHistoryEntry> {
    return this.refactorings.revert(entry.id).pipe(
      catchError((error: HttpErrorResponse) => (error?.status === 409 ? this.confirmForcedRevert(entry) : this.failRevert(error))),
      tap(reverted => {
        const undo = request && inverseRequest(request);
        const change = inverseChange(reverted);
        this.tabSync.synchronize(undo, change);
        this.windowSync.publish(undo, change);
        this.notifications.success({title: this.text('reverted', {description: entry.description})});
      }),
    );
  }

  private confirmForcedRevert(entry: RefactoringHistoryEntry): Observable<RefactoringHistoryEntry> {
    return this.confirmDialog
      .open({
        title: this.text('revertConflict.title'),
        phrases: [this.text('revertConflict.phrase', {description: entry.description})],
        okButtonText: this.text('revertConflict.ok'),
        closeButtonText: this.text('revertConflict.cancel'),
      })
      .pipe(
        filter(result => result === ConfirmDialogEnum.ok),
        switchMap(() => this.refactorings.revert(entry.id, true)),
        catchError(error => this.failRevert(error)),
      );
  }

  private failRevert(error: HttpErrorResponse): Observable<never> {
    this.notifications.error({
      title: this.text('revertFailed'),
      message: error?.error?.error?.message || error?.error?.message || error?.message || '',
      timeout: 5000,
    });
    return EMPTY;
  }

  private text(key: string, params?: Record<string, string>): string {
    return this.translate.translateService.translate(`refactoring.notification.${key}`, params);
  }
}
