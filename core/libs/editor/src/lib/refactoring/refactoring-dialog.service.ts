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

import {
  ConfirmDialogEnum,
  ConfirmDialogPort,
  RefactoringDialogPort,
  RefactoringHistoryEntry,
  RefactoringRequest,
  RefactoringStore,
} from '@ame/domain';
import {LanguageTranslationService, NotificationsService, viewportSafeWidth} from '@ame/shared';
import {HttpErrorResponse} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {EMPTY, Observable} from 'rxjs';
import {catchError, filter, first, map, switchMap, tap} from 'rxjs/operators';
import {ElementUsageDialogComponent, ElementUsageDialogData} from './element-usage-dialog/element-usage-dialog.component';
import {
  RefactoringDialogComponent,
  RefactoringDialogData,
  RefactoringDialogResult,
} from './refactoring-dialog/refactoring-dialog.component';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';
import {inverseChange, inverseRequest} from './refactoring-urns';

/** How long the "applied" notification offers to undo the refactoring. */
const UNDO_TIMEOUT = 10000;

/** Elements can be used in hundreds of places; the list gets most of the screen. */
const USAGE_DIALOG_HEIGHT = 'min(720px, 85vh)';

@Injectable({providedIn: 'root'})
export class RefactoringDialogService implements RefactoringDialogPort {
  private readonly matDialog = inject(MatDialog);
  private readonly refactorings = inject(RefactoringStore);
  private readonly tabSync = inject(RefactoringTabSyncService);
  private readonly confirmDialog = inject(ConfirmDialogPort);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);

  open(request: RefactoringRequest): Observable<RefactoringHistoryEntry | null> {
    return this.matDialog
      .open<RefactoringDialogComponent, RefactoringDialogData, RefactoringDialogResult>(RefactoringDialogComponent, {
        data: {request},
        width: viewportSafeWidth(640),
      })
      .afterClosed()
      .pipe(
        first(),
        // The dialog completes the request with the target the user entered; the tabs must follow that one
        tap(result => result && this.onApplied(result.request, result.entry)),
        map(result => result?.entry ?? null),
      );
  }

  showUsages(urn: string): void {
    this.matDialog.open<ElementUsageDialogComponent, ElementUsageDialogData>(ElementUsageDialogComponent, {
      data: {urn},
      width: viewportSafeWidth(960),
      height: USAGE_DIALOG_HEIGHT,
    });
  }

  /** Restores the files of the refactoring; asks before overwriting changes made afterwards. */
  revert(request: RefactoringRequest, entry: RefactoringHistoryEntry): Observable<RefactoringHistoryEntry> {
    return this.refactorings.revert(entry.id).pipe(
      catchError((error: HttpErrorResponse) => (error?.status === 409 ? this.confirmForcedRevert(entry) : this.failRevert(error))),
      tap(reverted => {
        this.tabSync.synchronize(inverseRequest(request), inverseChange(reverted));
        this.notifications.success({title: this.text('reverted', {description: entry.description})});
      }),
    );
  }

  private onApplied(request: RefactoringRequest, entry: RefactoringHistoryEntry): void {
    this.tabSync.synchronize(request, entry);
    this.notifications.info({
      title: this.text('applied', {description: entry.description}),
      message: this.text('undoHint'),
      timeout: UNDO_TIMEOUT,
      onClick: () => this.revert(request, entry).subscribe(),
    });
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
