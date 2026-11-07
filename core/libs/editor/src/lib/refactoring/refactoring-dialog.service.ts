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

import {RefactoringDialogOptions, RefactoringDialogPort, RefactoringHistoryEntry, RefactoringRequest} from '@ame/domain';
import {LanguageTranslationService, NotificationsService, viewportSafeWidth} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {Observable} from 'rxjs';
import {first, map, tap} from 'rxjs/operators';
import {ElementUsageDialogComponent, ElementUsageDialogData} from './element-usage-dialog/element-usage-dialog.component';
import {
  RefactoringDialogComponent,
  RefactoringDialogData,
  RefactoringDialogResult,
} from './refactoring-dialog/refactoring-dialog.component';
import {RefactoringHistoryDialogComponent} from './refactoring-history-dialog/refactoring-history-dialog.component';
import {RefactoringRevertService} from './refactoring-revert.service';
import {RefactoringTabSyncService} from './refactoring-tab-sync.service';
import {RefactoringWindowSyncService} from './refactoring-window-sync.service';

/** How long the "applied" notification offers to undo the refactoring. */
const UNDO_TIMEOUT = 10000;

/** Elements can be used in hundreds of places and the history can be long; the lists get most of the screen. */
const LIST_DIALOG_HEIGHT = 'min(720px, 85vh)';

@Injectable({providedIn: 'root'})
export class RefactoringDialogService implements RefactoringDialogPort {
  private readonly matDialog = inject(MatDialog);
  private readonly tabSync = inject(RefactoringTabSyncService);
  private readonly reverter = inject(RefactoringRevertService);
  private readonly windowSync = inject(RefactoringWindowSyncService);
  private readonly notifications = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);

  open(request: RefactoringRequest, options: RefactoringDialogOptions = {}): Observable<RefactoringHistoryEntry | null> {
    return this.matDialog
      .open<RefactoringDialogComponent, RefactoringDialogData, RefactoringDialogResult>(RefactoringDialogComponent, {
        data: {request, pendingSaveTabId: options.pendingSaveTabId},
        width: viewportSafeWidth(640),
      })
      .afterClosed()
      .pipe(
        first(),
        // The dialog completes the request with the target the user entered; the tabs must follow that one
        tap(result => result && this.onApplied(result.request, result.entry, options.pendingSaveTabId)),
        map(result => result?.entry ?? null),
      );
  }

  showUsages(urn: string): void {
    this.matDialog.open<ElementUsageDialogComponent, ElementUsageDialogData>(ElementUsageDialogComponent, {
      data: {urn},
      width: viewportSafeWidth(960),
      height: LIST_DIALOG_HEIGHT,
    });
  }

  showHistory(): void {
    this.matDialog.open(RefactoringHistoryDialogComponent, {width: viewportSafeWidth(760), height: LIST_DIALOG_HEIGHT});
  }

  private onApplied(request: RefactoringRequest, entry: RefactoringHistoryEntry, pendingSaveTabId?: string): void {
    this.tabSync.synchronize(request, entry, tab => tab.id === pendingSaveTabId);
    this.windowSync.publish(request, entry);
    this.notifications.info({
      title: this.text('applied', {description: entry.description}),
      message: this.text('undoHint'),
      timeout: UNDO_TIMEOUT,
      onClick: () => this.reverter.revert(request, entry).subscribe(),
    });
  }

  private text(key: string, params?: Record<string, string>): string {
    return this.translate.translateService.translate(`refactoring.notification.${key}`, params);
  }
}
