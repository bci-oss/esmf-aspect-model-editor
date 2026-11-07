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

import {ModelValidationStore, QuickFix, ViolationError} from '@ame/domain';
import {LanguageTranslationService, NotificationModel, NotificationsService} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {catchError, Observable, of, take, tap} from 'rxjs';
import {ModelHistoryService} from '../history/model-history.service';
import {ModelSavingTrackerService} from '../model-saving-tracker.service';
import {TabStateService} from '../tabs/tab-state.service';
import {applyQuickFix} from './quick-fix-literals';

/**
 * Applies the quick fixes the validation offers for a violation, e.g. adds the missing language tag of a description.
 * A quick fix is a change of the model like every other one: it marks the tab as changed and can be undone.
 */
@Injectable({providedIn: 'root'})
export class QuickFixService {
  private readonly validationStore = inject(ModelValidationStore);
  private readonly modelHistory = inject(ModelHistoryService);
  private readonly modelSavingTracker = inject(ModelSavingTrackerService);
  private readonly tabStateService = inject(TabStateService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly translate = inject(LanguageTranslationService);

  /** The quick fixes of the violation a notification of the validation reports. */
  fixesOf(notification: NotificationModel | null): QuickFix[] {
    if (!notification?.link) return [];
    return this.validationStore
      .violations()
      .filter(violation => isReportedBy(violation, notification))
      .flatMap(violation => violation.quickFixes ?? []);
  }

  /** Emits whether the fix was applied; errors are shown to the user. */
  apply(fix: QuickFix, notification?: NotificationModel): Observable<boolean> {
    return this.modelHistory
      .applyModelChange(rdfModel => applyQuickFix(rdfModel.store, fix))
      .pipe(
        tap(applied => (applied ? this.onApplied(fix, notification) : this.onOutdated())),
        catchError(error => {
          console.error(error);
          this.notificationsService.error({title: this.translation('failed')});
          return of(false);
        }),
      );
  }

  private onApplied(fix: QuickFix, notification?: NotificationModel): void {
    this.validationStore.setViolations(this.validationStore.violations().filter(violation => !violation.quickFixes?.includes(fix)));
    if (notification) this.notificationsService.clearNotifications([notification]);
    this.markTabChanged();
    this.notificationsService.success({title: this.translation('applied'), message: fix.description});
  }

  private onOutdated(): void {
    this.notificationsService.warning({title: this.translation('outdated'), timeout: 5000});
  }

  private markTabChanged(): void {
    this.modelSavingTracker.isSaved$.pipe(take(1)).subscribe(isSaved => {
      const activeTabId = this.tabStateService.activeTabId();
      if (activeTabId) this.tabStateService.setTabDirty(activeTabId, !isSaved);
    });
  }

  private translation(key: string): string {
    return this.translate.translateService.translate(`quickFix.${key}`);
  }
}

/** The validation notifies every violation with its message as title and its focus node as link. */
function isReportedBy(violation: ViolationError, notification: NotificationModel): boolean {
  return violation.focusNode === notification.link && violation.message === notification.title;
}
